/**
 * Leaderboard Model
 * 
 * Schema for global and seasonal leaderboards.
 * 
 * @module models/Leaderboard
 */

const mongoose = require('mongoose');

/**
 * Leaderboard Schema
 */
const LeaderboardSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['global', 'seasonal', 'weekly', 'daily', 'event'],
    required: true
  },
  gameMode: {
    type: String,
    enum: ['deathmatch', 'team_deathmatch', 'race', 'all'],
    required: true
  },
  season: {
    type: Number,
    default: 1
  },
  eventId: {
    type: String,
    default: null
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  entries: [{
    rank: {
      type: Number,
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    username: {
      type: String,
      required: true
    },
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
    wins: {
      type: Number,
      default: 0
    },
    losses: {
      type: Number,
      default: 0
    },
    bestTime: {
      type: Number,
      default: 0
    },
    gamesPlayed: {
      type: Number,
      default: 0
    },
    aircraft: {
      type: String,
      default: 'fighter'
    }
  }],
  rewards: {
    topRewards: [{
      rank: {
        type: Number,
        required: true
      },
      tokenAmount: {
        type: Number,
        required: true
      },
      badgeId: String,
      itemId: String
    }],
    participationReward: {
      type: Number,
      default: 0
    },
    minimumGames: {
      type: Number,
      default: 1
    }
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

/**
 * Sort entries by rank
 */
LeaderboardSchema.pre('save', function(next) {
  // Sort entries by rank
  if (this.entries.length > 0) {
    this.entries.sort((a, b) => a.rank - b.rank);
  }
  
  // Update lastUpdated timestamp
  this.lastUpdated = Date.now();
  
  next();
});

/**
 * Find active leaderboards
 * @returns {Promise<Leaderboard[]>} Active leaderboards
 */
LeaderboardSchema.statics.findActive = function() {
  return this.find({ isActive: true })
    .sort({ type: 1, gameMode: 1 });
};

/**
 * Find leaderboard by type and game mode
 * @param {string} type - Leaderboard type
 * @param {string} gameMode - Game mode
 * @returns {Promise<Leaderboard>} Leaderboard
 */
LeaderboardSchema.statics.findByTypeAndMode = function(type, gameMode) {
  return this.findOne({
    type,
    gameMode,
    isActive: true
  });
};

/**
 * Find current seasonal leaderboard
 * @param {string} gameMode - Game mode
 * @returns {Promise<Leaderboard>} Current seasonal leaderboard
 */
LeaderboardSchema.statics.findCurrentSeasonal = function(gameMode) {
  return this.findOne({
    type: 'seasonal',
    gameMode,
    isActive: true
  })
  .sort({ season: -1 });
};

/**
 * Get user rank and entry
 * @param {ObjectId} userId - User ID
 * @returns {Object|null} User entry with rank
 */
LeaderboardSchema.methods.getUserEntry = function(userId) {
  const entry = this.entries.find(entry => entry.user.toString() === userId.toString());
  return entry || null;
};

/**
 * Update user entry in leaderboard
 * @param {Object} userData - User data
 * @returns {Promise<Leaderboard>} Updated leaderboard
 */
LeaderboardSchema.methods.updateUserEntry = async function(userData) {
  const userId = userData.user;
  
  // Find existing entry
  let entry = this.entries.find(entry => entry.user.toString() === userId.toString());
  
  // Create new entry if not exists
  if (!entry) {
    entry = {
      user: userId,
      username: userData.username,
      rank: this.entries.length + 1,
      score: 0,
      kills: 0,
      deaths: 0,
      wins: 0,
      losses: 0,
      bestTime: 0,
      gamesPlayed: 0,
      aircraft: userData.aircraft || 'fighter'
    };
    
    this.entries.push(entry);
  }
  
  // Update entry with new data
  entry.username = userData.username;
  entry.score += userData.score || 0;
  entry.kills += userData.kills || 0;
  entry.deaths += userData.deaths || 0;
  entry.gamesPlayed += 1;
  
  // Update wins/losses
  if (userData.isWinner) {
    entry.wins += 1;
  } else {
    entry.losses += 1;
  }
  
  // Update best time for race mode
  if (this.gameMode === 'race' && userData.raceTime && 
      (entry.bestTime === 0 || userData.raceTime < entry.bestTime)) {
    entry.bestTime = userData.raceTime;
  }
  
  // Re-rank all entries
  this._rerank();
  
  // Save changes
  return this.save();
};

/**
 * Re-rank all entries
 * @private
 */
LeaderboardSchema.methods._rerank = function() {
  // Sort entries differently based on game mode
  if (this.gameMode === 'race') {
    // Race: sort by best time (ascending)
    this.entries.sort((a, b) => {
      // If both have a time, sort by time
      if (a.bestTime > 0 && b.bestTime > 0) {
        return a.bestTime - b.bestTime;
      }
      
      // If only one has a time, that one comes first
      if (a.bestTime > 0) return -1;
      if (b.bestTime > 0) return 1;
      
      // If neither has a time, sort by games played
      return b.gamesPlayed - a.gamesPlayed;
    });
  } else {
    // Other modes: sort by score (descending)
    this.entries.sort((a, b) => {
      // First by score
      if (b.score !== a.score) return b.score - a.score;
      
      // Then by K/D ratio
      const aKD = a.deaths > 0 ? a.kills / a.deaths : a.kills;
      const bKD = b.deaths > 0 ? b.kills / b.deaths : b.kills;
      if (bKD !== aKD) return bKD - aKD;
      
      // Then by wins
      if (b.wins !== a.wins) return b.wins - a.wins;
      
      // Finally by games played
      return a.gamesPlayed - b.gamesPlayed;
    });
  }
  
  // Assign ranks
  this.entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });
};

/**
 * Create new seasonal leaderboard
 * @param {string} gameMode - Game mode
 * @param {number} season - Season number
 * @param {Date} startDate - Season start date
 * @param {Date} endDate - Season end date
 * @param {Object} rewards - Reward structure
 * @returns {Promise<Leaderboard>} New leaderboard
 */
LeaderboardSchema.statics.createSeasonal = async function(gameMode, season, startDate, endDate, rewards) {
  // End any active seasonal leaderboards for this game mode
  await this.updateMany(
    { type: 'seasonal', gameMode, isActive: true },
    { isActive: false, endDate: new Date() }
  );
  
  // Create new seasonal leaderboard
  const leaderboard = new this({
    type: 'seasonal',
    gameMode,
    season,
    startDate,
    endDate,
    isActive: true,
    entries: [],
    rewards
  });
  
  return leaderboard.save();
};

/**
 * Process rewards for current leaderboard
 * @returns {Promise<Object>} Reward results
 */
LeaderboardSchema.methods.processRewards = async function() {
  if (this.isActive) {
    throw new Error('Cannot process rewards for active leaderboard');
  }
  
  // Track rewards given
  const results = {
    totalRewarded: 0,
    topRewards: [],
    participationRewards: []
  };
  
  // Process top rewards
  for (const reward of this.rewards.topRewards) {
    // Find entries at this rank
    const entries = this.entries.filter(entry => entry.rank === reward.rank);
    
    for (const entry of entries) {
      // Get user
      const User = mongoose.model('User');
      const user = await User.findById(entry.user);
      
      if (!user) continue;
      
      // Add tokens
      user.tokenBalance += reward.tokenAmount;
      await user.save();
      
      // Track reward
      results.topRewards.push({
        userId: user._id,
        username: user.username,
        rank: entry.rank,
        tokenAmount: reward.tokenAmount
      });
      
      results.totalRewarded += reward.tokenAmount;
      
      // Add badge if specified
      if (reward.badgeId) {
        const PlayerStats = mongoose.model('PlayerStats');
        const stats = await PlayerStats.findByUserId(user._id);
        
        if (stats) {
          await stats.addBadge({
            id: reward.badgeId,
            name: `Season ${this.season} Rank ${entry.rank}`,
            description: `Reached rank ${entry.rank} in Season ${this.season} ${this.gameMode}.`,
            icon: `season_${this.season}_rank_${entry.rank}`,
            rarity: entry.rank <= 3 ? 'legendary' : (entry.rank <= 10 ? 'epic' : 'rare')
          });
        }
      }
    }
  }
  
  // Process participation rewards
  if (this.rewards.participationReward > 0 && this.rewards.minimumGames > 0) {
    const eligibleEntries = this.entries.filter(entry => 
      entry.gamesPlayed >= this.rewards.minimumGames
    );
    
    for (const entry of eligibleEntries) {
      // Skip entries that already got top rewards
      if (results.topRewards.some(r => r.userId.toString() === entry.user.toString())) {
        continue;
      }
      
      // Get user
      const User = mongoose.model('User');
      const user = await User.findById(entry.user);
      
      if (!user) continue;
      
      // Add tokens
      user.tokenBalance += this.rewards.participationReward;
      await user.save();
      
      // Track reward
      results.participationRewards.push({
        userId: user._id,
        username: user.username,
        rank: entry.rank,
        tokenAmount: this.rewards.participationReward
      });
      
      results.totalRewarded += this.rewards.participationReward;
    }
  }
  
  return results;
};

// Create model
const Leaderboard = mongoose.model('Leaderboard', LeaderboardSchema);

module.exports = Leaderboard;