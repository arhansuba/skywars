const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const tokenService = require('../services/tokenService');
const { protect } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/asyncHandler');
const logger = require('../utils/logger');

/**
 * @route   GET /api/tokens/info
 * @desc    Get token contract information
 * @access  Public
 */
router.get(
  '/info',
  asyncHandler(async (req, res) => {
    const contractInfo = await tokenService.getContractInfo();
    res.json(contractInfo);
  })
);

/**
 * @route   GET /api/tokens/balance/:address
 * @desc    Get token balance for an address
 * @access  Public
 */
router.get(
  '/balance/:address',
  [
    param('address')
      .isEthereumAddress()
      .withMessage('Invalid Ethereum address')
  ],
  asyncHandler(async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { address } = req.params;
    const balance = await tokenService.getBalance(address);
    
    res.json({ address, balance });
  })
);

/**
 * @route   GET /api/tokens/player-stats/:address
 * @desc    Get player stats for an address
 * @access  Public
 */
router.get(
  '/player-stats/:address',
  [
    param('address')
      .isEthereumAddress()
      .withMessage('Invalid Ethereum address')
  ],
  asyncHandler(async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { address } = req.params;
    const stats = await tokenService.getPlayerStats(address);
    
    res.json({ address, stats });
  })
);

/**
 * @route   GET /api/tokens/items
 * @desc    Get available items from the token contract
 * @access  Public
 */
router.get(
  '/items',
  asyncHandler(async (req, res) => {
    const startId = parseInt(req.query.startId) || 1;
    const count = parseInt(req.query.count) || 10;
    
    // Limit to reasonable values
    const validCount = Math.min(count, 50);
    
    const items = await tokenService.getAvailableItems(startId, validCount);
    
    res.json({ items });
  })
);

/**
 * @route   POST /api/tokens/verify-transaction
 * @desc    Verify a token transaction
 * @access  Public
 */
router.post(
  '/verify-transaction',
  [
    body('txHash')
      .isString()
      .isLength({ min: 66, max: 66 })
      .withMessage('Valid transaction hash required')
  ],
  asyncHandler(async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { txHash } = req.body;
    const verification = await tokenService.verifyTransaction(txHash);
    
    res.json(verification);
  })
);

/**
 * @route   POST /api/tokens/award
 * @desc    Award tokens to a player (protected server-only endpoint)
 * @access  Private/Admin
 */
router.post(
  '/award',
  protect,
  [
    body('address')
      .isEthereumAddress()
      .withMessage('Valid Ethereum address required'),
    body('amount')
      .isFloat({ min: 0.000001 })
      .withMessage('Amount must be a positive number'),
    body('reason')
      .isString()
      .isLength({ min: 3, max: 100 })
      .withMessage('Reason must be between 3 and 100 characters')
  ],
  asyncHandler(async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if user has admin role
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Not authorized to award tokens' });
    }

    const { address, amount, reason } = req.body;
    
    // Award tokens
    const result = await tokenService.awardTokens(address, amount, reason);
    
    if (result.success) {
      res.json({
        success: true,
        message: `Successfully awarded ${amount} tokens to ${address}`,
        transactionHash: result.transactionHash
      });
      
      logger.info(`Admin ${req.user._id} awarded ${amount} tokens to ${address} for: ${reason}`);
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to award tokens',
        error: result.error
      });
    }
  })
);

/**
 * @route   POST /api/tokens/purchase
 * @desc    Purchase an item with tokens
 * @access  Private
 */
router.post(
  '/purchase',
  protect,
  [
    body('itemId')
      .isInt({ min: 1 })
      .withMessage('Valid item ID required'),
    body('walletAddress')
      .isEthereumAddress()
      .withMessage('Valid Ethereum address required')
  ],
  asyncHandler(async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { itemId, walletAddress } = req.body;
    
    // Verify wallet ownership
    if (req.user.walletAddress !== walletAddress) {
      return res.status(403).json({
        message: 'Wallet address does not match user profile'
      });
    }
    
    // Process purchase
    const result = await tokenService.purchaseItem(walletAddress, itemId);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Item purchased successfully',
        transactionHash: result.transactionHash
      });
      
      logger.info(`User ${req.user._id} purchased item ${itemId}`);
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to purchase item',
        error: result.error
      });
    }
  })
);

/**
 * @route   POST /api/tokens/verify-signature
 * @desc    Verify a wallet signature
 * @access  Public
 */
router.post(
  '/verify-signature',
  [
    body('address')
      .isEthereumAddress()
      .withMessage('Valid Ethereum address required'),
    body('signature')
      .isString()
      .isLength({ min: 132 })
      .withMessage('Valid signature required'),
    body('message')
      .isString()
      .isLength({ min: 3 })
      .withMessage('Message is required')
  ],
  asyncHandler(async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { address, signature, message } = req.body;
    
    // Verify signature
    const isValid = await tokenService.verifyWalletSignature(address, signature, message);
    
    res.json({ isValid });
  })
);

module.exports = router;