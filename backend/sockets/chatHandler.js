/**
 * Socket.io Chat Handler for SkyWars
 * 
 * Manages in-game chat functionality, including global chat,
 * game-specific chat, team chat, and private messages.
 */

const User = require('../models/User');
const GameSession = require('../models/GameSession');
const ChatMessage = require('../models/ChatMessage');
const logger = require('../utils/logger');
const { updateUserActivity, trackUserJoinRoom, trackUserLeaveRoom } = require('./connectionHandler');
const Filter = require('bad-words');

// Initialize profanity filter
const filter = new Filter();

// Rate limiting settings
const RATE_LIMIT = {
  message: 1000,  // 1 second between messages
  join: 5000      // 5 seconds between channel joins
};

// Message history cache (for recently joined users)
const messageHistory = {
  global: [],
  games: new Map(),
  channels: new Map()
};

// Cache for rate limiting
const lastMessageTime = new Map();

// Max message history size
const MAX_HISTORY_SIZE = 50;

/**
 * Initialize chat handler with Socket.io namespace
 * @param {SocketIO.Namespace} chatNamespace - Socket.io chat namespace
 */
const initialize = (chatNamespace) => {
  chatNamespace.on('connection', (socket) => {
    logger.debug(`Socket connected to chat namespace: ${socket.id}`);
    
    // Join default channels
    socket.on('join-chat', async (data) => {
      try {
        updateUserActivity(socket.id);
        
        const userId = socket.user.id;
        const username = socket.user.username;
        
        // Rate limiting for join operations
        const now = Date.now();
        const joinKey = `${socket.id}:join`;
        const lastJoinTime = lastMessageTime.get(joinKey) || 0;
        
        if (now - lastJoinTime < RATE_LIMIT.join) {
          socket.emit('chat-error', { 
            message: 'Too many channel join requests', 
            code: 'rate_limited'
          });
          return;
        }
        
        lastMessageTime.set(joinKey, now);
        
        // Always join global chat
        socket.join('global');
        trackUserJoinRoom(socket.id, 'global');
        
        // Send recent global messages
        if (messageHistory.global.length > 0) {
          socket.emit('chat-history', {
            channel: 'global',
            messages: messageHistory.global
          });
        }
        
        // Join game-specific chat if provided
        if (data.gameId) {
          // Verify that player is in this game
          const gameSession = await GameSession.findById(data.gameId);
          
          if (!gameSession) {
            socket.emit('chat-error', { 
              message: 'Game not found', 
              code: 'game_not_found'
            });
            return;
          }
          
          const isPlayerInGame = gameSession.players.some(p => p.userId.toString() === userId);
          
          if (!isPlayerInGame) {
            socket.emit('chat-error', { 
              message: 'You are not a participant in this game', 
              code: 'not_in_game'
            });
            return;
          }
          
          const gameRoom = `game:${data.gameId}`;
          socket.join(gameRoom);
          trackUserJoinRoom(socket.id, gameRoom);
          
          // Send recent game messages
          if (messageHistory.games.has(data.gameId) && messageHistory.games.get(data.gameId).length > 0) {
            socket.emit('chat-history', {
              channel: `game:${data.gameId}`,
              messages: messageHistory.games.get(data.gameId)
            });
          }
          
          // Announce player joined chat (game chat only)
          chatNamespace.to(gameRoom).emit('chat-system', {
            message: `${username} joined the game chat`,
            timestamp: new Date().toISOString()
          });
        }
        
        // Join custom channel if provided
        if (data.channel) {
          // Sanitize channel name
          const channelName = sanitizeChannelName(data.channel);
          
          if (!channelName) {
            socket.emit('chat-error', { 
              message: 'Invalid channel name', 
              code: 'invalid_channel'
            });
            return;
          }
          
          socket.join(channelName);
          trackUserJoinRoom(socket.id, channelName);
          
          // Send recent channel messages
          if (messageHistory.channels.has(channelName) && messageHistory.channels.get(channelName).length > 0) {
            socket.emit('chat-history', {
              channel: channelName,
              messages: messageHistory.channels.get(channelName)
            });
          }
        }
        
        logger.info(`User ${username} joined chat channels`);
        
        // Acknowledge successful join
        socket.emit('chat-joined', {
          channels: Array.from(socket.rooms).filter(room => room !== socket.id)
        });
      } catch (error) {
        logger.error(`Error in join-chat handler: ${error.message}`);
        socket.emit('chat-error', { 
          message: 'Failed to join chat', 
          code: 'server_error'
        });
      }
    });
    
    // Leave a channel
    socket.on('leave-chat', (data) => {
      try {
        updateUserActivity(socket.id);
        
        if (!data.channel) {
          socket.emit('chat-error', { 
            message: 'Channel name is required', 
            code: 'missing_channel'
          });
          return;
        }
        
        // Cannot leave socket ID room
        if (data.channel === socket.id) {
          return;
        }
        
        // Prevent leaving global chat
        if (data.channel === 'global' && !data.force) {
          socket.emit('chat-error', { 
            message: 'Cannot leave global chat', 
            code: 'cannot_leave_global'
          });
          return;
        }
        
        socket.leave(data.channel);
        trackUserLeaveRoom(socket.id, data.channel);
        
        logger.debug(`User ${socket.user.username} left chat channel: ${data.channel}`);
        
        // Acknowledge successful leave
        socket.emit('chat-left', {
          channel: data.channel,
          remainingChannels: Array.from(socket.rooms).filter(room => room !== socket.id)
        });
      } catch (error) {
        logger.error(`Error in leave-chat handler: ${error.message}`);
      }
    });
    
    // Send chat message
    socket.on('send-message', async (data) => {
      try {
        updateUserActivity(socket.id);
        
        const userId = socket.user.id;
        const username = socket.user.username;
        
        // Validate message data
        if (!data.message || typeof data.message !== 'string' || data.message.trim() === '') {
          socket.emit('chat-error', { 
            message: 'Message cannot be empty', 
            code: 'empty_message'
          });
          return;
        }
        
        // Enforce message length
        if (data.message.length > 500) {
          socket.emit('chat-error', { 
            message: 'Message too long (max 500 characters)', 
            code: 'message_too_long'
          });
          return;
        }
        
        // Rate limiting
        const now = Date.now();
        const messageKey = `${socket.id}:message`;
        const lastTime = lastMessageTime.get(messageKey) || 0;
        
        if (now - lastTime < RATE_LIMIT.message) {
          socket.emit('chat-error', { 
            message: 'Sending messages too quickly', 
            code: 'rate_limited',
            retryAfter: (lastTime + RATE_LIMIT.message - now) / 1000
          });
          return;
        }
        
        lastMessageTime.set(messageKey, now);
        
        // Filter profanity
        let filteredMessage = filter.clean(data.message);
        
        // Determine target channel
        let channel = 'global'; // Default to global
        
        if (data.channel) {
          channel = data.channel;
          
          // Verify user is in this channel
          if (!socket.rooms.has(channel)) {
            socket.emit('chat-error', { 
              message: 'You are not in this channel', 
              code: 'not_in_channel'
            });
            return;
          }
        } else if (data.gameId) {
          channel = `game:${data.gameId}`;
          
          // Verify user is in this channel
          if (!socket.rooms.has(channel)) {
            socket.emit('chat-error', { 
              message: 'You are not in this game chat', 
              code: 'not_in_game_chat'
            });
            return;
          }
        } else if (data.privateUserId) {
          // Handle private message
          return handlePrivateMessage(socket, data.privateUserId, filteredMessage);
        }
        
        // Create message object
        const messageObj = {
          userId,
          username,
          message: filteredMessage,
          timestamp: new Date().toISOString(),
          channel
        };
        
        // Store message in database (async, don't wait)
        storeMessage(messageObj).catch(err => 
          logger.error(`Failed to store chat message: ${err.message}`)
        );
        
        // Add to history cache
        addToMessageHistory(channel, messageObj);
        
        // Broadcast to appropriate room
        chatNamespace.to(channel).emit('chat-message', messageObj);
        
        logger.debug(`Chat message from ${username} in ${channel}: ${filteredMessage.substring(0, 30)}${filteredMessage.length > 30 ? '...' : ''}`);
      } catch (error) {
        logger.error(`Error in send-message handler: ${error.message}`);
        socket.emit('chat-error', { 
          message: 'Failed to send message', 
          code: 'server_error'
        });
      }
    });
    
    // Private message
    socket.on('private-message', async (data) => {
      try {
        updateUserActivity(socket.id);
        
        // Validate data
        if (!data.targetUserId || !data.message) {
          socket.emit('chat-error', { 
            message: 'Target user ID and message are required', 
            code: 'missing_parameters'
          });
          return;
        }
        
        // Rate limiting
        const now = Date.now();
        const messageKey = `${socket.id}:private`;
        const lastTime = lastMessageTime.get(messageKey) || 0;
        
        if (now - lastTime < RATE_LIMIT.message) {
          socket.emit('chat-error', { 
            message: 'Sending messages too quickly', 
            code: 'rate_limited'
          });
          return;
        }
        
        lastMessageTime.set(messageKey, now);
        
        // Handle the private message
        handlePrivateMessage(socket, data.targetUserId, data.message);
      } catch (error) {
        logger.error(`Error in private-message handler: ${error.message}`);
      }
    });
    
    // Request message history for a channel
    socket.on('request-history', async (data) => {
      try {
        updateUserActivity(socket.id);
        
        // Validate channel
        if (!data.channel) {
          socket.emit('chat-error', { 
            message: 'Channel is required', 
            code: 'missing_channel'
          });
          return;
        }
        
        // Verify user is in this channel
        if (!socket.rooms.has(data.channel)) {
          socket.emit('chat-error', { 
            message: 'You are not in this channel', 
            code: 'not_in_channel'
          });
          return;
        }
        
        // Get message history
        let messages;
        
        if (data.channel === 'global') {
          messages = messageHistory.global;
        } else if (data.channel.startsWith('game:')) {
          const gameId = data.channel.substring(5);
          messages = messageHistory.games.get(gameId) || [];
        } else {
          messages = messageHistory.channels.get(data.channel) || [];
        }
        
        // If history is not in cache, fetch from database
        if (messages.length === 0) {
          const limit = data.limit || 50;
          messages = await fetchMessageHistory(data.channel, limit);
        }
        
        // Send history to user
        socket.emit('chat-history', {
          channel: data.channel,
          messages
        });
      } catch (error) {
        logger.error(`Error in request-history handler: ${error.message}`);
      }
    });
    
    // Disconnect handler
    socket.on('disconnect', () => {
      try {
        // Get all game rooms this socket was in
        const gameRooms = Array.from(socket.rooms)
          .filter(room => room.startsWith('game:'));
        
        // Notify players in game rooms that this user left
        gameRooms.forEach(room => {
          chatNamespace.to(room).emit('chat-system', {
            message: `${socket.user.username} left the game chat`,
            timestamp: new Date().toISOString()
          });
        });
        
        logger.debug(`User ${socket.user.username} disconnected from chat`);
      } catch (error) {
        logger.error(`Error in chat disconnect handler: ${error.message}`);
      }
    });
  });
  
  logger.info('Chat handler initialized');
};

