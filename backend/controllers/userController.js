/**
 * User Controller
 *
 * Handles user-related operations including authentication, profile management,
 * and wallet integration.
 *
 * @module controllers/userController
 */

const User = require('../models/User');
const PlayerStats = require('../models/PlayerStats');
const Transaction = require('../models/Transaction');
const { TokenService } = require('../services/tokenService');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Token service for wallet verification
const tokenService = new TokenService({
  providerUrl: process.env.WEB3_PROVIDER_URL,
  contractAddress: process.env.TOKEN_CONTRACT_ADDRESS
});

/**
 * Register a new user
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.register = async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { username, email, password } = req.body;
    
    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ 
        error: 'User with this email already exists' 
      });
    }
    
    user = await User.findOne({ username });
    if (user) {
      return res.status(400).json({ 
        error: 'Username is already taken' 
      });
    }
    
    // Create new user
    user = new User({
      username,
      email,
      password
    });
    
    // Generate verification token
    const verificationToken = user.generateVerificationToken();
    
    // Save user to database
    await user.save();
    
    // Create initial player stats
    await PlayerStats.createOrUpdate(user._id, username);
    
    // Generate JWT token
    const token = user.generateAuthToken();
    
    // Return user data and token
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      },
      verificationToken // In production, this would be sent via email
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      error: 'Server error during registration' 
    });
  }
};

/**
 * Login user
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.login = async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { email, password } = req.body;
    
    // Find user by email
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ 
        error: 'Account is deactivated' 
      });
    }
    
    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }
    
    // Update last login timestamp
    user.lastLogin = Date.now();
    await user.save();
    
    // Generate JWT token
    const token = user.generateAuthToken();
    
    // Return user data and token
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        profilePicture: user.profilePicture,
        walletAddress: user.walletAddress
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Server error during login' 
    });
  }
};

/**
 * Verify email
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    
    // Find user by verification token
    const user = await User.findByVerificationToken(token);
    if (!user) {
      return res.status(400).json({ 
        error: 'Invalid or expired verification token' 
      });
    }
    
    // Mark email as verified
    user.isEmailVerified = true;
    user.verificationToken = undefined;
    user.verificationExpires = undefined;
    
    await user.save();
    
    res.json({ 
      message: 'Email verified successfully' 
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ 
      error: 'Server error during email verification' 
    });
  }
};

/**
 * Request password reset
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    
    // Generate reset token
    const resetToken = user.generatePasswordResetToken();
    await user.save();
    
    // In production, send reset token via email
    // For development, return token in response
    res.json({
      message: 'Password reset token generated',
      resetToken // In production, would be sent via email
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ 
      error: 'Server error during password reset request' 
    });
  }
};

/**
 * Reset password
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    
    // Find user by reset token
    const user = await User.findByResetToken(token);
    if (!user) {
      return res.status(400).json({ 
        error: 'Invalid or expired reset token' 
      });
    }
    
    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    
    await user.save();
    
    res.json({ 
      message: 'Password reset successful' 
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ 
      error: 'Server error during password reset' 
    });
  }
};

/**
 * Get current user profile
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Find user and populate stats
    const user = await User.findById(userId)
      .select('-verificationToken -resetPasswordToken');
    
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    
    // Get player stats
    const stats = await PlayerStats.findByUserId(userId);
    
    // Return user profile with stats
    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        profilePicture: user.profilePicture,
        walletAddress: user.walletAddress,
        tokenBalance: user.tokenBalance,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        preferences: user.preferences
      },
      stats: stats ? {
        level: stats.level,
        experience: stats.experience,
        rank: stats.rank,
        totalGames: stats.totalGames,
        gamesWon: stats.gamesWon,
        totalKills: stats.totalKills,
        totalDeaths: stats.totalDeaths,
        killDeathRatio: stats.killDeathRatio,
        favoriteAircraft: stats.favoriteAircraft,
        achievementsUnlocked: stats.achievementsUnlocked,
        recentPerformance: stats.recentPerformance
      } : null
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving profile' 
    });
  }
};

/**
 * Update user profile
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { username, email, profilePicture, preferences } = req.body;
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    
    // Check if username is already taken
    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({ 
          error: 'Username is already taken' 
        });
      }
      user.username = username;
      
      // Update username in player stats
      await PlayerStats.updateOne(
        { user: userId },
        { username: username }
      );
    }
    
    // Check if email is already taken
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ 
          error: 'Email is already taken' 
        });
      }
      user.email = email;
      user.isEmailVerified = false;
      
      // Generate new verification token
      user.generateVerificationToken();
      
      // In production, send verification email
    }
    
    // Update profile picture
    if (profilePicture) {
      user.profilePicture = profilePicture;
    }
    
    // Update preferences
    if (preferences) {
      // Deep merge existing preferences with new ones
      user.preferences = {
        ...user.preferences,
        ...preferences,
        controls: {
          ...user.preferences.controls,
          ...(preferences.controls || {})
        },
        audio: {
          ...user.preferences.audio,
          ...(preferences.audio || {})
        },
        graphics: {
          ...user.preferences.graphics,
          ...(preferences.graphics || {})
        },
        notifications: {
          ...user.preferences.notifications,
          ...(preferences.notifications || {})
        }
      };
    }
    
    // Save changes
    await user.save();
    
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        preferences: user.preferences
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      error: 'Server error while updating profile' 
    });
  }
};

/**
 * Change password
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    
    // Find user
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    
    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ 
        error: 'Current password is incorrect' 
      });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    res.json({ 
      message: 'Password changed successfully' 
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      error: 'Server error while changing password' 
    });
  }
};

/**
 * Deactivate account
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.deactivateAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;
    
    // Find user
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    
    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ 
        error: 'Password is incorrect' 
      });
    }
    
    // Deactivate account
    user.isActive = false;
    await user.save();
    
    res.json({ 
      message: 'Account deactivated successfully' 
    });
  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({ 
      error: 'Server error while deactivating account' 
    });
  }
};

/**
 * Generate wallet connection message
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getWalletConnectionMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    
    // Generate new nonce
    user.walletNonce = require('crypto').randomBytes(16).toString('hex');
    await user.save();
    
    // Generate message to sign
    const message = user.generateWalletVerificationMessage();
    
    res.json({
      message,
      nonce: user.walletNonce
    });
  } catch (error) {
    console.error('Wallet connection message error:', error);
    res.status(500).json({ 
      error: 'Server error while generating wallet connection message' 
    });
  }
};

/**
 * Connect wallet
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.connectWallet = async (req, res) => {
  try {
    const userId = req.user.id;
    const { walletAddress, signature } = req.body;
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    
    // Check if wallet is already connected to another account
    const existingWallet = await User.findOne({ 
      walletAddress, 
      _id: { $ne: userId } 
    });
    
    if (existingWallet) {
      return res.status(400).json({ 
        error: 'Wallet is already connected to another account' 
      });
    }
    
    // Verify signature
    const message = user.generateWalletVerificationMessage();
    const isValid = tokenService.verifyWalletSignature(
      walletAddress,
      signature,
      message
    );
    
    if (!isValid) {
      return res.status(401).json({ 
        error: 'Invalid wallet signature' 
      });
    }
    
    // Update user with wallet address
    user.walletAddress = walletAddress;
    user.walletSignature = signature;
    
    // Generate new nonce for future use
    user.walletNonce = require('crypto').randomBytes(16).toString('hex');
    
    await user.save();
    
    // Get token balance
    let tokenBalance = 0;
    try {
      tokenBalance = await tokenService.getTokenBalance(walletAddress);
    } catch (error) {
      console.error('Error fetching token balance:', error);
    }
    
    res.json({
      message: 'Wallet connected successfully',
      walletAddress,
      tokenBalance
    });
  } catch (error) {
    console.error('Connect wallet error:', error);
    res.status(500).json({ 
      error: 'Server error while connecting wallet' 
    });
  }
};

/**
 * Disconnect wallet
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.disconnectWallet = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    
    // Check if wallet is connected
    if (!user.walletAddress) {
      return res.status(400).json({ 
        error: 'No wallet is connected to this account' 
      });
    }
    
    // Disconnect wallet
    user.walletAddress = undefined;
    user.walletSignature = undefined;
    
    await user.save();
    
    res.json({ 
      message: 'Wallet disconnected successfully' 
    });
  } catch (error) {
    console.error('Disconnect wallet error:', error);
    res.status(500).json({ 
      error: 'Server error while disconnecting wallet' 
    });
  }
};

/**
 * Get user transaction history
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0, type } = req.query;
    
    // Build query
    const query = { user: userId };
    
    // Filter by type if provided
    if (type) {
      query.type = type;
    }
    
    // Get transactions
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .populate('recipient', 'username');
    
    // Get total count for pagination
    const total = await Transaction.countDocuments(query);
    
    // Get transaction summary
    const summary = await Transaction.getUserSummary(userId);
    
    res.json({
      transactions,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      },
      summary
    });
  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving transaction history' 
    });
  }
};

module.exports = exports;