/**
 * SkyWars Multiplayer Implementation
 * 
 * A client-side networking system for the SkyWars multiplayer plane game
 * featuring state synchronization, prediction, lag compensation, and game modes.
 */

import { io } from 'socket.io-client';
import * as THREE from 'three';

// Configuration constants
const NETWORK_TICK_RATE = 20; // Updates per second to send to server
const INTERPOLATION_BUFFER = 100; // Buffer time in ms for interpolation
const CORRECTION_THRESHOLD = 5; // Distance threshold for position correction
const STATE_HISTORY_SIZE = 60; // Number of state snapshots to keep for reconciliation
const BANDWIDTH_OPTIMIZATION = true; // Enable bandwidth optimization techniques

/**
 * Main multiplayer manager class that handles all networking aspects
 */
export class MultiplayerManager {
  constructor(game, flightModel, serverUrl = 'https://skywars-server.example.com') {
    // Core references
    this.game = game;
    this.flightModel = flightModel;
    this.serverUrl = serverUrl;
    
    // Network state
    this.socket = null;
    this.connected = false;
    this.reconnecting = false;
    this.lastSendTime = 0;
    this.sendInterval = 1000 / NETWORK_TICK_RATE;
    this.playerId = null;
    this.roomId = null;
    this.gameMode = null;
    
    // Player data
    this.players = new Map(); // Map of player ID -> player data
    this.localPlayerState = null;
    this.stateHistory = []; // History of local state for reconciliation
    
    // Game state
    this.gameState = {
      status: 'lobby', // 'lobby', 'countdown', 'playing', 'ended'
      timeRemaining: 0,
      scores: {},
      gameMode: null,
      settings: {}
    };
    
    // Friends system
    this.friends = {
      list: [], // List of friend objects
      requests: {
        incoming: [],
        outgoing: []
      },
      online: {} // Map of friend ID -> online status
    };
    
    // Entity interpolation
    this.entityInterpolation = new EntityInterpolation();
    
    // Prediction system
    this.predictionSystem = new PredictionSystem(this.flightModel);
    
    // Network metrics for debugging and optimization
    this.metrics = {
      latency: 0,
      packetsSent: 0,
      packetsReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      lastUpdateTime: Date.now()
    };
    
    // Initialize debug settings
    this.debug = false;
  }
  
  /**
   * Initialize connection to the server
   */
  connect(authToken) {
    if (this.socket) {
      this.disconnect();
    }
    
    console.log(`Connecting to multiplayer server: ${this.serverUrl}`);
    
    // Initialize Socket.io connection with auth token
    this.socket = io(this.serverUrl, {
      auth: { token: authToken },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      query: {
        clientVersion: this.game.version || '1.0.0'
      }
    });
    
    // Setup Socket.io event handlers
    this.setupSocketHandlers();
    
    // Start game loop
    this.startGameLoop();
  }
  
  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.connected = false;
    this.playerId = null;
    this.players.clear();
    this.gameState.status = 'lobby';
    
    console.log('Disconnected from multiplayer server');
    
