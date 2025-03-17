import io from 'socket.io-client';
import { GameSettings } from '../core/GameSettings';
import { GameEvents } from '../core/GameEvents';
import { Synchronizer } from './Synchronizer';
import { TokenService } from '../blockchain/services/TokenService';

/**
 * NetworkManager
 * 
 * Handles all network communication for the SkyWars multiplayer game,
 * including connection management, authentication, and message routing.
 * Optimized for low-latency flight gameplay with blockchain integration.
 */
export class NetworkManager {
  constructor(gameInstance) {
    this.gameInstance = gameInstance;
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000; // Start with 2s, will increase exponentially
    
    // Server time synchronization
    this.serverTimeOffset = 0;
    this.pingHistory = [];
    this.pingHistoryMaxSize = 10;
    this.avgPing = 0;
    
    // Message queues for reliable delivery
    this.reliableQueue = [];
    this.unreliableQueue = [];
    
    // Track in-flight messages
    this.pendingMessages = new Map();
    this.messageIdCounter = 0;
    
    // Synchronization system
    this.synchronizer = new Synchronizer(this);
    
    // Authentication state
    this.authToken = null;
    this.userId = null;
    this.sessionId = null;
    
    // Session data
    this.gameSession = null;
    this.players = new Map(); // Map of player IDs to player data
    
    // Statistics
    this.stats = {
      bytesSent: 0,
      bytesReceived: 0,
      messagesSent: 0,
      messagesReceived: 0,
      lastReconnect: null,
      disconnections: 0
    };
    
    // Throttling configuration
    this.updateRateHz = GameSettings.get('networkUpdateRate') || 20; // 20 updates per second default
    this.updateInterval = 1000 / this.updateRateHz;
    this.lastUpdateTime = 0;
    
    // Register game event handlers
    this.registerGameEvents();
    
    // Blockchain connectivity
    this.tokenService = new TokenService();
    this.isWalletConnected = false;
  }
  
