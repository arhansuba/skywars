/**
 * Database Configuration
 * 
 * Setup and connection management for MongoDB using Mongoose.
 * 
 * @module database
 */

const mongoose = require('mongoose');

// Database connection URL
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/skywars';

// Connection options
const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  autoIndex: true,
  connectTimeoutMS: 10000, // 10 seconds
  socketTimeoutMS: 45000, // 45 seconds
};

/**
 * Connect to MongoDB database
 * @returns {Promise} Resolves when connected
 */
const connectDatabase = async () => {
  try {
    await mongoose.connect(MONGODB_URI, options);
    console.log('MongoDB connected successfully');
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Attempting to reconnect...');
    });
    
    return mongoose.connection;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error.message);
    throw error;
  }
};

/**
 * Disconnect from database
 * @returns {Promise} Resolves when disconnected
 */
const disconnectDatabase = async () => {
  try {
    await mongoose.disconnect();
    console.log('MongoDB disconnected successfully');
    return true;
  } catch (error) {
    console.error('Error disconnecting from MongoDB:', error.message);
    throw error;
  }
};

module.exports = {
  connectDatabase,
  disconnectDatabase,
  connection: mongoose.connection
};