    // Notify game of disconnection
    if (this.game && this.game.onDisconnect) {
      this.game.onDisconnect();
    }
  }
  
  /**
   * Setup Socket.io event handlers
   */
  setupSocketHandlers() {
    if (!this.socket) return;
    
    // Connection events
    this.socket.on('connect', () => this.handleConnect());
    this.socket.on('disconnect', (reason) => this.handleDisconnect(reason));
    this.socket.on('connect_error', (error) => this.handleConnectionError(error));
    this.socket.on('reconnect_attempt', (attemptNumber) => this.handleReconnectAttempt(attemptNumber));
    
    // Game state events
    this.socket.on('gameState', (state) => this.handleGameState(state));
    this.socket.on('playerJoined', (player) => this.handlePlayerJoined(player));
    this.socket.on('playerLeft', (playerId) => this.handlePlayerLeft(playerId));
    this.socket.on('playerStates', (states) => this.handlePlayerStates(states));
    this.socket.on('serverReconciliation', (correction) => this.handleServerReconciliation(correction));
    
    // Game events
    this.socket.on('projectileFired', (data) => this.handleProjectileFired(data));
    this.socket.on('projectileHit', (data) => this.handleProjectileHit(data));
    this.socket.on('playerDamaged', (data) => this.handlePlayerDamaged(data));
    this.socket.on('playerDestroyed', (data) => this.handlePlayerDestroyed(data));
    this.socket.on('powerupSpawned', (data) => this.handlePowerupSpawned(data));
    this.socket.on('powerupCollected', (data) => this.handlePowerupCollected(data));
    this.socket.on('checkpointReached', (data) => this.handleCheckpointReached(data));
    
    // Chat events
    this.socket.on('chatMessage', (data) => this.handleChatMessage(data));
    
    // Friends system events
    this.socket.on('friendsList', (data) => this.handleFriendsList(data));
    this.socket.on('friendRequest', (data) => this.handleFriendRequest(data));
    this.socket.on('friendRequestAccepted', (data) => this.handleFriendRequestAccepted(data));
    this.socket.on('friendOnlineStatus', (data) => this.handleFriendOnlineStatus(data));
    
    // Match/room events
    this.socket.on('roomCreated', (data) => this.handleRoomCreated(data));
    this.socket.on('roomJoined', (data) => this.handleRoomJoined(data));
    this.socket.on('roomError', (data) => this.handleRoomError(data));
    this.socket.on('matchInvite', (data) => this.handleMatchInvite(data));
    
    // Ping for latency measurement
    this.socket.on('pong', (latency) => {
      this.metrics.latency = latency;
    });
    
    // Custom error events
    this.socket.on('error', (error) => this.handleError(error));
    this.socket.on('versionMismatch', (data) => this.handleVersionMismatch(data));
  }
  
  /**
   * Start the game loop for network updates
   */
  startGameLoop() {
    // Set up requestAnimationFrame loop
    const gameLoop = (timestamp) => {
      this.update(timestamp);
      requestAnimationFrame(gameLoop);
    };
    
    requestAnimationFrame(gameLoop);
  }
  
  /**
   * Main update function called every frame
   */
  update(timestamp) {
    if (!this.connected) return;
    
    // Update local player state for prediction
    this.updateLocalPlayerState();
    
    // Throttle network updates based on tick rate
    const now = Date.now();
    if (now - this.lastSendTime >= this.sendInterval) {
      this.sendPlayerState();
      this.lastSendTime = now;
      
      // Measure ping every second
      if (now - this.metrics.lastUpdateTime > 1000) {
        this.socket.emit('ping');
        this.metrics.lastUpdateTime = now;
      }
    }
    
    // Update entity interpolation for other players
    this.entityInterpolation.update();
    
    // Update prediction system
    this.predictionSystem.update();
  }
  
  /**
   * Update the local player state from the flight model
   */
  updateLocalPlayerState() {
    if (!this.flightModel || !this.playerId) return;
    
    // Get current state from flight model
    const flightState = this.flightModel.getState();
    
    // Create local player state
    const state = {
      id: this.playerId,
      timestamp: Date.now(),
      sequence: this.stateHistory.length,
      position: {
        x: flightState.position.x,
        y: flightState.position.y,
        z: flightState.position.z
      },
      rotation: {
        x: flightState.quaternion._x,
        y: flightState.quaternion._y,
        z: flightState.quaternion._z,
        w: flightState.quaternion._w
      },
      velocity: {
        x: flightState.velocity.x,
        y: flightState.velocity.y,
        z: flightState.velocity.z
      },
      angularVelocity: {
        x: flightState.angularVelocity.x,
        y: flightState.angularVelocity.y,
        z: flightState.angularVelocity.z
      },
      inputs: {
        throttle: flightState.throttle,
        pitch: flightState.pitch,
        roll: flightState.roll,
        yaw: flightState.yaw
      },
      health: flightState.health || 100,
      aircraft: flightState.aircraft || 'default'
    };
    
    // Store local state
    this.localPlayerState = state;
    
    // Add to history for potential reconciliation
    this.stateHistory.push(state);
    
    // Limit history size
    if (this.stateHistory.length > STATE_HISTORY_SIZE) {
      this.stateHistory.shift();
    }
  }
  
  /**
   * Send the player state to the server
   */
  sendPlayerState() {
    if (!this.socket || !this.connected || !this.localPlayerState) return;
    
    // Clean up state for optimal size
    let stateToSend = this.localPlayerState;
    
    // Apply bandwidth optimization if enabled
    if (BANDWIDTH_OPTIMIZATION) {
      stateToSend = this.optimizeStateForNetwork(stateToSend);
    }
    
    // Send to server
    this.socket.emit('playerState', stateToSend);
    
    // Update metrics
    this.metrics.packetsSent++;
    const stateSize = JSON.stringify(stateToSend).length;
    this.metrics.bytesSent += stateSize;
    
    if (this.debug) {
      console.debug(`State sent: ${stateSize} bytes`);
    }
  }
  
  /**
   * Optimize the state object for network transmission
   */
  optimizeStateForNetwork(state) {
    // Create a minimal state object with only changed values
    const optimizedState = {
      id: state.id,
      timestamp: state.timestamp,
      sequence: state.sequence
    };
    
    // If we have previous states to compare against
    if (this.stateHistory.length > 1) {
      const prevState = this.stateHistory[this.stateHistory.length - 2];
      
      // Only include position if changed significantly
      const posThreshold = 0.01;
      const posChanged = 
        Math.abs(state.position.x - prevState.position.x) > posThreshold ||
        Math.abs(state.position.y - prevState.position.y) > posThreshold ||
        Math.abs(state.position.z - prevState.position.z) > posThreshold;
      
      if (posChanged) {
        optimizedState.position = {
          x: Number(state.position.x.toFixed(2)),
          y: Number(state.position.y.toFixed(2)),
          z: Number(state.position.z.toFixed(2))
        };
      }
      
      // Only include rotation if changed significantly
      const rotThreshold = 0.01;
      const rotChanged = 
        Math.abs(state.rotation.x - prevState.rotation.x) > rotThreshold ||
        Math.abs(state.rotation.y - prevState.rotation.y) > rotThreshold ||
        Math.abs(state.rotation.z - prevState.rotation.z) > rotThreshold ||
        Math.abs(state.rotation.w - prevState.rotation.w) > rotThreshold;
      
      if (rotChanged) {
        optimizedState.rotation = {
          x: Number(state.rotation.x.toFixed(3)),
          y: Number(state.rotation.y.toFixed(3)),
          z: Number(state.rotation.z.toFixed(3)),
          w: Number(state.rotation.w.toFixed(3))
        };
      }
      
      // Only include velocity if changed significantly
      const velThreshold = 0.1;
      const velChanged = 
        Math.abs(state.velocity.x - prevState.velocity.x) > velThreshold ||
        Math.abs(state.velocity.y - prevState.velocity.y) > velThreshold ||
        Math.abs(state.velocity.z - prevState.velocity.z) > velThreshold;
      
      if (velChanged) {
        optimizedState.velocity = {
          x: Number(state.velocity.x.toFixed(1)),
          y: Number(state.velocity.y.toFixed(1)),
          z: Number(state.velocity.z.toFixed(1))
        };
      }
      
      // Only include inputs if changed
      const inputsChanged = 
        state.inputs.throttle !== prevState.inputs.throttle ||
        state.inputs.pitch !== prevState.inputs.pitch ||
        state.inputs.roll !== prevState.inputs.roll ||
        state.inputs.yaw !== prevState.inputs.yaw;
      
      if (inputsChanged) {
        optimizedState.inputs = {
          throttle: Number(state.inputs.throttle.toFixed(2)),
          pitch: Number(state.inputs.pitch.toFixed(2)),
          roll: Number(state.inputs.roll.toFixed(2)),
          yaw: Number(state.inputs.yaw.toFixed(2))
        };
      }
      
      // Always include health if it changed
      if (state.health !== prevState.health) {
        optimizedState.health = state.health;
      }
    } else {
      // First state, include everything
      optimizedState.position = {
        x: Number(state.position.x.toFixed(2)),
        y: Number(state.position.y.toFixed(2)),
        z: Number(state.position.z.toFixed(2))
      };
      
      optimizedState.rotation = {
        x: Number(state.rotation.x.toFixed(3)),
        y: Number(state.rotation.y.toFixed(3)),
        z: Number(state.rotation.z.toFixed(3)),
        w: Number(state.rotation.w.toFixed(3))
      };
      
      optimizedState.velocity = {
        x: Number(state.velocity.x.toFixed(1)),
        y: Number(state.velocity.y.toFixed(1)),
        z: Number(state.velocity.z.toFixed(1))
      };
      
      optimizedState.inputs = {
        throttle: Number(state.inputs.throttle.toFixed(2)),
        pitch: Number(state.inputs.pitch.toFixed(2)),
        roll: Number(state.inputs.roll.toFixed(2)),
        yaw: Number(state.inputs.yaw.toFixed(2))
      };
      
      optimizedState.health = state.health;
      optimizedState.aircraft = state.aircraft;
    }
    
    return optimizedState;
  }
  
  /**
   * Handle connection to the server
   */
  handleConnect() {
    console.log('Connected to multiplayer server');
    this.connected = true;
    this.reconnecting = false;
    
    // Request friends list and game state on connect
    this.socket.emit('getFriendsList');
    
    // Notify game of connection
    if (this.game && this.game.onConnect) {
      this.game.onConnect();
    }
  }
  
  /**
   * Handle disconnection from the server
   */
  handleDisconnect(reason) {
    console.log(`Disconnected from server: ${reason}`);
    this.connected = false;
    
    // Different handling based on reason
    if (reason === 'io server disconnect') {
      // Server forced disconnect, don't reconnect
      this.disconnect();
    } else if (reason === 'transport close' || reason === 'ping timeout') {
      // Network issue, reconnection will be automatic
      this.reconnecting = true;
    }
    
    // Notify game of disconnection
    if (this.game && this.game.onDisconnect) {
      this.game.onDisconnect(reason);
    }
  }
  
  /**
   * Handle connection error
   */
  handleConnectionError(error) {
    console.error('Connection error:', error);
    
    // Notify game of error
    if (this.game && this.game.onConnectionError) {
      this.game.onConnectionError(error);
    }
  }
  
  /**
   * Handle reconnection attempt
   */
  handleReconnectAttempt(attemptNumber) {
    console.log(`Attempting to reconnect: attempt ${attemptNumber}`);
    this.reconnecting = true;
    
    // Notify game of reconnect attempt
    if (this.game && this.game.onReconnectAttempt) {
      this.game.onReconnectAttempt(attemptNumber);
    }
  }
  
  /**
   * Handle game state update from server
   */
  handleGameState(state) {
    // Update local game state
    this.gameState = {
      ...this.gameState,
      ...state
    };
    
    // Notify game of state change
    if (this.game && this.game.onGameStateUpdate) {
      this.game.onGameStateUpdate(this.gameState);
    }
  }
  
  /**
   * Handle new player joining
   */
  handlePlayerJoined(player) {
    console.log(`Player joined: ${player.id} (${player.username})`);
    
    // Add to players map
    this.players.set(player.id, {
      ...player,
      lastUpdate: Date.now(),
      renderable: null, // Will be created by game
      stateBuffer: [] // Buffer for interpolation
    });
    
    // Notify game of new player
    if (this.game && this.game.onPlayerJoined) {
      this.game.onPlayerJoined(player);
    }
  }
  
  /**
   * Handle player leaving
   */
  handlePlayerLeft(playerId) {
    console.log(`Player left: ${playerId}`);
    
    // Get player before removing
    const player = this.players.get(playerId);
    
    // Remove from players map
    this.players.delete(playerId);
    
    // Notify game of player leaving
    if (this.game && this.game.onPlayerLeft && player) {
      this.game.onPlayerLeft(player);
    }
  }
  
  /**
   * Handle player states update from server
   */
  handlePlayerStates(states) {
    // Update metrics
    this.metrics.packetsReceived++;
    this.metrics.bytesReceived += JSON.stringify(states).length;
    
    // Process each state
    for (const state of states) {
      // Skip own player, we use prediction for local player
      if (state.id === this.playerId) continue;
      
      const player = this.players.get(state.id);
      if (player) {
        // Update player's state
        player.lastUpdate = Date.now();
        
        // Add to interpolation buffer
        this.entityInterpolation.addState(state);
        
        // Merge received state with player data
        this.players.set(state.id, {
          ...player,
          ...state
        });
      } else {
        // Unknown player, request full state
        this.socket.emit('requestPlayerInfo', state.id);
      }
    }
  }
  
  /**
   * Handle server reconciliation
   */
  handleServerReconciliation(correction) {
    // Find matching state in history
    const historyState = this.stateHistory.find(state => state.sequence === correction.sequence);
    
    if (historyState) {
      // Calculate position difference
      const posDiff = new THREE.Vector3(
        correction.position.x - historyState.position.x,
        correction.position.y - historyState.position.y,
        correction.position.z - historyState.position.z
      );
      
      // If difference is significant, apply correction
      if (posDiff.length() > CORRECTION_THRESHOLD) {
        // Pass to prediction system for correction
        this.predictionSystem.applyServerCorrection(correction);
        
        if (this.debug) {
          console.debug(`Applied server correction: ${posDiff.length().toFixed(2)} units`);
        }
      }
    }
  }
  
  /**
   * Handle projectile fired event
   */
  handleProjectileFired(data) {
    // Notify game of projectile
    if (this.game && this.game.onProjectileFired) {
      this.game.onProjectileFired(data);
    }
  }
  
  /**
   * Handle projectile hit event
   */
  handleProjectileHit(data) {
    // Notify game of hit
    if (this.game && this.game.onProjectileHit) {
      this.game.onProjectileHit(data);
    }
  }
  
  /**
   * Handle player damaged event
   */
  handlePlayerDamaged(data) {
    // Update local player health if it's us
    if (data.id === this.playerId && this.flightModel) {
      this.flightModel.applyDamage(data.damage, data.damageType);
    }
    
    // Update player in map
    const player = this.players.get(data.id);
    if (player) {
      player.health = data.health;
      this.players.set(data.id, player);
    }
    
    // Notify game of damage
    if (this.game && this.game.onPlayerDamaged) {
      this.game.onPlayerDamaged(data);
    }
  }
  
  /**
   * Handle player destroyed event
   */
  handlePlayerDestroyed(data) {
    // Update player in map
    const player = this.players.get(data.id);
    if (player) {
      player.health = 0;
      player.destroyed = true;
      this.players.set(data.id, player);
    }
    
    // Special handling if it's the local player
    if (data.id === this.playerId && this.flightModel) {
      this.flightModel.handleDestruction();
    }
    
    // Notify game of destruction
    if (this.game && this.game.onPlayerDestroyed) {
      this.game.onPlayerDestroyed(data);
    }
  }
  
  /**
   * Handle powerup spawned event
   */
  handlePowerupSpawned(data) {
    // Notify game of powerup
    if (this.game && this.game.onPowerupSpawned) {
      this.game.onPowerupSpawned(data);
    }
  }
  
  /**
   * Handle powerup collected event
   */
  handlePowerupCollected(data) {
    // Apply powerup if it's the local player
    if (data.playerId === this.playerId && this.flightModel) {
      this.flightModel.applyPowerup(data.powerupType, data.powerupEffect);
    }
    
    // Notify game of collection
    if (this.game && this.game.onPowerupCollected) {
      this.game.onPowerupCollected(data);
    }
  }
  
  /**
   * Handle checkpoint reached event
   */
  handleCheckpointReached(data) {
    // Notify game of checkpoint
    if (this.game && this.game.onCheckpointReached) {
      this.game.onCheckpointReached(data);
    }
  }
  
  /**
   * Handle chat message received
   */
  handleChatMessage(data) {
    // Notify game of message
    if (this.game && this.game.onChatMessage) {
      this.game.onChatMessage(data);
    }
  }
  
  /**
   * Handle friends list update
   */
  handleFriendsList(data) {
    this.friends.list = data.friends;
    this.friends.requests.incoming = data.incomingRequests;
    this.friends.requests.outgoing = data.outgoingRequests;
    
    // Notify game of friends list update
    if (this.game && this.game.onFriendsListUpdate) {
      this.game.onFriendsListUpdate(this.friends);
    }
  }
  
  /**
   * Handle friend request received
   */
  handleFriendRequest(data) {
    // Add to incoming requests
    this.friends.requests.incoming.push(data);
    
    // Notify game of friend request
    if (this.game && this.game.onFriendRequest) {
      this.game.onFriendRequest(data);
    }
  }
  
  /**
   * Handle friend request accepted
   */
  handleFriendRequestAccepted(data) {
    // Add to friends list
    this.friends.list.push(data.friend);
    
    // Remove from outgoing requests
    this.friends.requests.outgoing = this.friends.requests.outgoing.filter(
      request => request.id !== data.friend.id
    );
    
    // Notify game of accepted request
    if (this.game && this.game.onFriendRequestAccepted) {
      this.game.onFriendRequestAccepted(data);
    }
  }
  
  /**
   * Handle friend online status change
   */
  handleFriendOnlineStatus(data) {
    // Update friend's online status
    this.friends.online[data.friendId] = data.online;
    
    // Notify game of status change
    if (this.game && this.game.onFriendOnlineStatus) {
      this.game.onFriendOnlineStatus(data);
    }
  }
  
  /**
   * Handle room created event
   */
  handleRoomCreated(data) {
    this.roomId = data.roomId;
    
    // Notify game of room creation
    if (this.game && this.game.onRoomCreated) {
      this.game.onRoomCreated(data);
    }
  }
  
  /**
   * Handle room joined event
   */
  handleRoomJoined(data) {
    this.roomId = data.roomId;
    this.gameMode = data.gameMode;
    
    // Notify game of room join
    if (this.game && this.game.onRoomJoined) {
      this.game.onRoomJoined(data);
    }
  }
  
  /**
   * Handle room error event
   */
  handleRoomError(data) {
    console.error(`Room error: ${data.message}`);
    
    // Notify game of room error
    if (this.game && this.game.onRoomError) {
      this.game.onRoomError(data);
    }
  }
  
  /**
   * Handle match invite received
   */
  handleMatchInvite(data) {
    // Notify game of match invite
    if (this.game && this.game.onMatchInvite) {
      this.game.onMatchInvite(data);
    }
  }
  
  /**
   * Handle error events
   */
  handleError(error) {
    console.error('Server error:', error);
    
    // Notify game of error
    if (this.game && this.game.onServerError) {
      this.game.onServerError(error);
    }
  }
  
  /**
   * Handle version mismatch
   */
  handleVersionMismatch(data) {
    console.warn(`Version mismatch: Client ${data.clientVersion} vs Server ${data.serverVersion}`);
    
    // Notify game of version mismatch
    if (this.game && this.game.onVersionMismatch) {
      this.game.onVersionMismatch(data);
    }
  }
  
  /**
   * Fire a weapon
   */
  fireWeapon(weaponType, targetId = null) {
    if (!this.socket || !this.connected) return;
    
    this.socket.emit('fireWeapon', {
      weaponType,
      targetId,
      timestamp: Date.now()
    });
  }
  
  /**
   * Send a chat message
   */
  sendChatMessage(message, receiverId = null) {
    if (!this.socket || !this.connected) return;
    
    this.socket.emit('chatMessage', {
      message,
      receiverId, // null for all players, specific ID for private message
      timestamp: Date.now()
    });
  }
  
  /**
   * Create a private game room
   */
  createRoom(settings) {
    if (!this.socket || !this.connected) return;
    
    this.socket.emit('createRoom', settings);
  }
  
  /**
   * Join an existing room
   */
  joinRoom(roomId, password = null) {
    if (!this.socket || !this.connected) return;
    
    this.socket.emit('joinRoom', {
      roomId,
      password
    });
  }
  
  /**
   * Leave the current room
   */
  leaveRoom() {
    if (!this.socket || !this.connected || !this.roomId) return;
    
    this.socket.emit('leaveRoom');
    this.roomId = null;
  }
  
  /**
   * Start the game (host only)
   */
  startGame() {
    if (!this.socket || !this.connected || !this.roomId) return;
    
    this.socket.emit('startGame');
  }
  
  /**
   * Send a friend request
   */
  sendFriendRequest(username) {
    if (!this.socket || !this.connected) return;
    
    this.socket.emit('friendRequest', { username });
  }
  
  /**
   * Accept a friend request
   */
  acceptFriendRequest(requestId) {
    if (!this.socket || !this.connected) return;
    
    this.socket.emit('acceptFriendRequest', { requestId });
  }
  
  /**
   * Reject a friend request
   */
  rejectFriendRequest(requestId) {
    if (!this.socket || !this.connected) return;
    
    this.socket.emit('rejectFriendRequest', { requestId });
  }
  
  /**
   * Remove a friend
   */
  removeFriend(friendId) {
    if (!this.socket || !this.connected) return;
    
    this.socket.emit('removeFriend', { friendId });
  }
  
  /**
   * Invite a friend to a game
   */
  inviteFriendToGame(friendId) {
    if (!this.socket || !this.connected || !this.roomId) return;
    
    this.socket.emit('inviteToGame', { friendId, roomId: this.roomId });
  }
  
  /**
   * Join a public match
   */
  joinPublicMatch(gameMode) {
    if (!this.socket || !this.connected) return;
    
    this.socket.emit('joinPublicMatch', { gameMode });
  }
  
  /**
   * Toggle debug mode
   */
  toggleDebug() {
    this.debug = !this.debug;
    console.log(`Multiplayer debug mode: ${this.debug ? 'enabled' : 'disabled'}`);
    
    // Also toggle debug on subsystems
    this.entityInterpolation.debug = this.debug;
    this.predictionSystem.debug = this.debug;
  }
  
  /**
   * Get network metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }
}

/**
 * Entity interpolation system for smooth movement
 */
