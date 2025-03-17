/**
 * Game Network Manager
 * 
 * Handles server-side multiplayer networking for the plane simulator.
 * Manages client connections, game state synchronization, and authority.
 * 
 * @module GameNetwork
 */

const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { GAME_MODES } = require('./gameEngine');
const { TokenService } = require('./tokenService');

/**
 * Manages multiplayer networking for the game server
 */
class GameNetwork {
  /**
   * Create a new game network manager
   * @param {Object} options - Network options
   * @param {Object} gameEngine - Game engine instance
   * @param {Object} server - HTTP server for Socket.IO
   */
  constructor(options = {}, gameEngine, server) {
    this.options = Object.assign({
      updateRate: 20, // Updates per second
      maxPlayers: 32,
      tokenRewards: true,
      jwtSecret: process.env.JWT_SECRET || 'skywarssecret',
      debug: false
    }, options);
    
    // Store game engine reference
    this.gameEngine = gameEngine;
    
    // Initialize Socket.IO
    this.io = socketIO(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    
    // Player connections
    this.connections = new Map();
    
    // Token service for blockchain integration
    this.tokenService = options.tokenService || new TokenService();
    
    // Setup authentication middleware
    this.io.use(this._authenticateSocket.bind(this));
    
    // Update timer
    this.updateTimer = null;
    
    // Debug flag
    this.debug = this.options.debug;
    
    // Initialize connection handler
    this._setupConnectionHandler();
    
    // Start update loop
    this._startUpdateLoop();
    
    // Log initialization
    if (this.debug) {
      console.log(`Game network initialized (Max players: ${this.options.maxPlayers})`);
    }
  }
  
  /**
   * Authenticate Socket.IO connection with JWT
   * @param {Object} socket - Socket connection
   * @param {Function} next - Next function
   * @private
   */
  _authenticateSocket(socket, next) {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }
    
    try {
      // Verify JWT
      const decoded = jwt.verify(token, this.options.jwtSecret);
      
      // Store user data in socket
      socket.user = decoded;
      
      // Continue
      next();
    } catch (error) {
      if (this.debug) {
        console.error('Socket authentication error:', error.message);
      }
      
      next(new Error('Invalid authentication token'));
    }
  }
  
  /**
   * Set up Socket.IO connection handler
   * @private
   */
  _setupConnectionHandler() {
    this.io.on('connection', (socket) => {
      // Log connection
      if (this.debug) {
        console.log(`Player connected: ${socket.user.username} (${socket.id})`);
      }
      
      // Check if game is full
      if (this.connections.size >= this.options.maxPlayers) {
        socket.emit('connection_error', { error: 'Game is full' });
        socket.disconnect();
        return;
      }
      
      // Store connection
      this.connections.set(socket.id, {
        socket,
        user: socket.user,
        playerId: null,
        joinTime: Date.now(),
        lastPing: Date.now(),
        latency: 0,
        ready: false
      });
      
      // Setup event handlers
      this._setupSocketHandlers(socket);
      
      // Send initial game state
      socket.emit('game_state', this.gameEngine.getGameState());
    });
  }
  
  /**
   * Set up Socket.IO event handlers for a client
   * @param {Object} socket - Socket connection
   * @private
   */
  _setupSocketHandlers(socket) {
    // Join game request
    socket.on('join_game', (data, callback) => {
      try {
        this._handleJoinGame(socket, data, callback);
      } catch (error) {
        if (this.debug) {
          console.error(`Error joining game for ${socket.id}:`, error);
        }
        
        callback({ error: error.message });
      }
    });
    
    // Player controls
    socket.on('player_controls', (data) => {
      try {
        this._handlePlayerControls(socket, data);
      } catch (error) {
        if (this.debug) {
          console.error(`Error processing controls for ${socket.id}:`, error);
        }
      }
    });
    
    // Weapon fire
    socket.on('fire_weapon', (data) => {
      try {
        this._handleWeaponFire(socket, data);
      } catch (error) {
        if (this.debug) {
          console.error(`Error processing weapon fire for ${socket.id}:`, error);
        }
      }
    });
    
    // Ping (for latency measurement)
    socket.on('ping', (data) => {
      // Send pong with same timestamp
      socket.emit('pong', data);
      
      // Update last ping time
      const connection = this.connections.get(socket.id);
      if (connection) {
        connection.lastPing = Date.now();
      }
    });
    
    // Ping result (client calculated latency)
    socket.on('ping_result', (data) => {
      // Store latency
      const connection = this.connections.get(socket.id);
      if (connection) {
        connection.latency = data.latency;
      }
    });
    
    // Player ready
    socket.on('player_ready', (data) => {
      const connection = this.connections.get(socket.id);
      if (connection) {
        connection.ready = true;
        
        // Spawn player if game is running
        if (this.gameEngine.isRunning && connection.playerId) {
          this.gameEngine.spawnPlayer(connection.playerId);
        }
      }
    });
    
    // Wallet connection
    socket.on('wallet_connect', (data) => {
      try {
        this._handleWalletConnect(socket, data);
      } catch (error) {
        if (this.debug) {
          console.error(`Error connecting wallet for ${socket.id}:`, error);
        }
        
        socket.emit('wallet_connect_error', { error: error.message });
      }
    });
    
    // Chat message
    socket.on('chat_message', (data) => {
      try {
        this._handleChatMessage(socket, data);
      } catch (error) {
        if (this.debug) {
          console.error(`Error processing chat message for ${socket.id}:`, error);
        }
      }
    });
    
    // Disconnect
    socket.on('disconnect', () => {
      try {
        this._handleDisconnect(socket);
      } catch (error) {
        if (this.debug) {
          console.error(`Error handling disconnect for ${socket.id}:`, error);
        }
      }
    });
  }
  