/**
 * Handle private message between users
 * @param {SocketIO.Socket} senderSocket - Sender's socket
 * @param {string} targetUserId - Target user ID
 * @param {string} message - Message content
 */
const handlePrivateMessage = async (senderSocket, targetUserId, message) => {
  try {
    const senderId = senderSocket.user.id;
    const senderUsername = senderSocket.user.username;
    
    // Prevent sending to self
    if (targetUserId === senderId) {
      senderSocket.emit('chat-error', { 
        message: 'Cannot send private message to yourself', 
        code: 'self_message'
      });
      return;
    }
    
    // Find target user
    const targetUser = await User.findById(targetUserId);
    
    if (!targetUser) {
      senderSocket.emit('chat-error', { 
        message: 'User not found', 
        code: 'user_not_found'
      });
      return;
    }
    
    // Filter message
    let filteredMessage = filter.clean(message);
    
    // Create message object
    const messageObj = {
      userId: senderId,
      username: senderUsername,
      toUserId: targetUserId,
      toUsername: targetUser.username,
      message: filteredMessage,
      timestamp: new Date().toISOString(),
      isPrivate: true
    };
    
    // Store in database
    storeMessage({
      ...messageObj,
      channel: 'private'
    }).catch(err => 
      logger.error(`Failed to store private message: ${err.message}`)
    );
    
    // Send to both sender and recipient
    senderSocket.emit('private-message', messageObj);
    
    // Find recipient's socket
    const io = senderSocket.server;
    const recipientSocket = findSocketByUserId(io, targetUserId);
    
    if (recipientSocket) {
      recipientSocket.emit('private-message', messageObj);
    }
    
    logger.debug(`Private message from ${senderUsername} to ${targetUser.username}`);
  } catch (error) {
    logger.error(`Error handling private message: ${error.message}`);
    senderSocket.emit('chat-error', { 
      message: 'Failed to send private message', 
      code: 'server_error'
    });
  }
};

