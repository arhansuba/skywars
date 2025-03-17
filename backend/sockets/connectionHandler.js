/**
 * Socket.io Connection Handler for SkyWars
 * 
 * Manages player connections, authentication, session tracking,
 * and connection monitoring.
 */

const User = require('../models/User');
const GameSession = require('../models/GameSession');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');

// Map to track active connections
const activeSessions = new Map();

/**
 * Initialize connection handler with Socket.io server
 * @param {SocketIO.Server} io - Socket.io server instance
 */
const initialize = (io) => {
  // Global connection middleware for tracking connections
  io.use(async (socket, next) => {
    try {
      // Attach timestamp to connection
      socket.connectionTime = Date.now();
      
      // Extract user data from authenticated socket
      const { id: userId, username } = socket.user;
      
      // Update user's online status in database
      await User.findByIdAndUpdate(userId, {
        isOnline: true,
        lastSeen: new Date(),
        socketId: socket.id
      });
      
      // Track connection in memory
      activeSessions.set(socket.id, {
        userId,
        username,
        connectionTime: socket.connectionTime,
        rooms: new Set(),
        gameId: null,
        clientInfo: {
          ip: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent'],
          transport: socket.conn.transport.name
        }
      });
      
      logger.info(`User connected: ${username} (${userId}) - Socket ID: ${socket.id}`);
      next();
    } catch (error) {
      logger.error(`Connection middleware error: ${error.message}`);
      next(error);
    }
  });
  
  // Handle disconnections globally
  io.on('connection', (socket) => {
    socket.on('disconnect', async (reason) => {
      try {
        const { id: userId, username } = socket.user;
        const sessionData = activeSessions.get(socket.id);
        
        // Log disconnect with details
        logger.info(`User disconnected: ${username} (${userId}) - Socket ID: ${socket.id} - Reason: ${reason}`);
        
        // Calculate session duration
        const sessionDuration = Date.now() - socket.connectionTime;
        
        // Update user's online status in database
        await User.findByIdAndUpdate(userId, {
          isOnline: false,
          lastSeen: new Date(),
          socketId: null
        });
        
        // Handle active game session if exists
        if (sessionData && sessionData.gameId) {
          await handlePlayerDisconnectFromGame(userId, sessionData.gameId);
        }
        
        // Remove from active sessions
        activeSessions.delete(socket.id);
        
        // Log session stats
        logger.debug(`Session stats - User: ${username}, Duration: ${Math.floor(sessionDuration / 1000)}s`);
      } catch (error) {
        logger.error(`Disconnect handler error: ${error.message}`);
      }
    });
  });
  
  // Middleware to log reconnection attempts
  io.of('/').use((socket, next) => {
    const reconnectionAttempt = socket.handshake.auth.reconnectionAttempt;
    if (reconnectionAttempt) {
      logger.info(`Reconnection attempt ${reconnectionAttempt} for user: ${socket.user?.username || 'Unknown'}`);
    }
    next();
  });
  
  // Start a periodic cleanup of stale connections
  startPeriodicCleanup(io);
  
  logger.info('Connection handler initialized');
};

/**
 * Handle player disconnection from an active game
 * @param {string} userId - User ID
 * @param {string} gameId - Game session ID
 */