  /**
   * Handle join game request
   * @param {Object} socket - Socket connection
   * @param {Object} data - Join data
   * @param {Function} callback - Callback function
   * @private
   */
  _handleJoinGame(socket, data, callback) {
    // Get connection
    const connection = this.connections.get(socket.id);
    if (!connection) {
      throw new Error('Connection not found');
    }
    
    // Create player config
    const playerConfig = {
      id: `player-${uuidv4()}`,
      username: data.playerName || connection.user.username,
      aircraftType: data.aircraftType || 'FIGHTER',
      userId: connection.user.id,
      isAI: false,
      walletAddress: connection.user.walletAddress || null,
      teamId: data.teamId || null
    };
    
    // Add player to game
    const player = this.gameEngine.addPlayer(playerConfig);
    
    // Store player ID in connection
    connection.playerId = player.id;
    
    // Respond with player data
    callback({
      playerId: player.id,
      username: player.username,
      aircraftType: player.aircraftType,
      teamId: player.teamId,
      position: player.position,
      rotation: player.rotation,
      sessionId: this.gameEngine.sessionId
    });
    
    // Broadcast player joined event to all other clients
    socket.broadcast.emit('player_joined', {
      playerId: player.id,
      username: player.username,
      aircraftType: player.aircraftType,
      teamId: player.teamId
    });
    
    // Mark as ready to spawn if indicated
    if (data.ready) {
      connection.ready = true;
      
      // Spawn player if game is running
      if (this.gameEngine.isRunning) {
        this.gameEngine.spawnPlayer(player.id);
      }
    }
    
    if (this.debug) {
      console.log(`Player joined: ${player.username} (${player.id})`);
    }
  }
  
  /**
   * Handle player controls
   * @param {Object} socket - Socket connection
   * @param {Object} data - Control data
   * @private
   */
  _handlePlayerControls(socket, data) {
    // Get connection
    const connection = this.connections.get(socket.id);
    if (!connection || !connection.playerId) return;
    
    // Set controls in game engine
    this.gameEngine.setPlayerControls(connection.playerId, {
      throttle: data.throttle,
      roll: data.roll,
      pitch: data.pitch,
      yaw: data.yaw
    });
  }
  
  /**
   * Handle weapon fire
   * @param {Object} socket - Socket connection
   * @param {Object} data - Weapon data
   * @private
   */
  _handleWeaponFire(socket, data) {
    // Get connection
    const connection = this.connections.get(socket.id);
    if (!connection || !connection.playerId) return;
    
    // Fire weapon in game engine
    this.gameEngine.firePlayerWeapon(
      connection.playerId,
      data.type || 'primary',
      data.target || null
    );
  }
  
