// Main server entry point
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const gameRoutes = require('./routes/gameRoutes');
const tokenRoutes = require('./routes/tokenRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Import socket handlers
const socketAuth = require('./sockets/socketAuth');
const gameHandler = require('./sockets/gameHandler');
const chatHandler = require('./sockets/chatHandler');

// Import middleware
const { errorHandler } = require('./middleware/errorMiddleware');
const { notFound } = require('./middleware/notFoundMiddleware');

// Import config
const logger = require('./utils/logger');
const { connectDB } = require('./config/db');

// Create Express app
const app = express();
const server = http.createServer(app);

// Set up Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet()); // Security headers
app.use(compression()); // Compress responses
app.use(morgan('dev')); // Logging
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '1mb' })); // Parse JSON requests
app.use(express.urlencoded({ extended: true, limit: '1mb' })); // Parse URL-encoded requests

// Set static folder
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Global game state
const gameState = {
  players: new Map(), // All connected players
  sessions: new Map(), // Active game sessions
  lobbies: new Map(), // Waiting lobbies
  leaderboard: [], // Top players
  serverInfo: {
    startTime: Date.now(),
    maxPlayers: 0,
    totalSessions: 0
  }
};

// Socket.IO middleware for authentication
io.use(socketAuth);

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`New socket connection: ${socket.id}`);
  
  // Attach game state to socket for handlers to access
  socket.gameState = gameState;
  
  // Register socket handlers
  gameHandler(io, socket);
  chatHandler(io, socket);
  
  // Handle disconnection
  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
    
    // Clean up player data on disconnect
    if (socket.playerId) {
      const player = gameState.players.get(socket.playerId);
      if (player) {
        // Notify other players in the same session
        if (player.sessionId) {
          const session = gameState.sessions.get(player.sessionId);
          if (session) {
            // Remove player from session
            session.players.delete(socket.playerId);
            
            // Notify other players in session
            socket.to(player.sessionId).emit('player:left', {
              playerId: socket.playerId,
              username: player.username
            });
            
            // Close session if empty
            if (session.players.size === 0) {
              gameState.sessions.delete(player.sessionId);
              logger.info(`Session closed: ${player.sessionId}`);
            }
          }
        }
        
        // Remove player from lobby if present
        if (player.lobbyId) {
          const lobby = gameState.lobbies.get(player.lobbyId);
          if (lobby) {
            lobby.players.delete(socket.playerId);
            
            // Notify other players in lobby
            socket.to(player.lobbyId).emit('lobby:playerLeft', {
              playerId: socket.playerId,
              username: player.username
            });
            
            // Close lobby if empty
            if (lobby.players.size === 0) {
              gameState.lobbies.delete(player.lobbyId);
              logger.info(`Lobby closed: ${player.lobbyId}`);
            }
          }
        }
        
        // Remove player from global state
        gameState.players.delete(socket.playerId);
        logger.info(`Player removed: ${socket.playerId}`);
      }
    }
  });
});

// Update server stats periodically
setInterval(() => {
  gameState.serverInfo.maxPlayers = Math.max(gameState.serverInfo.maxPlayers, gameState.players.size);
  
  // Update leaderboard from database periodically
  require('./services/leaderboardService').updateLeaderboard()
    .then(leaderboard => {
      gameState.leaderboard = leaderboard;
    })
    .catch(err => {
      logger.error('Failed to update leaderboard', err);
    });
}, 60000); // Every minute

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  // Don't crash in development but do in production to get proper restart
  if (process.env.NODE_ENV === 'production') {
    server.close(() => process.exit(1));
  }
});

// Export for testing
module.exports = { app, server, io, gameState };