const handlePlayerDisconnectFromGame = async (userId, gameId) => {
  try {
    // Get current game session
    const gameSession = await GameSession.findById(gameId);
    
    if (!gameSession) {
      logger.warn(`Game session not found for disconnect handling: ${gameId}`);
      return;
    }
    
    // Update player's status in the game
    const playerIndex = gameSession.players.findIndex(p => p.userId.toString() === userId);
    
    if (playerIndex !== -1) {
      gameSession.players[playerIndex].status = 'disconnected';
      gameSession.players[playerIndex].disconnectedAt = new Date();
      
      // Check if grace period is enabled for reconnection
      if (gameSession.settings.allowReconnection) {
        // Mark player as disconnected but don't remove
        gameSession.players[playerIndex].canReconnect = true;
        gameSession.players[playerIndex].reconnectExpiry = new Date(
          Date.now() + (gameSession.settings.reconnectionTimeoutSeconds * 1000)
        );
      } else {
        // Remove player from active players list
        gameSession.activePlayers = gameSession.activePlayers.filter(id => id.toString() !== userId);
      }
      
      await gameSession.save();
      
      logger.info(`Player marked as disconnected in game ${gameId}: ${userId}`);
      
      // Check if game should end due to lack of players
      if (gameSession.activePlayers.length < gameSession.settings.minPlayers) {
        gameSession.status = 'ending';
        gameSession.endedAt = new Date();
        gameSession.endReason = 'insufficient_players';
        await gameSession.save();
        
        logger.info(`Game ${gameId} marked for ending due to insufficient players`);
      }
    }
  } catch (error) {
    logger.error(`Error handling player disconnect from game: ${error.message}`);
  }
};

/**
 * Start periodic cleanup of stale connections
 * @param {SocketIO.Server} io - Socket.io server instance
 */
const startPeriodicCleanup = (io) => {
  const CLEANUP_INTERVAL = 60000; // 1 minute
  
  setInterval(() => {
    try {
      const now = Date.now();
      const connectedSockets = io.sockets.sockets;
      
      // Check for stale connections
      for (const [socketId, socket] of connectedSockets) {
        const sessionData = activeSessions.get(socketId);
        
        // Skip if no session data
        if (!sessionData) continue;
        
        // Check for inactive connections (idle for more than 2 hours)
        const idleTime = now - sessionData.lastActivity;
        if (idleTime > 7200000) { // 2 hours in milliseconds
          logger.warn(`Closing stale connection for user ${sessionData.username} - Idle for ${Math.floor(idleTime / 60000)} minutes`);
          socket.disconnect(true);
        }
      }
      
      // Log active connection count
      logger.debug(`Active connections: ${connectedSockets.size}, Tracked sessions: ${activeSessions.size}`);
    } catch (error) {
      logger.error(`Error in periodic connection cleanup: ${error.message}`);
    }
  }, CLEANUP_INTERVAL);
};

/**
 * Update user activity timestamp
 * @param {string} socketId - Socket ID
 */
const updateUserActivity = (socketId) => {
  const session = activeSessions.get(socketId);
  if (session) {
    session.lastActivity = Date.now();
  }
};

/**
 * Track user joining a room
 * @param {string} socketId - Socket ID 
 * @param {string} room - Room name
 */
const trackUserJoinRoom = (socketId, room) => {
  const session = activeSessions.get(socketId);
  if (session) {
    session.rooms.add(room);
    
    // If it's a game room, extract and store the game ID
    if (room.startsWith('game:')) {
      session.gameId = room.substring(5);
    }
  }
};

/**
 * Track user leaving a room
 * @param {string} socketId - Socket ID
 * @param {string} room - Room name
 */
const trackUserLeaveRoom = (socketId, room) => {
  const session = activeSessions.get(socketId);
  if (session) {
    session.rooms.delete(room);
    
    // If it was a game room, clear the game ID
    if (room.startsWith('game:') && session.gameId === room.substring(5)) {
      session.gameId = null;
    }
  }
};

/**
 * Get all active sessions
 * @returns {Array} Array of active session data
 */
const getActiveSessions = () => {
  return Array.from(activeSessions.values());
};

/**
 * Get count of active connections
 * @returns {number} Count of active connections
 */
const getActiveConnectionCount = () => {
  return activeSessions.size;
};

/**
 * Get session data for a specific user
 * @param {string} userId - User ID
 * @returns {Object|null} Session data or null if not found
 */
const getSessionByUserId = (userId) => {
  for (const [socketId, session] of activeSessions.entries()) {
    if (session.userId === userId) {
      return { socketId, ...session };
    }
  }
  return null;
};

module.exports = {
  initialize,
  updateUserActivity,
  trackUserJoinRoom,
  trackUserLeaveRoom,
  getActiveSessions,
  getActiveConnectionCount,
  getSessionByUserId
};