class EntityInterpolation {
  constructor() {
    this.stateBuffers = new Map(); // Map of entity ID -> state buffer
    this.renderTime = 0; // Current render time, offset from real time
    this.bufferTime = INTERPOLATION_BUFFER; // Time to buffer in ms
    this.debug = false;
  }
  
  /**
   * Add a state to the buffer for an entity
   */
  addState(state) {
    // Ensure we have a buffer for this entity
    if (!this.stateBuffers.has(state.id)) {
      this.stateBuffers.set(state.id, []);
    }
    
    // Get the buffer
    const buffer = this.stateBuffers.get(state.id);
    
    // Add the state to the buffer
    buffer.push({
      ...state,
      timestamp: state.timestamp || Date.now()
    });
    
    // Sort buffer by timestamp (just in case)
    buffer.sort((a, b) => a.timestamp - b.timestamp);
    
    // Limit buffer size
    while (buffer.length > 100) {
      buffer.shift();
    }
  }
  
  /**
   * Update interpolation for all entities
   */
  update() {
    // Calculate render time (current time - buffer time)
    this.renderTime = Date.now() - this.bufferTime;
    
    // Process each entity
    for (const [entityId, buffer] of this.stateBuffers) {
      // Remove old states
      const oldestAllowed = this.renderTime - 1000; // 1 second
      while (buffer.length > 2 && buffer[1].timestamp < oldestAllowed) {
        buffer.shift();
      }
      
      // Need at least 2 states to interpolate
      if (buffer.length < 2) continue;
      
      // Find the two states to interpolate between
      let i = 0;
      while (i < buffer.length - 1 && buffer[i + 1].timestamp <= this.renderTime) {
        i++;
      }
      
      // If we're past the last state in the buffer, don't interpolate
      if (i >= buffer.length - 1) continue;
      
      const before = buffer[i];
      const after = buffer[i + 1];
      
      // Calculate interpolation factor
      const timeDelta = after.timestamp - before.timestamp;
      const factor = (this.renderTime - before.timestamp) / timeDelta;
      
      // Create interpolated state
      const interpolated = this.interpolateStates(before, after, factor);
      
      // Emit interpolated state
      this.onInterpolatedState(entityId, interpolated);
      
      if (this.debug && entityId === buffer[0].id) {
        console.debug(`Interpolation: t=${factor.toFixed(2)}, buffer=${buffer.length}`);
      }
    }
  }
  
