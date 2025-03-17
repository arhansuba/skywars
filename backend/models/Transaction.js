/**
 * Transaction Model
 * 
 * Schema for tracking in-game currency transactions and blockchain integration.
 * 
 * @module models/Transaction
 */

const mongoose = require('mongoose');

/**
 * Transaction Schema
 */
const TransactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: [
      'reward', 'purchase', 'transfer', 
      'achievement', 'leaderboard', 'refund',
      'deposit', 'withdrawal', 'admin', 'system'
    ],
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  walletAddress: {
    type: String,
    trim: true
  },
  recipientWalletAddress: {
    type: String,
    trim: true
  },
  item: {
    type: String
  },
  itemType: {
    type: String,
    enum: ['aircraft', 'skin', 'weapon', 'upgrade', 'consumable', 'blueprint', 'nft']
  },
  itemId: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'canceled'],
    default: 'pending'
  },
  blockchainTxHash: {
    type: String,
    trim: true
  },
  blockNumber: {
    type: Number
  },
  gasUsed: {
    type: Number
  },
  confirmations: {
    type: Number,
    default: 0
  },
  gameSession: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GameSession'
  },
  reason: {
    type: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  errorMessage: {
    type: String
  },
  completedAt: {
    type: Date
  },
  attempts: {
    type: Number,
    default: 0
  },
  lastAttemptAt: {
    type: Date
  },
  retryCount: {
    type: Number,
    default: 0
  },
  ipAddress: {
    type: String
  }
}, {
  timestamps: true
});

/**
 * Create indexes
 */
TransactionSchema.index({ user: 1, createdAt: -1 });
TransactionSchema.index({ blockchainTxHash: 1 }, { sparse: true });
TransactionSchema.index({ status: 1, createdAt: -1 });
TransactionSchema.index({ type: 1, createdAt: -1 });

/**
 * Format amount before saving
 */
TransactionSchema.pre('save', function(next) {
  // Ensure amount is properly formatted
  this.amount = parseFloat(this.amount.toFixed(6));
  
  // Set completedAt for completed transactions
  if (this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  
  next();
});

/**
 * Find pending transactions
 * @returns {Promise<Transaction[]>} Pending transactions
 */
TransactionSchema.statics.findPending = function() {
  return this.find({ status: 'pending' })
    .sort({ createdAt: 1 })
    .populate('user', 'username walletAddress');
};

/**
 * Find transactions by user
 * @param {ObjectId} userId - User ID
 * @param {number} limit - Maximum number of transactions to return
 * @returns {Promise<Transaction[]>} User transactions
 */
TransactionSchema.statics.findByUser = function(userId, limit = 50) {
  return this.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('user', 'username')
    .populate('recipient', 'username');
};

/**
 * Find transactions by type
 * @param {string} type - Transaction type
 * @param {number} limit - Maximum number of transactions to return
 * @returns {Promise<Transaction[]>} Transactions of specified type
 */
TransactionSchema.statics.findByType = function(type, limit = 100) {
  return this.find({ type })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('user', 'username')
    .populate('recipient', 'username');
};

/**
 * Find transaction by blockchain hash
 * @param {string} txHash - Blockchain transaction hash
 * @returns {Promise<Transaction>} Transaction
 */
TransactionSchema.statics.findByTxHash = function(txHash) {
  return this.findOne({ blockchainTxHash: txHash })
    .populate('user', 'username walletAddress')
    .populate('recipient', 'username walletAddress');
};

/**
 * Update transaction status
 * @param {string} transactionId - Transaction ID
 * @param {string} status - New status
 * @param {Object} data - Additional data
 * @returns {Promise<Transaction>} Updated transaction
 */
TransactionSchema.statics.updateStatus = async function(transactionId, status, data = {}) {
  const transaction = await this.findOne({ transactionId });
  
  if (!transaction) {
    throw new Error('Transaction not found');
  }
  
  // Update status
  transaction.status = status;
  
  // Update blockchain data if provided
  if (data.blockchainTxHash) transaction.blockchainTxHash = data.blockchainTxHash;
  if (data.blockNumber) transaction.blockNumber = data.blockNumber;
  if (data.gasUsed) transaction.gasUsed = data.gasUsed;
  if (data.confirmations) transaction.confirmations = data.confirmations;
  
  // Set completion time if status is completed
  if (status === 'completed') {
    transaction.completedAt = new Date();
  }
  
  // Record error message if status is failed
  if (status === 'failed' && data.errorMessage) {
    transaction.errorMessage = data.errorMessage;
  }
  
  // Increment attempt count
  transaction.attempts += 1;
  transaction.lastAttemptAt = new Date();
  
  return transaction.save();
};

/**
 * Create new transaction
 * @param {Object} data - Transaction data
 * @returns {Promise<Transaction>} New transaction
 */
TransactionSchema.statics.createTransaction = async function(data) {
  // Generate transaction ID if not provided
  if (!data.transactionId) {
    data.transactionId = `tx-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  }
  
  // Create transaction
  const transaction = new this(data);
  
  // Save and return
  return transaction.save();
};

/**
 * Get transaction statistics
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} Transaction statistics
 */
TransactionSchema.statics.getStatistics = async function(startDate, endDate) {
  const query = {};
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }
  
  // Run aggregation
  return this.aggregate([
    {
      $match: query
    },
    {
      $group: {
        _id: {
          type: '$type',
          status: '$status'
        },
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        avgAmount: { $avg: '$amount' },
        minAmount: { $min: '$amount' },
        maxAmount: { $max: '$amount' }
      }
    },
    {
      $group: {
        _id: '$_id.type',
        statuses: {
          $push: {
            status: '$_id.status',
            count: '$count',
            totalAmount: '$totalAmount',
            avgAmount: '$avgAmount',
            minAmount: '$minAmount',
            maxAmount: '$maxAmount'
          }
        },
        totalCount: { $sum: '$count' },
        totalAmount: { $sum: '$totalAmount' }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
};

/**
 * Get user transaction summary
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Object>} Transaction summary
 */
TransactionSchema.statics.getUserSummary = async function(userId) {
  return this.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(userId),
        status: 'completed'
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
};

/**
 * Get transaction volume by date
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string} interval - Grouping interval ('day', 'week', 'month')
 * @returns {Promise<Object[]>} Transaction volume by date
 */
TransactionSchema.statics.getVolumeByDate = async function(startDate, endDate, interval = 'day') {
  const query = {
    status: 'completed'
  };
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }
  
  // Determine date grouping format
  let dateFormat;
  switch (interval) {
    case 'week':
      dateFormat = { 
        year: { $year: '$createdAt' }, 
        week: { $week: '$createdAt' } 
      };
      break;
    case 'month':
      dateFormat = { 
        year: { $year: '$createdAt' }, 
        month: { $month: '$createdAt' } 
      };
      break;
    case 'day':
    default:
      dateFormat = { 
        year: { $year: '$createdAt' }, 
        month: { $month: '$createdAt' }, 
        day: { $dayOfMonth: '$createdAt' } 
      };
      break;
  }
  
  return this.aggregate([
    {
      $match: query
    },
    {
      $group: {
        _id: {
          date: dateFormat,
          type: '$type'
        },
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    },
    {
      $group: {
        _id: '$_id.date',
        types: {
          $push: {
            type: '$_id.type',
            count: '$count',
            totalAmount: '$totalAmount'
          }
        },
        totalCount: { $sum: '$count' },
        totalAmount: { $sum: '$totalAmount' }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 }
    }
  ]);
};

// Create model
const Transaction = mongoose.model('Transaction', TransactionSchema);

module.exports = Transaction;