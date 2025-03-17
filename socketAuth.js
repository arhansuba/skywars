const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Socket.io middleware for authenticating users
 * @param {Object} socket - Socket.io socket
 * @param {Function} next - Callback to continue connection
 */
module.exports = async (socket, next) => {
  try {
    // Get token from handshake query or headers
    const token = 
      socket.handshake.auth.token || 
      socket.handshake.query.token || 
      socket.handshake.headers.authorization?.split(' ')[1];
    
    if (token) {
      try {
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Find user by ID
        const user = await User.findById(decoded.id).select('-password');
        
        if (user) {
          // Attach user to socket
          socket.user = {
            id: user._id,
            username: user.username,
            email: user.email,
            isAdmin: user.isAdmin,
            walletAddress: user.walletAddress
          };
          
          logger.info(`Authenticated socket connection: ${socket.id} (User: ${user.username})`);
        }
      } catch (error) {
        logger.warn(`Invalid token for socket ${socket.id}: ${error.message}`);
        // Continue without user info but don't block connection
      }
    }
    
    // Always allow connection, even without valid auth
    next();
  } catch (error) {
    logger.error(`Socket authentication error: ${error.message}`);
    next();
  }
};