  /**
   * Interpolate between two states
   */
  interpolateStates(before, after, factor) {
    // Clamp factor to 0-1
    const t = Math.max(0, Math.min(1, factor));
    
    // Create base interpolated state
    const interpolated = {
      id: before.id,
      timestamp: this.renderTime,
      health: before.health // Don't interpolate health
    };
    
    // Interpolate position if available in both states
    if (before.position && after.position) {
      interpolated.position = {
        x: before.position.x + (after.position.x - before.position.x) * t,
        y: before.position.y + (after.position.y - before.position.y) * t,
        z: before.position.z + (after.position.z - before.position.z) * t
      };
    }
    
    // Interpolate rotation if available (using quaternion slerp)
    if (before.rotation && after.rotation) {
      const q1 = new THREE.Quaternion(
        before.rotation.x,
        before.rotation.y,
        before.rotation.z,
        before.rotation.w
      );
      
      const q2 = new THREE.Quaternion(
        after.rotation.x,
        after.rotation.y,
        after.rotation.z,
        after.rotation.w
      );
      
      const interpolatedQ = new THREE.Quaternion().slerpQuaternions(q1, q2, t);
      
      interpolated.rotation = {
        x: interpolatedQ.x,
        y: interpolatedQ.y,
        z: interpolatedQ.z,
        w: interpolatedQ.w
      };
    }
    
    // Linear interpolation for velocity
    if (before.velocity && after.velocity) {
      interpolated.velocity = {
        x: before.velocity.x + (after.velocity.x - before.velocity.x) * t,
        y: before.velocity.y + (after.velocity.y - before.velocity.y) * t,
        z: before.velocity.z + (after.velocity.z - before.velocity.z) * t
      };
    }
    
    return interpolated;
  }
  
