const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/asyncHandler');
const logger = require('../utils/logger');
const tokenService = require('../services/tokenService');

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  [
    body('username')
      .isLength({ min: 3, max: 20 })
      .withMessage('Username must be between 3 and 20 characters')
      .isAlphanumeric()
      .withMessage('Username must only contain alphanumeric characters')
      .custom(async (value) => {
        const existingUser = await User.findOne({ username: value });
        if (existingUser) {
          throw new Error('Username is already taken');
        }
        return true;
      }),
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .custom(async (value) => {
        const existingUser = await User.findOne({ email: value });
        if (existingUser) {
          throw new Error('Email is already registered');
        }
        return true;
      }),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long')
  ],
  asyncHandler(async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, walletAddress } = req.body;

    // Create new user
    const user = new User({
      username,
      email,
      password,
      walletAddress: walletAddress || null
    });

    // Hash password and save user
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Send response
    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      walletAddress: user.walletAddress,
      token
    });

    logger.info(`New user registered: ${username}`);
  })
);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user & get token
 * @access  Public
 */
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Please provide a valid email address'),
    body('password').exists().withMessage('Password is required')
  ],
  asyncHandler(async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Update last login time
    user.lastLogin = Date.now();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Get token balance if wallet is connected
    let tokenBalance = null;
    if (user.walletAddress) {
      try {
        tokenBalance = await tokenService.getBalance(user.walletAddress);
      } catch (error) {
        logger.error(`Failed to get token balance for user ${user._id}:`, error);
        // Continue without token balance if there's an error
      }
    }

    // Send response
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      walletAddress: user.walletAddress,
      tokenBalance,
      token
    });

    logger.info(`User logged in: ${user.username}`);
  })
);

/**
 * @route   GET /api/auth/profile
 * @desc    Get user profile
 * @access  Private
 */
router.get(
  '/profile',
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get token balance if wallet is connected
    let tokenBalance = null;
    let tokenStats = null;
    if (user.walletAddress) {
      try {
        tokenBalance = await tokenService.getBalance(user.walletAddress);
        tokenStats = await tokenService.getPlayerStats(user.walletAddress);
      } catch (error) {
        logger.error(`Failed to get token data for user ${user._id}:`, error);
        // Continue without token data if there's an error
      }
    }

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      walletAddress: user.walletAddress,
      tokenBalance,
      tokenStats,
      gameStats: user.gameStats,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    });
  })
);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put(
  '/profile',
  protect,
  [
    body('username')
      .optional()
      .isLength({ min: 3, max: 20 })
      .withMessage('Username must be between 3 and 20 characters')
      .isAlphanumeric()
      .withMessage('Username must only contain alphanumeric characters')
      .custom(async (value, { req }) => {
        const existingUser = await User.findOne({ username: value });
        if (existingUser && existingUser._id.toString() !== req.user._id.toString()) {
          throw new Error('Username is already taken');
        }
        return true;
      }),
    body('email')
      .optional()
      .isEmail()
      .withMessage('Please provide a valid email address')
      .custom(async (value, { req }) => {
        const existingUser = await User.findOne({ email: value });
        if (existingUser && existingUser._id.toString() !== req.user._id.toString()) {
          throw new Error('Email is already registered');
        }
        return true;
      }),
    body('password')
      .optional()
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
    body('walletAddress')
      .optional()
      .isEthereumAddress()
      .withMessage('Invalid Ethereum wallet address')
  ],
  asyncHandler(async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update fields
    if (req.body.username) user.username = req.body.username;
    if (req.body.email) user.email = req.body.email;
    if (req.body.walletAddress) user.walletAddress = req.body.walletAddress;

    // Update password if provided
    if (req.body.password) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(req.body.password, salt);
    }

    await user.save();

    // Generate new token to reflect any changes
    const token = generateToken(user._id);

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      walletAddress: user.walletAddress,
      message: 'Profile updated successfully',
      token
    });

    logger.info(`User updated profile: ${user._id}`);
  })
);

/**
 * @route   POST /api/auth/wallet
 * @desc    Connect or update wallet address
 * @access  Private
 */
router.post(
  '/wallet',
  protect,
  [
    body('walletAddress')
      .isEthereumAddress()
      .withMessage('Invalid Ethereum wallet address'),
    body('signature')
      .exists()
      .withMessage('Signature is required to verify wallet ownership')
  ],
  asyncHandler(async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { walletAddress, signature } = req.body;

    // Verify wallet ownership using signature
    const isValidSignature = await tokenService.verifyWalletSignature(
      walletAddress,
      signature,
      `Connect wallet to SkyWars for user ${req.user._id}`
    );

    if (!isValidSignature) {
      return res.status(400).json({ message: 'Invalid signature' });
    }

    // Update user's wallet address
    const user = await User.findById(req.user._id);
    user.walletAddress = walletAddress;
    await user.save();

    // Get token balance for the connected wallet
    let tokenBalance = null;
    try {
      tokenBalance = await tokenService.getBalance(walletAddress);
    } catch (error) {
      logger.error(`Failed to get token balance for user ${user._id}:`, error);
      // Continue without token balance if there's an error
    }

    res.json({
      walletAddress: user.walletAddress,
      tokenBalance,
      message: 'Wallet connected successfully'
    });

    logger.info(`User connected wallet: ${user._id} - ${walletAddress}`);
  })
);

/**
 * @route   DELETE /api/auth/wallet
 * @desc    Disconnect wallet
 * @access  Private
 */
router.delete(
  '/wallet',
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.walletAddress = null;
    await user.save();

    res.json({ message: 'Wallet disconnected successfully' });

    logger.info(`User disconnected wallet: ${user._id}`);
  })
);

/**
 * Generate JWT token
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

module.exports = router;