  /**
   * Handle wallet connection
   * @param {Object} socket - Socket connection
   * @param {Object} data - Wallet data
   * @private
   */
  _handleWalletConnect(socket, data) {
    // Get connection
    const connection = this.connections.get(socket.id);
    if (!connection || !connection.playerId) {
      throw new Error('Player not joined');
    }
    
    // Verify wallet signature
    const isValidSignature = this.tokenService.verifyWalletSignature(
      data.walletAddress,
      data.signature,
      data.message
    );
    
    if (!isValidSignature) {
      throw new Error('Invalid wallet signature');
    }
    
    // Update player wallet address
    const player = this.gameEngine.playerManager.getPlayer(connection.playerId);
    if (player) {
      player.walletAddress = data.walletAddress;
      
      // Get token balance
      this.tokenService.getTokenBalance(data.walletAddress)
        .then(balance => {
          // Send balance to client
          socket.emit('token_balance', { balance });
        })
        .catch(error => {
          if (this.debug) {
            console.error(`Error getting token balance for ${socket.id}:`, error);
          }
        });
    }
    
    // Send success response
    socket.emit('wallet_connected', {
      walletAddress: data.walletAddress
    });
    
    if (this.debug) {
      console.log(`Wallet connected for ${connection.playerId}: ${data.walletAddress.substr(0, 10)}...`);
    }
  }
  
  /**
   * Handle chat message
   * @param {Object} socket - Socket connection
   * @param {Object} data - Message data
   * @private
   */
  _handleChatMessage(socket, data) {
    // Get connection
    const connection = this.connections.get(socket.id);
    if (!connection || !connection.playerId) return;
    
    // Get player
    const player = this.gameEngine.playerManager.getPlayer(connection.playerId);
    if (!player) return;
    
    // Validate message
    const message = data.message.trim();
    if (!message || message.length > 200) return;
    
    // Create message object
    const chatMessage = {
      id: uuidv4(),
      playerId: player.id,
      username: player.username,
      teamId: player.teamId,
      message,
      timestamp: Date.now()
    };
    
    // Send message to all clients or team only
    if (data.teamOnly && player.teamId && this.gameEngine.gameMode === GAME_MODES.TEAM_DEATHMATCH) {
      // Get all players in team
      const teamPlayerIds = new Set();
      
      for (const p of this.gameEngine.playerManager.players.values()) {
        if (p.teamId === player.teamId) {
          teamPlayerIds.add(p.id);
        }
      }
      
      // Send to team members only
      for (const connection of this.connections.values()) {
        if (connection.playerId && teamPlayerIds.has(connection.playerId)) {
          connection.socket.emit('chat_message', {
            ...chatMessage,
            teamOnly: true
          });
        }
      }
    } else {
      // Send to all
      this.io.emit('chat_message', chatMessage);
    }
  }
  
  /**
   * Handle client disconnect
   * @param {Object} socket - Socket connection
   * @private
   */
  _handleDisconnect(socket) {
    // Get connection
    const connection = this.connections.get(socket.id);
    if (!connection) return;
    
    if (this.debug) {
      console.log(`Player disconnected: ${socket.id}`);
    }
    
    // Remove player from game
    if (connection.playerId) {
      // Remove player from game engine
      this.gameEngine.removePlayer(connection.playerId);
      
      // Notify all clients of player departure
      socket.broadcast.emit('player_left', {
        playerId: connection.playerId
      });
    }
    
    // Remove connection
    this.connections.delete(socket.id);
    
    // Check if game should be stopped due to low player count
    if (this.gameEngine.isRunning && this.connections.size === 0) {
      // No players left, stop game
      this.gameEngine.stop();
    }
  }
  
  /**
   * Start update loop for sending game state to clients
   * @private
   */
  _startUpdateLoop() {
    // Calculate update interval
    const updateInterval = 1000 / this.options.updateRate;
    
    // Start update timer
    this.updateTimer = setInterval(() => {
      this._broadcastGameState();
    }, updateInterval);
  }
  
  /**
   * Broadcast game state to all connected clients
   * @private
   */
  _broadcastGameState() {
    // Skip if no game engine or game not running
    if (!this.gameEngine || !this.gameEngine.isRunning) return;
    
    // Get latest update
    const update = this.gameEngine.getLatestUpdate();
    if (!update) return;
    
    // Broadcast to all clients
    this.io.emit('game_state', update);
  }
  
  /**
   * Broadcast event to all connected clients
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  broadcastEvent(event, data) {
    this.io.emit(event, data);
  }
  
  /**
   * Start a new game session
   * @param {Object} options - Game options
   */
  startGame(options = {}) {
    // Skip if game is already running
    if (this.gameEngine.isRunning) return;
    
    // Start game engine
    this.gameEngine.start();
    
    // Notify all clients
    this.io.emit('game_started', {
      sessionId: this.gameEngine.sessionId,
      gameMode: this.gameEngine.gameMode,
      environment: this.gameEngine.world.environment
    });
    
    // Spawn all ready players
    for (const connection of this.connections.values()) {
      if (connection.ready && connection.playerId) {
        this.gameEngine.spawnPlayer(connection.playerId);
      }
    }
    
    if (this.debug) {
      console.log(`Game started (Session ID: ${this.gameEngine.sessionId})`);
    }
  }
  