  /**
   * Handle interpolated state (override in subclass or replace with event)
   */
  onInterpolatedState(entityId, state) {
    // Override or use event system
  }
}

/**
 * Prediction system for local player movement
 */
class PredictionSystem {
  constructor(flightModel) {
    this.flightModel = flightModel;
    this.pendingCorrections = [];
    this.lastCorrectionTime = 0;
    this.correctionBlendFactor = 0.1; // How fast to blend in corrections
    this.debug = false;
  }
  
  /**
   * Apply a server correction to the local flight model
   */
  applyServerCorrection(correction) {
    // Add to pending corrections
    this.pendingCorrections.push({
      ...correction,
      timestamp: Date.now()
    });
  }
  
  /**
   * Update the prediction system
   */
  update() {
    // Nothing to do without flight model
    if (!this.flightModel) return;
    
    // Process pending corrections
    if (this.pendingCorrections.length > 0 && 
        Date.now() - this.lastCorrectionTime > 50) { // Limit frequency of corrections
      
      // Get next correction
      const correction = this.pendingCorrections.shift();
      
      // Apply position correction smoothly
      this.applyPositionCorrection(correction);
      
      // Apply rotation correction smoothly
      this.applyRotationCorrection(correction);
      
      this.lastCorrectionTime = Date.now();
    }
  }
  
