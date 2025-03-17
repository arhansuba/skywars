/**
 * Transaction Controller
 *
 * Handles blockchain token transactions, purchase operations,
 * and transaction history.
 *
 * @module controllers/transactionController
 */

const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { TokenService } = require('../services/tokenService');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Initialize token service
const tokenService = new TokenService({
  providerUrl: process.env.WEB3_PROVIDER_URL,
  contractAddress: process.env.TOKEN_CONTRACT_ADDRESS,
  privateKey: process.env.SERVER_PRIVATE_KEY
});

/**
 * Get user transactions
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getUserTransactions = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    const { limit = 20, offset = 0, type, status } = req.query;
    
    // Build query
    const query = { user: userId };
    
    // Filter by type if provided
    if (type) {
      query.type = type;
    
    // Filter by status if provided
    if (status) {
      query.status = status;
    }
    
    // Get transactions
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .populate('recipient', 'username');
    
    // Get total count for pagination
    const total = await Transaction.countDocuments(query);
    
    // Format transactions
    const formattedTransactions = transactions.map(tx => ({
      id: tx._id,
      transactionId: tx.transactionId,
      type: tx.type,
      amount: tx.amount,
      status: tx.status,
      createdAt: tx.createdAt,
      completedAt: tx.completedAt,
      recipient: tx.recipient ? {
        id: tx.recipient._id,
        username: tx.recipient.username
      } : null,
      blockchainTxHash: tx.blockchainTxHash,
      item: tx.item,
      reason: tx.reason
    }));
    
    res.json({
      transactions: formattedTransactions,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get user transactions error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving transactions' 
    });
  }
};

/**
 * Get transaction details
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getTransactionDetails = async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    // Find transaction
    const transaction = await Transaction.findOne({ transactionId })
      .populate('user', 'username walletAddress')
      .populate('recipient', 'username walletAddress');
    
    if (!transaction) {
      return res.status(404).json({ 
        error: 'Transaction not found' 
      });
    }
    
    // Check if transaction belongs to user
    if (transaction.user._id.toString() !== req.user.id && 
        (!transaction.recipient || transaction.recipient._id.toString() !== req.user.id) && 
        req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Not authorized to view this transaction' 
      });
    }
    
    // Get blockchain transaction details if available
    let blockchainDetails = null;
    if (transaction.blockchainTxHash) {
      try {
        blockchainDetails = await tokenService.getTransactionDetails(
          transaction.blockchainTxHash
        );
      } catch (err) {
        console.error('Error fetching blockchain details:', err);
      }
    }
    
    // Format response
    res.json({
      transaction: {
        id: transaction._id,
        transactionId: transaction.transactionId,
        type: transaction.type,
        amount: transaction.amount,
        user: {
          id: transaction.user._id,
          username: transaction.user.username,
          walletAddress: transaction.user.walletAddress
        },
        recipient: transaction.recipient ? {
          id: transaction.recipient._id,
          username: transaction.recipient.username,
          walletAddress: transaction.recipient.walletAddress
        } : null,
        walletAddress: transaction.walletAddress,
        recipientWalletAddress: transaction.recipientWalletAddress,
        status: transaction.status,
        createdAt: transaction.createdAt,
        completedAt: transaction.completedAt,
        blockchainTxHash: transaction.blockchainTxHash,
        blockNumber: transaction.blockNumber,
        gasUsed: transaction.gasUsed,
        confirmations: transaction.confirmations,
        item: transaction.item,
        itemType: transaction.itemType,
        itemId: transaction.itemId,
        reason: transaction.reason,
        gameSession: transaction.gameSession
      },
      blockchainDetails
    });
  } catch (error) {
    console.error('Get transaction details error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving transaction details' 
    });
  }
};

/**
 * Create token transfer transaction
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.transferTokens = async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { userId, amount, reason } = req.body;
    
    // Check if amount is valid
    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        error: 'Amount must be greater than zero' 
      });
    }
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    
    // Check if user has wallet
    if (!user.walletAddress) {
      return res.status(400).json({ 
        error: 'User wallet not connected' 
      });
    }
    
    // Generate transaction ID
    const transactionId = `award-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create transaction record
    const transaction = await Transaction.createTransaction({
      transactionId,
      type: 'reward',
      user: userId,
      amount,
      status: 'pending',
      walletAddress: user.walletAddress,
      reason: reason || 'Admin award',
      ipAddress: req.ip
    });
    
    // Queue transaction processing
    // In a production system, this would be handled by a separate service or queue
    setTimeout(async () => {
      try {
        // Award tokens on blockchain
        const result = await tokenService.awardTokens(
          user.walletAddress,
          amount,
          reason || 'Admin award'
        );
        
        // Update transaction with blockchain data
        await Transaction.updateStatus(transactionId, 'completed', {
          blockchainTxHash: result.transactionHash,
          blockNumber: result.blockNumber,
          gasUsed: result.gasUsed,
          confirmations: result.confirmations || 1
        });
      } catch (error) {
        console.error('Token award failed:', error);
        await Transaction.updateStatus(transactionId, 'failed', {
          errorMessage: error.message
        });
      }
    }, 100);
    
    res.json({
      message: 'Token award initiated',
      transaction: {
        transactionId,
        type: 'reward',
        amount,
        recipient: {
          id: user._id,
          username: user.username
        },
        status: 'pending',
        createdAt: transaction.createdAt
      }
    });
  } catch (error) {
    console.error('Award tokens error:', error);
    res.status(500).json({ 
      error: 'Server error while processing token award' 
    });
  }
};

/**
 * Retry failed transaction
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.retryTransaction = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Not authorized to perform this action' 
      });
    }
    
    const { transactionId } = req.params;
    
    // Find transaction
    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      return res.status(404).json({ 
        error: 'Transaction not found' 
      });
    }
    
    // Check if transaction can be retried
    if (transaction.status !== 'failed') {
      return res.status(400).json({ 
        error: 'Only failed transactions can be retried' 
      });
    }
    
    // Update transaction status
    transaction.status = 'pending';
    transaction.retryCount += 1;
    transaction.lastAttemptAt = Date.now();
    
    await transaction.save();
    
    // Queue transaction processing
    setTimeout(async () => {
      try {
        let result;
        
        // Process based on transaction type
        switch (transaction.type) {
          case 'reward':
            result = await tokenService.awardTokens(
              transaction.walletAddress,
              transaction.amount,
              transaction.reason
            );
            break;
            
          case 'transfer':
            result = await tokenService.transferTokens(
              transaction.walletAddress,
              transaction.recipientWalletAddress,
              transaction.amount
            );
            break;
            
          case 'purchase':
            const serverWalletAddress = process.env.SERVER_WALLET_ADDRESS;
            result = await tokenService.transferTokens(
              transaction.walletAddress,
              serverWalletAddress,
              transaction.amount
            );
            break;
            
          default:
            throw new Error('Unsupported transaction type');
        }
        
        // Update transaction with blockchain data
        await Transaction.updateStatus(transactionId, 'completed', {
          blockchainTxHash: result.transactionHash,
          blockNumber: result.blockNumber,
          gasUsed: result.gasUsed,
          confirmations: result.confirmations || 1
        });
      } catch (error) {
        console.error('Transaction retry failed:', error);
        await Transaction.updateStatus(transactionId, 'failed', {
          errorMessage: error.message
        });
      }
    }, 100);
    
    res.json({
      message: 'Transaction retry initiated',
      transaction: {
        transactionId,
        type: transaction.type,
        amount: transaction.amount,
        status: 'pending',
        retryCount: transaction.retryCount
      }
    });
  } catch (error) {
    console.error('Retry transaction error:', error);
    res.status(500).json({ 
      error: 'Server error while retrying transaction' 
    });
  }
};

/**
 * Cancel pending transaction
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.cancelTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    // Find transaction
    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      return res.status(404).json({ 
        error: 'Transaction not found' 
      });
    }
    
    // Check if user is authorized
    if (transaction.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Not authorized to cancel this transaction' 
      });
    }
    
    // Check if transaction can be canceled
    if (transaction.status !== 'pending') {
      return res.status(400).json({ 
        error: 'Only pending transactions can be canceled' 
      });
    }
    
    // Update transaction status
    transaction.status = 'canceled';
    await transaction.save();
    
    res.json({
      message: 'Transaction canceled successfully',
      transaction: {
        transactionId,
        type: transaction.type,
        amount: transaction.amount,
        status: 'canceled'
      }
    });
  } catch (error) {
    console.error('Cancel transaction error:', error);
    res.status(500).json({ 
      error: 'Server error while canceling transaction' 
    });
  }
};

/**
 * Get token balance
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getTokenBalance = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    
    // Check if user has wallet
    if (!user.walletAddress) {
      return res.json({
        balance: 0,
        walletConnected: false
      });
    }
    
    // Get token balance
    let balance = 0;
    try {
      balance = await tokenService.getTokenBalance(user.walletAddress);
    } catch (error) {
      console.error('Error fetching token balance:', error);
    }
    
    // Get pending transactions
    const pendingTransactions = await Transaction.find({
      user: userId,
      status: 'pending'
    });
    
    // Calculate pending balance changes
    const pendingBalance = pendingTransactions.reduce((sum, tx) => {
      if (tx.type === 'purchase' || tx.type === 'transfer') {
        return sum - tx.amount;
      } else if (tx.type === 'reward') {
        return sum + tx.amount;
      }
      return sum;
    }, 0);
    
    res.json({
      balance,
      pendingBalance,
      estimatedBalance: balance + pendingBalance,
      walletConnected: true,
      walletAddress: user.walletAddress
    });
  } catch (error) {
    console.error('Get token balance error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving token balance' 
    });
  }
};

/**
 * Get transaction statistics
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getTransactionStats = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Not authorized to perform this action' 
      });
    }
    
    const { startDate, endDate } = req.query;
    
    // Parse dates if provided
    const dateQuery = {};
    if (startDate) {
      dateQuery.startDate = new Date(startDate);
    }
    if (endDate) {
      dateQuery.endDate = new Date(endDate);
    }
    
    // Get transaction statistics
    const stats = await Transaction.getStatistics(
      dateQuery.startDate,
      dateQuery.endDate
    );
    
    // Get volume by date
    const volumeByDate = await Transaction.getVolumeByDate(
      dateQuery.startDate,
      dateQuery.endDate,
      'day'
    );
    
    res.json({
      stats,
      volumeByDate
    });
  } catch (error) {
    console.error('Get transaction stats error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving transaction statistics' 
    });
  }
};

module.exports = exports;()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { recipientId, amount, reason } = req.body;
    const userId = req.user.id;
    
    // Check if amount is valid
    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        error: 'Amount must be greater than zero' 
      });
    }
    
    // Find sender
    const sender = await User.findById(userId);
    if (!sender) {
      return res.status(404).json({ 
        error: 'Sender not found' 
      });
    }
    
    // Check if sender has wallet
    if (!sender.walletAddress) {
      return res.status(400).json({ 
        error: 'Sender wallet not connected' 
      });
    }
    
    // Find recipient
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ 
        error: 'Recipient not found' 
      });
    }
    
    // Check if recipient has wallet
    if (!recipient.walletAddress) {
      return res.status(400).json({ 
        error: 'Recipient wallet not connected' 
      });
    }
    
    // Check sender token balance
    let senderBalance;
    try {
      senderBalance = await tokenService.getTokenBalance(sender.walletAddress);
    } catch (error) {
      return res.status(500).json({ 
        error: 'Failed to get sender balance' 
      });
    }
    
    if (senderBalance < amount) {
      return res.status(400).json({ 
        error: 'Insufficient token balance' 
      });
    }
    
    // Generate transaction ID
    const transactionId = `transfer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create transaction record
    const transaction = await Transaction.createTransaction({
      transactionId,
      type: 'transfer',
      user: userId,
      recipient: recipientId,
      amount,
      status: 'pending',
      walletAddress: sender.walletAddress,
      recipientWalletAddress: recipient.walletAddress,
      reason: reason || 'User transfer',
      ipAddress: req.ip
    });
    
    // Queue transaction processing
    // In a production system, this would be handled by a separate service or queue
    setTimeout(async () => {
      try {
        // Perform transfer on blockchain
        const result = await tokenService.transferTokens(
          sender.walletAddress,
          recipient.walletAddress,
          amount
        );
        
        // Update transaction with blockchain data
        await Transaction.updateStatus(transactionId, 'completed', {
          blockchainTxHash: result.transactionHash,
          blockNumber: result.blockNumber,
          gasUsed: result.gasUsed,
          confirmations: result.confirmations || 1
        });
      } catch (error) {
        console.error('Token transfer failed:', error);
        await Transaction.updateStatus(transactionId, 'failed', {
          errorMessage: error.message
        });
      }
    }, 100);
    
    res.json({
      message: 'Token transfer initiated',
      transaction: {
        transactionId,
        type: 'transfer',
        amount,
        recipient: {
          id: recipient._id,
          username: recipient.username
        },
        status: 'pending',
        createdAt: transaction.createdAt
      }
    });
  } catch (error) {
    console.error('Transfer tokens error:', error);
    res.status(500).json({ 
      error: 'Server error while processing token transfer' 
    });
  }
};

/**
 * Purchase item with tokens
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.purchaseItem = async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { itemId, itemType, amount } = req.body;
    const userId = req.user.id;
    
    // Check if amount is valid
    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        error: 'Amount must be greater than zero' 
      });
    }
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    
    // Check if user has wallet
    if (!user.walletAddress) {
      return res.status(400).json({ 
        error: 'Wallet not connected' 
      });
    }
    
    // Check user token balance
    let userBalance;
    try {
      userBalance = await tokenService.getTokenBalance(user.walletAddress);
    } catch (error) {
      return res.status(500).json({ 
        error: 'Failed to get user balance' 
      });
    }
    
    if (userBalance < amount) {
      return res.status(400).json({ 
        error: 'Insufficient token balance' 
      });
    }
    
    // Get item details
    // In a real implementation, this would fetch from a game items database
    const item = {
      id: itemId,
      type: itemType,
      name: `${itemType} ${itemId}`,
      price: amount
    };
    
    // Generate transaction ID
    const transactionId = `purchase-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create transaction record
    const transaction = await Transaction.createTransaction({
      transactionId,
      type: 'purchase',
      user: userId,
      amount,
      status: 'pending',
      walletAddress: user.walletAddress,
      item: item.name,
      itemType: item.type,
      itemId: item.id,
      reason: `Purchase of ${item.name}`,
      ipAddress: req.ip
    });
    
    // Queue transaction processing
    // In a production system, this would be handled by a separate service or queue
    setTimeout(async () => {
      try {
        // Perform purchase on blockchain
        // This would interact with a purchase smart contract
        const serverWalletAddress = process.env.SERVER_WALLET_ADDRESS;
        
        const result = await tokenService.transferTokens(
          user.walletAddress,
          serverWalletAddress,
          amount
        );
        
        // Update transaction with blockchain data
        await Transaction.updateStatus(transactionId, 'completed', {
          blockchainTxHash: result.transactionHash,
          blockNumber: result.blockNumber,
          gasUsed: result.gasUsed,
          confirmations: result.confirmations || 1
        });
        
        // In a real implementation, this would trigger item delivery to the player
      } catch (error) {
        console.error('Item purchase failed:', error);
        await Transaction.updateStatus(transactionId, 'failed', {
          errorMessage: error.message
        });
      }
    }, 100);
    
    res.json({
      message: 'Item purchase initiated',
      transaction: {
        transactionId,
        type: 'purchase',
        amount,
        item: item.name,
        itemType: item.type,
        itemId: item.id,
        status: 'pending',
        createdAt: transaction.createdAt
      }
    });
  } catch (error) {
    console.error('Purchase item error:', error);
    res.status(500).json({ 
      error: 'Server error while processing item purchase' 
    });
  }
};

/**
 * Award tokens to player
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.awardTokens = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Not authorized to perform this action' 
      });
    }
    
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }