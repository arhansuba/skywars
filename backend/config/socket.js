/**
 * Socket.io Configuration for SkyWars
 * 
 * This file sets up Socket.io server configuration, middleware,
 * namespace handlers, and authentication for real-time communication.
 */

const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const logger = require('../utils/logger');

// Load environment variables
const {
  JWT_SECRET = 'your-secret-key',
  REDIS_URL = 'redis://localhost:6379',
  SOCKET_PING_TIMEOUT = 10000,
  SOCKET_PING_INTERVAL = 5000,
  SOCKET_CORS_ORIGIN = '*',
  NODE_ENV = 'development',
} = process.env;

// Socket.io instance
let io = null;

/**
 * Initialize Socket.io server
 * @param {http.Server} server - HTTP server instance
 * @returns {socketIO.Server} Socket.io server instance
 */
const initialize = async (server) => {
  // Configure Socket.io
  io = socketIO(server, {
    cors: {
      origin: SOCKET_CORS_ORIGIN.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: parseInt(SOCKET_PING_TIMEOUT, 10),
    pingInterval: parseInt(SOCKET_PING_INTERVAL, 10),
    transports: ['websocket', 'polling'],
  });

  // Set up Redis adapter for horizontal scaling if not in test mode
  if (NODE_ENV !== 'test') {
    try {
      const pubClient = createClient({ url: REDIS_URL });
      const subClient = pubClient.duplicate();
      
      await Promise.all([pubClient.connect(), subClient.connect()]);
      
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('Socket.io Redis adapter initialized');
    } catch (error) {
      logger.warn(`Failed to initialize Redis adapter: ${error.message}`);
      logger.warn('Falling back to in-memory adapter');
    }
  }

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      // Get token from handshake auth, query, or cookies
      let token = null;
      
      if (socket.handshake.auth && socket.handshake.auth.token) {
        token = socket.handshake.auth.token;
      } else if (socket.handshake.query && socket.handshake.query.token) {
        token = socket.handshake.query.token;
      } else if (socket.handshake.headers.cookie) {
        const cookies = cookie.parse(socket.handshake.headers.cookie);
        token = cookies.token;
      }

      if (!token) {
        throw new Error('Authentication token missing');
      }

      // Verify JWT token
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Attach user data to socket
      socket.user = {
        id: decoded.userId,
        username: decoded.username,
        role: decoded.role || 'user',
      };
      
      next();
    } catch (error) {
      logger.warn(`Socket authentication failed: ${error.message}`);
      next(new Error('Authentication failed'));
    }
  });

  // Set up namespaces
  setupNamespaces(io);

  logger.info('Socket.io server initialized');
  return io;
};

/**
 * Setup Socket.io namespaces and their event handlers
 * @param {socketIO.Server} io - Socket.io server instance
 */
const setupNamespaces = (io) => {
  // Game namespace for gameplay communication
  const gameNamespace = io.of('/game');
  
  gameNamespace.on('connection', (socket) => {
    logger.info(`Player connected to game namespace: ${socket.user.username} (${socket.id})`);
    
    // Join player to their specific room based on game session
    socket.on('join-game', (gameId) => {
      socket.join(`game:${gameId}`);
      gameNamespace.to(`game:${gameId}`).emit('player-joined', {
        id: socket.user.id,
        username: socket.user.username,
      });
    });
    
    // Handle player movement updates
    socket.on('player-movement', (data) => {
      // Broadcast to all players in the game except sender
      socket.to(`game:${data.gameId}`).emit('player-moved', {
        playerId: socket.user.id,
        position: data.position,
        rotation: data.rotation,
        velocity: data.velocity,
        timestamp: data.timestamp,
      });
    });
    
    // Handle game actions (shooting, abilities, etc.)
    socket.on('player-action', (data) => {
      socket.to(`game:${data.gameId}`).emit('player-action', {
        playerId: socket.user.id,
        actionType: data.actionType,
        targetId: data.targetId,
        position: data.position,
        timestamp: data.timestamp,
      });
    });
    
    // Handle player disconnection
    socket.on('disconnect', () => {
      // Find all game rooms this socket was in
      const gameRooms = Array.from(socket.rooms)
        .filter(room => room.startsWith('game:'))
        .map(room => room.substring(5));
      
      // Notify other players in those rooms
      gameRooms.forEach(gameId => {
        gameNamespace.to(`game:${gameId}`).emit('player-left', {
          id: socket.user.id,
          username: socket.user.username,
        });
      });
      
      logger.info(`Player disconnected: ${socket.user.username} (${socket.id})`);
    });
  });
  
  // Chat namespace for in-game chat
  const chatNamespace = io.of('/chat');
  
  chatNamespace.on('connection', (socket) => {
    logger.info(`Player connected to chat namespace: ${socket.user.username} (${socket.id})`);
    
    // Join global and game-specific chat rooms
    socket.on('join-chat', (data) => {
      // Join global chat
      socket.join('global');
      
      // Join game-specific chat if provided
      if (data.gameId) {
        socket.join(`game:${data.gameId}`);
      }
    });
    
    // Handle chat messages
    socket.on('chat-message', (data) => {
      const messageData = {
        userId: socket.user.id,
        username: socket.user.username,
        message: data.message,
        timestamp: new Date().toISOString(),
      };
      
      // Broadcast to appropriate room
      if (data.gameId) {
        chatNamespace.to(`game:${data.gameId}`).emit('chat-message', messageData);
      } else {
        chatNamespace.to('global').emit('chat-message', messageData);
      }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`Player disconnected from chat: ${socket.user.username} (${socket.id})`);
    });
  });
};

/**
 * Get the Socket.io server instance
 * @returns {socketIO.Server} Socket.io server instance
 */
const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initialize() first.');
  }
  return io;
};

/**
 * Shutdown Socket.io server
 * @returns {Promise<void>}
 */
const shutdown = async () => {
  if (io) {
    return new Promise((resolve) => {
      io.close(() => {
        logger.info('Socket.io server closed');
        io = null;
        resolve();
      });
    });
  }
};

module.exports = {
  initialize,
  getIO,
  shutdown,
};