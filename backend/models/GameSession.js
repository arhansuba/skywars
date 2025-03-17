/**
 * Game Session Model
 * 
 * Schema for tracking game sessions, participants, and outcomes.
 * 
 * @module models/GameSession
 */

const mongoose = require('mongoose');

/**
 * Game Session Schema
 */
const GameSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  gameMode: {
    type: String,
    required: true,
    enum: ['deathmatch', 'team_deathmatch', 'race', 'mission', 'training', 'exploration'],
    default: 'deathmatch'
  },
  environment: {
    type: String,
    required: true,
    enum: ['mountains', 'ocean', 'desert', 'arctic', 'city', 'canyon'],
    default: 'mountains'
  },
  status: {
    type: String,
    required: true,
    enum: ['waiting', 'running', 'completed', 'aborted'],
    default: 'waiting'
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number, // Duration in milliseconds
    default: 0
  },
  maxPlayers: {
    type: Number,
    default: 32
  },
  settings: {
    timeLimit: Number, // In milliseconds
    scoreLimit: Number,
    friendlyFire: {
      type: Boolean,
      default: false
    },
    respawnTime: {
      type: Number,
      default: 5000
    },
    weaponRestrictions: [String],
    customRules: mongoose.Schema.Types.Mixed
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    playerId: String,
    username: String,
    team: {
      type: String,
      default: null
    },
    joinTime: {
      type: Date,
      default: Date.now
    },
    leaveTime: Date,
    score: {
      type: Number,
      default: 0
    },
    kills: {
      type: Number,
      default: 0
    },
    deaths: {
      type: Number,
      default: 0
    },
    assists: {
      type: Number,
      default: 0
    },
    playtime: {
      type: Number, // In milliseconds
      default: 0
    },
    tokensEarned: {
      type: Number,
      default: 0
    },
    position: {
      type: Number, // Final position/rank
      default: 0
    },
    isAI: {
      type: Boolean,
      default: false
    },
    aircraft: {
      type: String,
      default: 'fighter'
    }
  }],
  teams: [{
    id: String,
    name: String,
    color: String,
    score: {
      type: Number,
      default: 0
    },
    isWinner: {
      type: Boolean,
      default: false
    }
  }],
  events: [{
    type: {
      type: String,
      enum: ['kill', 'death', 'join', 'leave', 'message', 'token_reward', 'achievement', 'game_event']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    playerId: String,
    targetId: String,
    message: String,
    details: mongoose.Schema.Types.Mixed
  }],
  leaderboard: {
    type: mongoose.Schema.Types.Mixed, // Store final leaderboard
    default: {}
  },
  weatherEvents: [{
    type: {
      type: String,
      enum: ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    duration: Number // In milliseconds
  }],
  hostServer: {
    type: String, // Server ID or name
    default: 'main'
  },
  version: {
    type: String, // Game version
    default: '1.0.0'
  }
}, {
  timestamps: true
});

/**
 * Calculate duration and update on save
 */
GameSessionSchema.pre('save', function(next) {
  // If session is completed and has end time, calculate duration
  if ((this.status === 'completed' || this.status === 'aborted') && this.endTime) {
    this.duration = this.endTime - this.startTime;
  }

  // Update participant playtime
  if (this.isModified('participants')) {
    this.participants.forEach(participant => {
      if (participant.leaveTime) {
        participant.playtime = participant.leaveTime - participant.joinTime;
      }
    });
  }

  next();
});

/**
 * Find active sessions
 * @returns {Promise<GameSession[]>} Active sessions
 */
GameSessionSchema.statics.findActiveSessions = function() {
  return this.find({
    status: { $in: ['waiting', 'running'] }
  }).sort({ startTime: -1 });
};

/**
 * Find sessions by user
 * @param {ObjectId} userId - User ID
 * @returns {Promise<GameSession[]>} User's sessions
 */
GameSessionSchema.statics.findByUser = function(userId) {
  return this.find({
    'participants.user': userId
  }).sort({ startTime: -1 });
};

/**
 * Find recent sessions
 * @param {number} limit - Maximum number of sessions to return
 * @returns {Promise<GameSession[]>} Recent sessions
 */
GameSessionSchema.statics.findRecentSessions = function(limit = 10) {
  return this.find({
    status: { $in: ['completed', 'aborted'] }
  })
  .sort({ endTime: -1 })
  .limit(limit);
};

/**
 * Get session statistics
 * @returns {Promise<Object>} Session statistics
 */
GameSessionSchema.statics.getStatistics = async function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        completedSessions: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
          }
        },
        averageDuration: { $avg: '$duration' },
        averageParticipants: { $avg: { $size: '$participants' } },
        totalPlaytime: {
          $sum: {
            $reduce: {
              input: '$participants',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.playtime'] }
            }
          }
        },
        gameModeCounts: {
          $push: {
            gameMode: '$gameMode',
            count: 1
          }
        }
      }
    }
  ]);
};

// Create model
const GameSession = mongoose.model('GameSession', GameSessionSchema);

module.exports = GameSession;