  /**
   * Stop the current game session
   */
  stopGame() {
    // Skip if game is not running
    if (!this.gameEngine.isRunning) return;
    
    // Stop game engine
    this.gameEngine.stop();
    
    // Notify all clients
    this.io.emit('game_stopped', {
      sessionId: this.gameEngine.sessionId
    });
    
    if (this.debug) {
      console.log(`Game stopped (Session ID: ${this.gameEngine.sessionId})`);
    }
  }
  
  /**
   * Setup game engine event handlers
   */
  setupGameEngineEvents() {
    // Skip if no game engine
    if (!this.gameEngine) return;
    
    // Player events
    this.gameEngine.on('playerJoined', (data) => {
      this.io.emit('player_joined', data);
    });
    
    this.gameEngine.on('playerLeft', (data) => {
      this.io.emit('player_left', data);
    });
    
    this.gameEngine.on('playerSpawned', (data) => {
      this.io.emit('player_spawned', data);
    });
    
    this.gameEngine.on('playerDeath', (data) => {
      this.io.emit('player_death', data);
    });
    
    this.gameEngine.on('playerRespawn', (data) => {
      this.io.emit('player_respawn', data);
    });
    
    this.gameEngine.on('playerCollision', (data) => {
      this.io.emit('player_collision', data);
    });
    
    // Projectile events
    this.gameEngine.on('projectileCreated', (data) => {
      this.io.emit('projectile_created', data);
    });
    
    this.gameEngine.on('projectileImpact', (data) => {
      this.io.emit('projectile_impact', data);
    });
    
    this.gameEngine.on('projectileRemoved', (data) => {
      this.io.emit('projectile_removed', data);
    });
    
    // Explosion events
    this.gameEngine.on('explosion', (data) => {
      this.io.emit('explosion', data);
    });
    
    // Game events
    this.gameEngine.on('sessionStarted', (data) => {
      this.io.emit('session_started', data);
    });
    
    this.gameEngine.on('sessionEnded', (data) => {
      this.io.emit('session_ended', data);
    });
    
    this.gameEngine.on('gameEnding', (data) => {
      this.io.emit('game_ending', data);
    });
    
    this.gameEngine.on('leaderboardUpdated', (data) => {
      this.io.emit('leaderboard_updated', data);
    });
    
    this.gameEngine.on('teamScoreUpdated', (data) => {
      this.io.emit('team_score_updated', data);
    });
    
    // Environment events
    this.gameEngine.on('weatherChanged', (data) => {
      this.io.emit('weather_changed', data);
    });
    
    this.gameEngine.on('timeOfDayUpdated', (data) => {
      this.io.emit('time_of_day_updated', data);
    });
    
    // Achievement events
    this.gameEngine.on('achievementCompleted', (data) => {
      // Find socket for player
      for (const connection of this.connections.values()) {
        if (connection.playerId === data.playerId) {
          // Send to specific player only
          connection.socket.emit('achievement_completed', data);
          break;
        }
      }
    });
    
    // Token events
    this.gameEngine.on('tokenRewarded', (data) => {
      // Find socket for player
      for (const connection of this.connections.values()) {
        if (connection.playerId === data.playerId) {
          // Send to specific player only
          connection.socket.emit('token_rewarded', data);
          break;
        }
      }
    });
  }
  
  /**
   * Get network statistics
   * @returns {Object} Network statistics
   */
  getNetworkStats() {
    return {
      playerCount: this.connections.size,
      connections: Array.from(this.connections.values()).map(connection => ({
        id: connection.socket.id,
        username: connection.user.username,
        playerId: connection.playerId,
        latency: connection.latency,
        joinTime: connection.joinTime,
        address: connection.socket.handshake.address
      }))
    };
  }
  
  /**
   * Shutdown network manager
   */
  shutdown() {
    // Clear update timer
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    
    // Disconnect all clients
    this.io.disconnectSockets();
    
    // Close Socket.IO server
    this.io.close();
    
    if (this.debug) {
      console.log('Game network shut down');
    }
  }
}

module.exports = { GameNetwork };