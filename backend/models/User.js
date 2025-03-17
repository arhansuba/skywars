/**
 * User Model
 * 
 * Schema and methods for user accounts with authentication and wallet integration.
 * 
 * @module models/User
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const SALT_WORK_FACTOR = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'skywars_secret_key';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

/**
 * User Schema
 */
const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [20, 'Username cannot exceed 20 characters'],
    match: [/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores and hyphens']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // Don't include password in query results by default
  },
  walletAddress: {
    type: String,
    unique: true,
    sparse: true, // Allow multiple null values (for users without wallets)
    trim: true,
    validate: {
      validator: function(v) {
        return v === null || v === undefined || /^0x[a-fA-F0-9]{40}$/.test(v);
      },
      message: props => `${props.value} is not a valid Ethereum address`
    }
  },
  walletSignature: {
    type: String,
    select: false // Don't include in query results by default
  },
  walletNonce: {
    type: String,
    default: () => crypto.randomBytes(16).toString('hex')
  },
  role: {
    type: String,
    enum: ['user', 'premium', 'admin'],
    default: 'user'
  },
  profilePicture: {
    type: String,
    default: 'default.png'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  verificationExpires: Date,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  lastLogin: Date,
  preferences: {
    controls: {
      type: Object,
      default: {
        sensitivity: 1.0,
        invertY: false,
        keyBindings: {}
      }
    },
    audio: {
      type: Object,
      default: {
        masterVolume: 0.8,
        musicVolume: 0.5,
        sfxVolume: 1.0
      }
    },
    graphics: {
      type: Object,
      default: {
        quality: 'medium',
        postProcessing: true,
        shadows: true
      }
    },
    notifications: {
      type: Object,
      default: {
        achievements: true,
        friendRequests: true,
        gameInvites: true
      }
    }
  },
  friends: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'blocked'],
      default: 'pending'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  tokenBalance: {
    type: Number,
    default: 0
  },
  emailNotifications: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.walletSignature;
      delete ret.verificationToken;
      delete ret.resetPasswordToken;
      return ret;
    }
  }
});

/**
 * Hash password before saving
 */
UserSchema.pre('save', async function(next) {
  // Only hash the password if it's modified (or new)
  if (!this.isModified('password')) return next();
  
  try {
    // Generate salt
    const salt = await bcrypt.genSalt(SALT_WORK_FACTOR);
    
    // Hash password with salt
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Compare password with user's hashed password
 * @param {string} candidatePassword - Password to compare
 * @returns {Promise<boolean>} True if passwords match
 */
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Generate JWT token for user
 * @returns {string} JWT token
 */
UserSchema.methods.generateAuthToken = function() {
  return jwt.sign({
    id: this._id,
    username: this.username,
    email: this.email,
    role: this.role,
    walletAddress: this.walletAddress
  }, JWT_SECRET, {
    expiresIn: JWT_EXPIRY
  });
};

/**
 * Generate wallet verification message
 * @returns {string} Message to sign
 */
UserSchema.methods.generateWalletVerificationMessage = function() {
  return `Sign this message to verify your wallet ownership with SkyWars Game. Nonce: ${this.walletNonce}`;
};

/**
 * Generate new verification token for email confirmation
 * @returns {string} Verification token
 */
UserSchema.methods.generateVerificationToken = function() {
  this.verificationToken = crypto.randomBytes(32).toString('hex');
  this.verificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return this.verificationToken;
};

/**
 * Generate password reset token
 * @returns {string} Reset token
 */
UserSchema.methods.generatePasswordResetToken = function() {
  this.resetPasswordToken = crypto.randomBytes(32).toString('hex');
  this.resetPasswordExpires = Date.now() + 1 * 60 * 60 * 1000; // 1 hour
  return this.resetPasswordToken;
};

/**
 * Find user by verification token
 * @param {string} token - Verification token
 * @returns {Promise<User>} User document
 */
UserSchema.statics.findByVerificationToken = function(token) {
  return this.findOne({
    verificationToken: token,
    verificationExpires: { $gt: Date.now() }
  });
};

/**
 * Find user by reset token
 * @param {string} token - Reset token
 * @returns {Promise<User>} User document
 */
UserSchema.statics.findByResetToken = function(token) {
  return this.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() }
  });
};

/**
 * Check if user is premium or admin
 * @returns {boolean} True if premium or admin
 */
UserSchema.methods.isPremium = function() {
  return this.role === 'premium' || this.role === 'admin';
};

/**
 * Virtual for user's full stats
 */
UserSchema.virtual('stats', {
  ref: 'PlayerStats',
  localField: '_id',
  foreignField: 'user',
  justOne: true
});

// Create model
const User = mongoose.model('User', UserSchema);

module.exports = User;