/**
 * Find a user's socket by their user ID
 * @param {SocketIO.Server} io - Socket.io server
 * @param {string} userId - User ID to find
 * @returns {SocketIO.Socket|null} Socket or null if not found
 */
const findSocketByUserId = (io, userId) => {
  // Find in chat namespace
  const chatNamespace = io.of('/chat');
  
  for (const [socketId, socket] of chatNamespace.sockets) {
    if (socket.user && socket.user.id === userId) {
      return socket;
    }
  }
  
  return null;
};

/**
 * Store chat message in database
 * @param {Object} messageObj - Message object
 * @returns {Promise<void>}
 */
const storeMessage = async (messageObj) => {
  try {
    const chatMessage = new ChatMessage({
      userId: messageObj.userId,
      username: messageObj.username,
      message: messageObj.message,
      channel: messageObj.channel,
      timestamp: new Date(messageObj.timestamp),
      isPrivate: !!messageObj.isPrivate,
      toUserId: messageObj.toUserId,
      toUsername: messageObj.toUsername,
      gameId: messageObj.channel.startsWith('game:') 
        ? messageObj.channel.substring(5) 
        : null
    });
    
    await chatMessage.save();
  } catch (error) {
    logger.error(`Error storing chat message: ${error.message}`);
    throw error;
  }
};

/**
 * Add message to history cache
 * @param {string} channel - Channel name
 * @param {Object} messageObj - Message object
 */
const addToMessageHistory = (channel, messageObj) => {
  if (channel === 'global') {
    messageHistory.global.push(messageObj);
    
    // Trim if too large
    if (messageHistory.global.length > MAX_HISTORY_SIZE) {
      messageHistory.global.shift();
    }
  } else if (channel.startsWith('game:')) {
    const gameId = channel.substring(5);
    
    if (!messageHistory.games.has(gameId)) {
      messageHistory.games.set(gameId, []);
    }
    
    messageHistory.games.get(gameId).push(messageObj);
    
    // Trim if too large
    if (messageHistory.games.get(gameId).length > MAX_HISTORY_SIZE) {
      messageHistory.games.get(gameId).shift();
    }
  } else {
    if (!messageHistory.channels.has(channel)) {
      messageHistory.channels.set(channel, []);
    }
    
    messageHistory.channels.get(channel).push(messageObj);
    
    // Trim if too large
    if (messageHistory.channels.get(channel).length > MAX_HISTORY_SIZE) {
      messageHistory.channels.get(channel).shift();
    }
  }
};

/**
 * Fetch message history from database
 * @param {string} channel - Channel name
 * @param {number} limit - Maximum number of messages to fetch
 * @returns {Promise<Array>} Array of message objects
 */
const fetchMessageHistory = async (channel, limit = 50) => {
  try {
    let query = { channel };
    
    if (channel.startsWith('game:')) {
      query = { gameId: channel.substring(5) };
    }
    
    const messages = await ChatMessage.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    
    // Format messages and reverse to get chronological order
    return messages.map(msg => ({
      userId: msg.userId,
      username: msg.username,
      message: msg.message,
      timestamp: msg.timestamp.toISOString(),
      channel: msg.channel,
      isPrivate: msg.isPrivate,
      toUserId: msg.toUserId,
      toUsername: msg.toUsername
    })).reverse();
  } catch (error) {
    logger.error(`Error fetching message history: ${error.message}`);
    return [];
  }
};

/**
 * Sanitize channel name for security
 * @param {string} channel - Channel name to sanitize
 * @returns {string|null} Sanitized channel name or null if invalid
 */
const sanitizeChannelName = (channel) => {
  // Disallow certain characters and formats
  if (!channel || 
      typeof channel !== 'string' || 
      channel.length < 2 || 
      channel.length > 30 ||
      channel === 'global' || 
      channel.startsWith('game:') ||
      channel.startsWith('system:') ||
      /[^\w\-]/.test(channel)) {
    return null;
  }
  
  return channel.toLowerCase();
};

module.exports = {
  initialize,
  messageHistory
};