  /**
   * Initialize the network connection
   * @param {Object} options Connection options
   * @returns {Promise} Resolves when connected
   */
  async connect(options = {}) {
    if (this.isConnected) {
      console.warn('Already connected to server');
      return;
    }
    
    // Default connection options
    const defaultOptions = {
      serverUrl: GameSettings.get('serverUrl') || 'https://api.skywars-game.com',
      autoReconnect: true,
      authToken: localStorage.getItem('authToken'),
      region: GameSettings.get('region') || 'auto'
    };
    
    const connectionOptions = { ...defaultOptions, ...options };
    this.authToken = connectionOptions.authToken;
    
    // Configure socket.io
    const socketOptions = {
      auth: {
        token: this.authToken
      },
      query: {
        region: connectionOptions.region,
        gameVersion: GameSettings.get('gameVersion') || '1.0.0',
        deviceInfo: JSON.stringify({
          platform: navigator.platform,
          userAgent: navigator.userAgent,
          webGL: this.getWebGLInfo()
        })
      },
      transports: ['websocket'],
      reconnection: connectionOptions.autoReconnect,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      reconnectionDelayMax: 10000,
      timeout: 10000
    };
    
    try {
      console.log(`Connecting to server: ${connectionOptions.serverUrl}`);
      this.socket = io(connectionOptions.serverUrl, socketOptions);
      
      // Set up event listeners
      this.setupSocketListeners();
      
      // Wait for connection
      return new Promise((resolve, reject) => {
        const connectionTimeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 15000);
        
        this.socket.once('connect', () => {
          clearTimeout(connectionTimeout);
          resolve();
        });
        
        this.socket.once('connect_error', (error) => {
          clearTimeout(connectionTimeout);
          reject(error);
        });
      });
    } catch (error) {
      console.error('Failed to connect to server:', error);
      throw error;
    }
  }
  
  /**
   * Set up socket event listeners
   */
  setupSocketListeners() {
    // Connection events
    this.socket.on('connect', this.handleConnect.bind(this));
    this.socket.on('disconnect', this.handleDisconnect.bind(this));
    this.socket.on('reconnect', this.handleReconnect.bind(this));
    this.socket.on('reconnect_attempt', this.handleReconnectAttempt.bind(this));
    this.socket.on('error', this.handleError.bind(this));
    
    // Authentication events
    this.socket.on('auth:success', this.handleAuthSuccess.bind(this));
    this.socket.on('auth:error', this.handleAuthError.bind(this));
    this.socket.on('auth:required', this.handleAuthRequired.bind(this));
    
    // Game session events
    this.socket.on('session:joined', this.handleSessionJoined.bind(this));
    this.socket.on('session:left', this.handleSessionLeft.bind(this));
    this.socket.on('session:state', this.handleSessionState.bind(this));
    this.socket.on('session:players', this.handlePlayersUpdate.bind(this));
    
    // Game state updates
    this.socket.on('state:update', this.handleStateUpdate.bind(this));
    this.socket.on('state:snapshot', this.handleStateSnapshot.bind(this));
    this.socket.on('state:reconcile', this.handleStateReconciliation.bind(this));
    
    // Player-specific events
    this.socket.on('player:joined', this.handlePlayerJoined.bind(this));
    this.socket.on('player:left', this.handlePlayerLeft.bind(this));
    this.socket.on('player:update', this.handlePlayerUpdate.bind(this));
    
    // Game mechanics events
    this.socket.on('aircraft:spawn', this.handleAircraftSpawn.bind(this));
    this.socket.on('aircraft:destroy', this.handleAircraftDestroy.bind(this));
    this.socket.on('weapon:fire', this.handleWeaponFire.bind(this));
    this.socket.on('impact:hit', this.handleImpactHit.bind(this));
    
    // Blockchain events
    this.socket.on('token:reward', this.handleTokenReward.bind(this));
    this.socket.on('nft:update', this.handleNFTUpdate.bind(this));
    
    // Time synchronization
    this.socket.on('server:time', this.handleServerTime.bind(this));
    this.socket.on('ping:response', this.handlePingResponse.bind(this));
    
    // Message acknowledgments
    this.socket.on('ack', this.handleMessageAcknowledgment.bind(this));
    
    // Chat messages
    this.socket.on('chat:message', this.handleChatMessage.bind(this));
    
    // Debug events (only in development)
    if (process.env.NODE_ENV === 'development') {
      this.socket.onAny((event, ...args) => {
        console.log(`[Socket] Event: ${event}`, args);
      });
    }
  }
  
  /**
   * Register game event handlers
   */
  registerGameEvents() {
    // Listen for player input events
    GameEvents.on('player:input', this.sendPlayerInput.bind(this));
    GameEvents.on('player:chat', this.sendChatMessage.bind(this));
    
    // Aircraft events
    GameEvents.on('aircraft:control', this.sendAircraftControl.bind(this));
    GameEvents.on('aircraft:weapon', this.sendWeaponAction.bind(this));
    
    // Session management
    GameEvents.on('session:join', this.joinSession.bind(this));
    GameEvents.on('session:leave', this.leaveSession.bind(this));
    GameEvents.on('session:create', this.createSession.bind(this));
    
    // Game-wide events
    GameEvents.on('game:pause', this.sendGamePause.bind(this));
    GameEvents.on('game:resume', this.sendGameResume.bind(this));
    
    // Blockchain events
    GameEvents.on('blockchain:transaction', this.sendBlockchainTransaction.bind(this));
    GameEvents.on('wallet:connected', this.handleWalletConnected.bind(this));
    GameEvents.on('wallet:disconnected', this.handleWalletDisconnected.bind(this));
  }
  
  /**
   * Get WebGL information for device capabilities reporting
   */
  getWebGLInfo() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      
      if (!gl) {
        return { supported: false };
      }
      
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';
      const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unknown';
      
      return {
        supported: true,
        renderer,
        vendor,
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)
      };
    } catch (error) {
      console.error('Failed to get WebGL info:', error);
      return { supported: false, error: error.message };
    }
  }
  
  /* Connection Event Handlers */
  
  /**
   * Handle successful connection
   */
  handleConnect() {
    console.log('Connected to server');
    this.isConnected = true;
    this.reconnectAttempts = 0;
    
    // Initiate time synchronization
    this.syncTime();
    
    // Start regular ping to measure latency
    this.startPingInterval();
    
    // Notify game that we're connected
    GameEvents.emit('network:connected');
    
    // If we have an auth token, authenticate
    if (this.authToken) {
      this.authenticate(this.authToken);
    }
  }
  
  /**
   * Handle disconnection
   */
  handleDisconnect(reason) {
    console.log(`Disconnected from server: ${reason}`);
    this.isConnected = false;
    this.stats.disconnections++;
    this.stats.lastReconnect = Date.now();
    
    // Stop ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Notify game about disconnection
    GameEvents.emit('network:disconnected', reason);
  }
  
  /**
   * Handle reconnection
   */
  handleReconnect(attemptNumber) {
    console.log(`Reconnected to server after ${attemptNumber} attempts`);
    this.isConnected = true;
    
    // Restart time sync and ping
    this.syncTime();
    this.startPingInterval();
    
    // Notify game about reconnection
    GameEvents.emit('network:reconnected');
    
    // If we were in a session, try to rejoin
    if (this.gameSession) {
      this.joinSession(this.gameSession.id);
    }
  }
  
  /**
   * Handle reconnection attempt
   */
  handleReconnectAttempt(attemptNumber) {
    console.log(`Reconnection attempt ${attemptNumber}/${this.maxReconnectAttempts}`);
    this.reconnectAttempts = attemptNumber;
    
    // Use exponential backoff for reconnect delay
    const newDelay = Math.min(this.reconnectDelay * Math.pow(1.5, attemptNumber - 1), 30000);
    this.socket.io.reconnectionDelay(newDelay);
    
    // Notify game about reconnection attempt
    GameEvents.emit('network:reconnecting', attemptNumber);
  }
  
  /**
   * Handle connection error
   */
  handleError(error) {
    console.error('Socket error:', error);
    GameEvents.emit('network:error', error);
  }
  
  /* Authentication Handlers */
  
  /**
   * Authenticate with the server
   */
  authenticate(token) {
    if (!this.isConnected) {
      console.warn('Cannot authenticate: not connected to server');
      return;
    }
    
    console.log('Authenticating with server...');
    this.socket.emit('auth:authenticate', { token });
  }
  
  /**
   * Handle successful authentication
   */
  handleAuthSuccess(data) {
    console.log('Authentication successful');
    this.authToken = data.token;
    this.userId = data.userId;
    this.sessionId = data.sessionId;
    
    // Store auth token for future sessions
    localStorage.setItem('authToken', data.token);
    
    // Notify game about authentication
    GameEvents.emit('auth:success', {
      userId: this.userId,
      username: data.username,
      profile: data.profile
    });
    
    // Connect blockchain wallet if needed
    if (data.walletAddress && this.tokenService.isWalletAvailable()) {
      this.connectWallet();
    }
  }
  
  /**
   * Handle authentication error
   */
  handleAuthError(error) {
    console.error('Authentication error:', error);
    
    // Clear invalid token
    this.authToken = null;
    localStorage.removeItem('authToken');
    
    // Notify game about authentication failure
    GameEvents.emit('auth:error', error);
  }
  
  /**
   * Handle authentication required
   */
  handleAuthRequired() {
    console.log('Authentication required');
    GameEvents.emit('auth:required');
  }
  
  /* Session Handlers */
  
  /**
   * Join a game session
   */
  joinSession(sessionId, options = {}) {
    if (!this.isConnected) {
      console.warn('Cannot join session: not connected to server');
      return false;
    }
    
    if (!this.userId) {
      console.warn('Cannot join session: not authenticated');
      return false;
    }
    
    console.log(`Joining session: ${sessionId}`);
    this.socket.emit('session:join', { sessionId, options });
    return true;
  }
  
  /**
   * Create a new game session
   */
  createSession(options = {}) {
    if (!this.isConnected) {
      console.warn('Cannot create session: not connected to server');
      return false;
    }
    
    if (!this.userId) {
      console.warn('Cannot create session: not authenticated');
      return false;
    }
    
    console.log('Creating new session');
    this.socket.emit('session:create', options);
    return true;
  }
  
  /**
   * Leave current game session
   */
  leaveSession() {
    if (!this.isConnected) {
      console.warn('Cannot leave session: not connected to server');
      return false;
    }
    
    if (!this.gameSession) {
      console.warn('Cannot leave session: not in a session');
      return false;
    }
    
    console.log(`Leaving session: ${this.gameSession.id}`);
    this.socket.emit('session:leave');
    return true;
  }
  
  /**
   * Handle successfully joining a session
   */
  handleSessionJoined(sessionData) {
    console.log(`Joined session: ${sessionData.id}`);
    this.gameSession = sessionData;
    
    // Initialize players map
    this.players.clear();
    if (sessionData.players) {
      sessionData.players.forEach(player => {
        this.players.set(player.id, player);
      });
    }
    
    // Start sending regular updates
    this.startUpdateInterval();
    
    // Notify game about session join
    GameEvents.emit('session:joined', sessionData);
  }
  
  /**
   * Handle leaving a session
   */
  handleSessionLeft(reason) {
    console.log(`Left session: ${this.gameSession?.id}, reason: ${reason}`);
    this.gameSession = null;
    this.players.clear();
    
    // Stop sending updates
    this.stopUpdateInterval();
    
    // Notify game about session leave
    GameEvents.emit('session:left', reason);
  }
  
  /**
   * Handle session state update
   */
  handleSessionState(sessionState) {
    // Update session data
    if (this.gameSession) {
      Object.assign(this.gameSession, sessionState);
    }
    
    // Notify game about session state update
    GameEvents.emit('session:state', sessionState);
  }
  
  /**
   * Handle players update
   */
  handlePlayersUpdate(players) {
    // Update players map
    players.forEach(player => {
      this.players.set(player.id, { 
        ...this.players.get(player.id),
        ...player 
      });
    });
    
    // Notify game about players update
    GameEvents.emit('session:players', Array.from(this.players.values()));
  }
  
  /* Game State Handlers */
  
  /**
   * Handle incremental game state update
   */
  handleStateUpdate(update) {
    // Track bytes received
    this.stats.bytesReceived += JSON.stringify(update).length;
    this.stats.messagesReceived++;
    
    // Pass to synchronizer for processing
    this.synchronizer.processStateUpdate(update);
  }
  
  /**
   * Handle full game state snapshot
   */
  handleStateSnapshot(snapshot) {
    // Track bytes received
    this.stats.bytesReceived += JSON.stringify(snapshot).length;
    this.stats.messagesReceived++;
    
    // Pass to synchronizer for processing
    this.synchronizer.processStateSnapshot(snapshot);
  }
  
  /**
   * Handle state reconciliation
   */
  handleStateReconciliation(reconciliationData) {
    // Process authoritative correction from server
    this.synchronizer.reconcileState(reconciliationData);
  }
  
  /* Player Event Handlers */
  
  /**
   * Handle player joined event
   */
  handlePlayerJoined(player) {
    console.log(`Player joined: ${player.username} (${player.id})`);
    
    // Add to players map
    this.players.set(player.id, player);
    
    // Notify game about player join
    GameEvents.emit('player:joined', player);
  }
  
  /**
   * Handle player left event
   */
  handlePlayerLeft(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      console.log(`Player left: ${player.username} (${playerId})`);
      
      // Remove from players map
      this.players.delete(playerId);
      
      // Notify game about player leave
      GameEvents.emit('player:left', player);
    }
  }
  
  /**
   * Handle player update event
   */
  handlePlayerUpdate(playerUpdate) {
    const playerId = playerUpdate.id;
    const player = this.players.get(playerId);
    
    if (player) {
      // Update player data
      Object.assign(player, playerUpdate);
      
      // Notify game about player update
      GameEvents.emit('player:update', player);
    }
  }
  
  /* Game Mechanics Event Handlers */
  
  /**
   * Handle aircraft spawn event
   */
  handleAircraftSpawn(data) {
    GameEvents.emit('aircraft:spawn', data);
  }
  
  /**
   * Handle aircraft destroy event
   */
  handleAircraftDestroy(data) {
    GameEvents.emit('aircraft:destroy', data);
  }
  
  /**
   * Handle weapon fire event
   */
  handleWeaponFire(data) {
    GameEvents.emit('weapon:fire', data);
  }
  
  /**
   * Handle impact hit event
   */
  handleImpactHit(data) {
    GameEvents.emit('impact:hit', data);
  }
  
  /* Blockchain Event Handlers */
  
  /**
   * Handle token reward event
   */
  handleTokenReward(data) {
    console.log(`Token reward received: ${data.amount} ${data.tokenType}`);
    
    // Verify reward against blockchain if wallet is connected
    if (this.isWalletConnected) {
      this.tokenService.verifyReward(data)
        .then(verified => {
          if (verified) {
            GameEvents.emit('token:reward', data);
          } else {
            console.warn('Token reward verification failed');
          }
        })
        .catch(error => {
          console.error('Error verifying token reward:', error);
        });
    } else {
      // No wallet connected, trust server data
      GameEvents.emit('token:reward', data);
    }
  }
  
  /**
   * Handle NFT update event
   */
  handleNFTUpdate(data) {
    console.log(`NFT update received for token ID: ${data.tokenId}`);
    
    // Verify NFT data if wallet is connected
    if (this.isWalletConnected) {
      this.tokenService.verifyNFT(data)
        .then(verified => {
          if (verified) {
            GameEvents.emit('nft:update', data);
          } else {
            console.warn('NFT verification failed');
          }
        })
        .catch(error => {
          console.error('Error verifying NFT:', error);
        });
    } else {
      // No wallet connected, trust server data
      GameEvents.emit('nft:update', data);
    }
  }
  
  /**
   * Handle wallet connected event
   */
  handleWalletConnected(walletData) {
    this.isWalletConnected = true;
    
    // Notify server about wallet connection
    if (this.isConnected) {
      this.socket.emit('wallet:connected', {
        address: walletData.address,
        chainId: walletData.chainId,
        signature: walletData.signature
      });
    }
  }
  
  /**
   * Handle wallet disconnected event
   */
  handleWalletDisconnected() {
    this.isWalletConnected = false;
    
    // Notify server about wallet disconnection
    if (this.isConnected) {
      this.socket.emit('wallet:disconnected');
    }
  }
  
  /* Time Synchronization */
  
  /**
   * Start time synchronization
   */
  syncTime() {
    // Request server time
    this.socket.emit('server:time', { clientTime: Date.now() });
  }
  
  /**
   * Handle server time response
   */
  handleServerTime(data) {
    const now = Date.now();
    const roundTripTime = now - data.clientTime;
    const serverTime = data.serverTime + roundTripTime / 2;
    
    // Calculate offset between client and server time
    this.serverTimeOffset = serverTime - now;
    
    console.log(`Time sync: server offset ${this.serverTimeOffset}ms, RTT ${roundTripTime}ms`);
    
    // Notify game about time sync
    GameEvents.emit('time:synced', {
      offset: this.serverTimeOffset,
      roundTripTime
    });
  }
  
  /**
   * Get current server time
   */
  getServerTime() {
    return Date.now() + this.serverTimeOffset;
  }
  
  /**
   * Start regular ping to measure latency
   */
  startPingInterval() {
    // Clear existing interval if any
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    // Start new interval
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, 5000); // Ping every 5 seconds
  }
  
  /**
   * Send ping to server
   */
  sendPing() {
    const pingId = Date.now();
    this.socket.emit('ping:request', { id: pingId, time: Date.now() });
  }
  
  /**
   * Handle ping response
   */
  handlePingResponse(data) {
    const now = Date.now();
    const pingTime = now - data.time;
    
    // Add to ping history
    this.pingHistory.push(pingTime);
    
    // Keep history at max size
    if (this.pingHistory.length > this.pingHistoryMaxSize) {
      this.pingHistory.shift();
    }
    
    // Calculate average ping
    this.avgPing = this.pingHistory.reduce((sum, time) => sum + time, 0) / this.pingHistory.length;
    
    // Update synchronizer jitter buffer based on ping
    this.synchronizer.updateNetworkConditions({
      ping: pingTime,
      avgPing: this.avgPing,
      jitter: this.calculateJitter()
    });
    
    // Notify game about ping update
    GameEvents.emit('network:ping', {
      current: pingTime,
      average: this.avgPing,
      jitter: this.calculateJitter()
    });
  }
  
  /**
   * Calculate network jitter
   */
  calculateJitter() {
    if (this.pingHistory.length < 2) return 0;
    
    let jitterSum = 0;
    for (let i = 1; i < this.pingHistory.length; i++) {
      jitterSum += Math.abs(this.pingHistory[i] - this.pingHistory[i - 1]);
    }
    
    return jitterSum / (this.pingHistory.length - 1);
  }
  
  /* Message Handling */
  
  /**
   * Handle message acknowledgment
   */
  handleMessageAcknowledgment(ack) {
    const { id, status, error } = ack;
    
    // Get pending message
    const pendingMessage = this.pendingMessages.get(id);
    if (pendingMessage) {
      // Remove from pending messages
      this.pendingMessages.delete(id);
      
      // Call callback if available
      if (pendingMessage.callback) {
        if (status === 'success') {
          pendingMessage.callback(null, ack.data);
        } else {
          pendingMessage.callback(error || new Error('Message failed'));
        }
      }
    }
  }
  
  /**
   * Handle chat message
   */
  handleChatMessage(message) {
    GameEvents.emit('chat:message', message);
  }
  
  /* Update Loop */
  
  /**
   * Start sending regular updates
   */
  startUpdateInterval() {
    // Stop existing interval if any
    this.stopUpdateInterval();
    
    // Start regular update
    this.updateIntervalId = setInterval(() => {
      this.sendUpdate();
    }, this.updateInterval);
  }
  
  /**
   * Stop sending regular updates
   */
  stopUpdateInterval() {
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }
  }
  
  /**
   * Send game state update
   */
  sendUpdate() {
    if (!this.isConnected || !this.gameSession) return;
    
    const now = Date.now();
    
    // Throttle updates based on configured rate
    if (now - this.lastUpdateTime < this.updateInterval) return;
    this.lastUpdateTime = now;
    
    // Get local player state from game
    const localPlayerState = this.gameInstance.getLocalPlayerState();
    if (!localPlayerState) return;
    
    // Let synchronizer compress and prepare update
    const update = this.synchronizer.prepareUpdate(localPlayerState);
    
    // Send update to server
    this.socket.emit('state:update', update);
    
    // Track stats
    const updateSize = JSON.stringify(update).length;
    this.stats.bytesSent += updateSize;
    this.stats.messagesSent++;
  }
  
  /* Input Handlers */
  
  /**
   * Send player input to server
   */
  sendPlayerInput(input) {
    if (!this.isConnected || !this.gameSession) return;
    
    // Let synchronizer process input
    this.synchronizer.processLocalInput(input);
    
    // Send input to server
    this.socket.emit('player:input', input);
  }
  
  /**
   * Send aircraft control update
   */
  sendAircraftControl(control) {
    if (!this.isConnected || !this.gameSession) return;
    
    // Format control data
    const controlData = {
      timestamp: this.getServerTime(),
      ...control
    };
    
    // Send to server
    this.socket.emit('aircraft:control', controlData);
  }
  
  /**
   * Send weapon action
   */
  sendWeaponAction(action) {
    if (!this.isConnected || !this.gameSession) return;
    
    // Format weapon action
    const actionData = {
      timestamp: this.getServerTime(),
      ...action
    };
    
    // This is a critical action, so use reliable message
    this.sendReliableMessage('weapon:action', actionData);
  }
  
  /**
   * Send chat message
   */
  sendChatMessage(message) {
    if (!this.isConnected) return;
    
    // Format chat message
    const chatData = {
      timestamp: this.getServerTime(),
      content: message.content,
      channel: message.channel || 'global'
    };
    
    // Send to server
    this.socket.emit('chat:message', chatData);
  }
  
  /**
   * Send game pause request
   */
  sendGamePause() {
    if (!this.isConnected || !this.gameSession) return;
    
    this.socket.emit('game:pause');
  }
  
  /**
   * Send game resume request
   */
  sendGameResume() {
    if (!this.isConnected || !this.gameSession) return;
    
    this.socket.emit('game:resume');
  }
  
  /**
   * Send blockchain transaction
   */
  sendBlockchainTransaction(transaction) {
    if (!this.isConnected) return;
    
    // Send transaction receipt to server for verification
    this.socket.emit('blockchain:transaction', transaction);
  }
  
  /**
   * Connect blockchain wallet
   */
  async connectWallet() {
    try {
      // Use token service to connect wallet
      const walletData = await this.tokenService.connectWallet();
      
      // Handle successful connection
      this.handleWalletConnected(walletData);
      
      return walletData;
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      GameEvents.emit('wallet:error', error);
      return null;
    }
  }
  
  /* Message Queue Management */
  
  /**
   * Send reliable message with acknowledgment
   */
  sendReliableMessage(eventName, data, callback) {
    if (!this.isConnected) {
      if (callback) {
        callback(new Error('Not connected to server'));
      }
      return null;
    }
    
    // Generate unique message ID
    const messageId = ++this.messageIdCounter;
    
    // Prepare message with ID
    const message = {
      id: messageId,
      data,
      timestamp: this.getServerTime()
    };
    
    // Store in pending messages
    if (callback) {
      this.pendingMessages.set(messageId, {
        eventName,
        data: message,
        time: Date.now(),
        callback
      });
      
      // Set timeout for message acknowledgment
      setTimeout(() => {
        if (this.pendingMessages.has(messageId)) {
          // Message timed out
          this.pendingMessages.delete(messageId);
          callback(new Error('Message acknowledgment timeout'));
        }
      }, 5000); // 5 seconds timeout
    }
    
    // Send to server
    this.socket.emit(eventName, message);
    
    // Track stats
    const messageSize = JSON.stringify(message).length;
    this.stats.bytesSent += messageSize;
    this.stats.messagesSent++;
    
    return messageId;
  }
  
  /* Utility Methods */
  
  /**
   * Get current network stats
   */
  getNetworkStats() {
    return {
      ...this.stats,
      ping: this.avgPing,
      jitter: this.calculateJitter(),
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      serverTimeOffset: this.serverTimeOffset,
      updateRate: this.updateRateHz,
      reliableQueueSize: this.reliableQueue.length,
      unreliableQueueSize: this.unreliableQueue.length,
      pendingMessagesCount: this.pendingMessages.size
    };
  }
  
  /**
   * Set network update rate
   */
  setUpdateRate(hz) {
    this.updateRateHz = hz;
    this.updateInterval = 1000 / hz;
    
    // Restart update interval if active
    if (this.updateIntervalId) {
      this.stopUpdateInterval();
      this.startUpdateInterval();
    }
  }
  
  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.isConnected = false;
      
      // Stop intervals
      this.stopUpdateInterval();
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
    }
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    // Disconnect from server
    this.disconnect();
    
    // Clean up synchronizer
    this.synchronizer.dispose();
    
    // Remove game event listeners
    GameEvents.off('player:input', this.sendPlayerInput);
    GameEvents.off('player:chat', this.sendChatMessage);
    GameEvents.off('aircraft:control', this.sendAircraftControl);
    GameEvents.off('aircraft:weapon', this.sendWeaponAction);
    GameEvents.off('session:join', this.joinSession);
    GameEvents.off('session:leave', this.leaveSession);
    GameEvents.off('session:create', this.createSession);
    GameEvents.off('game:pause', this.sendGamePause);
    GameEvents.off('game:resume', this.sendGameResume);
    GameEvents.off('blockchain:transaction', this.sendBlockchainTransaction);
    GameEvents.off('wallet:connected', this.handleWalletConnected);
    GameEvents.off('wallet:disconnected', this.handleWalletDisconnected);
  }
}