  /**
   * Apply position correction to flight model
   */
  applyPositionCorrection(correction) {
    // Get current position from flight model
    const currentPos = this.flightModel.getState().position;
    
    // Calculate correction vector
    const correctionPos = new THREE.Vector3(
      correction.position.x,
      correction.position.y,
      correction.position.z
    );
    
    // Calculate difference
    const diff = new THREE.Vector3().subVectors(correctionPos, currentPos);
    
    // Apply partial correction based on blend factor
    const correctionAmount = diff.multiplyScalar(this.correctionBlendFactor);
    
    // Apply to flight model
    this.flightModel.applyPositionCorrection(correctionAmount);
    
    if (this.debug) {
      console.debug(`Position correction: ${diff.length().toFixed(2)} units`);
    }
  }
  
  /**
   * Apply rotation correction to flight model
   */
  applyRotationCorrection(correction) {
    // Only apply if rotation data exists
    if (!correction.rotation) return;
    
    // Get current rotation from flight model
    const currentRot = this.flightModel.getState().quaternion;
    
    // Create quaternions
    const currentQ = new THREE.Quaternion(
      currentRot._x,
      currentRot._y,
      currentRot._z,
      currentRot._w
    );
    
    const targetQ = new THREE.Quaternion(
      correction.rotation.x,
      correction.rotation.y,
      correction.rotation.z,
      correction.rotation.w
    );
    
    // Interpolate between current and target
    const correctedQ = new THREE.Quaternion().slerpQuaternions(
      currentQ,
      targetQ,
      this.correctionBlendFactor
    );
    
    // Apply to flight model
    this.flightModel.applyRotationCorrection(correctedQ);
  }
}

/**
 * Game modes configuration
 */
export const GameModes = {
  DOGFIGHT: {
    id: 'dogfight',
    name: 'Dogfight',
    description: 'Free-for-all aerial combat',
    maxPlayers: 12,
    teams: false,
    respawn: true,
    scoreLimit: 25,
    timeLimit: 600, // 10 minutes
    settings: {
      powerups: true,
      friendlyFire: false
    }
  },
  
  TEAM_BATTLE: {
    id: 'team_battle',
    name: 'Team Battle',
    description: 'Team-based aerial combat',
    maxPlayers: 16,
    teams: true,
    respawn: true,
    scoreLimit: 50,
    timeLimit: 900, // 15 minutes
    settings: {
      powerups: true,
      friendlyFire: false
    }
  },
  
  RACE: {
    id: 'race',
    name: 'Air Race',
    description: 'Race through checkpoints',
    maxPlayers: 8,
    teams: false,
    respawn: true,
    laps: 3,
    timeLimit: 600, // 10 minutes
    settings: {
      weapons: false,
      boostPowerups: true
    }
  },
  
  SURVIVAL: {
    id: 'survival',
    name: 'Survival',
    description: 'Last plane flying wins',
    maxPlayers: 10,
    teams: false,
    respawn: false,
    timeLimit: 600, // 10 minutes
    settings: {
      shrinkingBoundary: true,
      powerups: true
    }
  },
  
  CUSTOM: {
    id: 'custom',
    name: 'Custom Game',
    description: 'Customizable game settings',
    maxPlayers: 16,
    teams: false,
    respawn: true,
    scoreLimit: 25,
    timeLimit: 600, // 10 minutes
    settings: {}
  }
};

/**
 * Helper function to create a game room configuration
 */
export function createGameConfig(gameMode, settings = {}) {
  // Start with base game mode settings
  const baseConfig = GameModes[gameMode.toUpperCase()] || GameModes.CUSTOM;
  
  // Merge with custom settings
  return {
    ...baseConfig,
    settings: {
      ...baseConfig.settings,
      ...settings
    }
  };
}

/**
 * Usage Example:
 * 
 * // Create multiplayer manager
 * const multiplayer = new MultiplayerManager(gameInstance, flightModelInstance);
 * 
 * // Connect to server with auth token
 * multiplayer.connect('user-auth-token-123');
 * 
 * // Join a public match
 * multiplayer.joinPublicMatch('dogfight');
 * 
 * // Or create a private room
 * multiplayer.createRoom(createGameConfig('TEAM_BATTLE', { friendlyFire: true }));
 * 
 * // Send a friend request
 * multiplayer.sendFriendRequest('PlayerName');
 */