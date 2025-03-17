/**
 * Player Statistics Model
 * 
 * Schema for tracking player performance metrics and career statistics.
 * 
 * @module models/PlayerStats
 */

const mongoose = require('mongoose');

/**
 * Player Statistics Schema
 */
const PlayerStatsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true
  },
  rank: {
    type: Number,
    default: 0
  },
  level: {
    type: Number,
    default: 1
  },
  experience: {
    type: Number,
    default: 0
  },
  totalGames: {
    type: Number,
    default: 0
  },
  gamesWon: {
    type: Number,
    default: 0
  },
  gamesLost: {
    type: Number,
    default: 0
  },
  winRate: {
    type: Number,
    default: 0
  },
  totalKills: {
    type: Number,
    default: 0
  },
  totalDeaths: {
    type: Number,
    default: 0
  },
  killDeathRatio: {
    type: Number,
    default: 0
  },
  totalAssists: {
    type: Number,
    default: 0
  },
  highestKillStreak: {
    type: Number,
    default: 0
  },
  accuracy: {
    type: Number,
    default: 0
  },
  totalShots: {
    type: Number,
    default: 0
  },
  shotsHit: {
    type: Number,
    default: 0
  },
  totalPlaytime: {
    type: Number, // In milliseconds
    default: 0
  },
  tokensEarned: {
    type: Number,
    default: 0
  },
  averageScore: {
    type: Number,
    default: 0
  },
  totalScore: {
    type: Number,
    default: 0
  },
  achievementsUnlocked: {
    type: Number,
    default: 0
  },
  achievements: [{
    id: String,
    name: String,
    description: String,
    unlockedAt: {
      type: Date,
      default: Date.now
    }
  }],
  favoriteAircraft: {
    type: String,
    default: 'fighter'
  },
  aircraftStats: {
    fighter: {
      gamesPlayed: { type: Number, default: 0 },
      kills: { type: Number, default: 0 },
      deaths: { type: Number, default: 0 },
      playtime: { type: Number, default: 0 },
      wins: { type: Number, default: 0 }
    },
    bomber: {
      gamesPlayed: { type: Number, default: 0 },
      kills: { type: Number, default: 0 },
      deaths: { type: Number, default: 0 },
      playtime: { type: Number, default: 0 },
      wins: { type: Number, default: 0 }
    },
    light: {
      gamesPlayed: { type: Number, default: 0 },
      kills: { type: Number, default: 0 },
      deaths: { type: Number, default: 0 },
      playtime: { type: Number, default: 0 },
      wins: { type: Number, default: 0 }
    }
  },
  weaponStats: {
    primary: {
      shots: { type: Number, default: 0 },
      hits: { type: Number, default: 0 },
      kills: { type: Number, default: 0 },
      accuracy: { type: Number, default: 0 }
    },
    missile: {
      shots: { type: Number, default: 0 },
      hits: { type: Number, default: 0 },
      kills: { type: Number, default: 0 },
      accuracy: { type: Number, default: 0 }
    },
    bomb: {
      shots: { type: Number, default: 0 },
      hits: { type: Number, default: 0 },
      kills: { type: Number, default: 0 },
      accuracy: { type: Number, default: 0 }
    }
  },
  gameModeStats: {
    deathmatch: {
      gamesPlayed: { type: Number, default: 0 },
      wins: { type: Number, default: 0 },
      kills: { type: Number, default: 0 },
      deaths: { type: Number, default: 0 },
      bestScore: { type: Number, default: 0 }
    },
    team_deathmatch: {
      gamesPlayed: { type: Number, default: 0 },
      wins: { type: Number, default: 0 },
      kills: { type: Number, default: 0 },
      deaths: { type: Number, default: 0 },
      bestScore: { type: Number, default: 0 }
    },
    race: {
      gamesPlayed: { type: Number, default: 0 },
      wins: { type: Number, default: 0 },
      bestTime: { type: Number, default: 0 },
      fastestLap: { type: Number, default: 0 }
    }
  },
  recentPerformance: [{
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GameSession'
    },
    sessionId: String,
    gameMode: String,
    date: {
      type: Date,
      default: Date.now
    },
    score: Number,
    kills: Number,
    deaths: Number,
    position: Number,
    aircraft: String
  }],
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  badges: [{
    id: String,
    name: String,
    description: String,
    icon: String,
    rarity: {
      type: String,
      enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
      default: 'common'
    },
    earnedAt: {
      type: Date,
      default: Date.now
    }
  }],
  personalBests: {
    highestKills: {
      value: { type: Number, default: 0 },
      gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameSession' },
      date: Date
    },
    highestScore: {
      value: { type: Number, default: 0 },
      gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameSession' },
      date: Date
    },
    longestSession: {
      value: { type: Number, default: 0 }, // In milliseconds
      gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameSession' },
      date: Date
    },
    fastestRace: {
      value: { type: Number, default: 0 }, // In milliseconds
      gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameSession' },
      date: Date
    }
  }
}, {
  timestamps: true
});

/**
 * Calculate derived statistics before saving
 */
PlayerStatsSchema.pre('save', function(next) {
  // Calculate win rate
  if (this.totalGames > 0) {
    this.winRate = (this.gamesWon / this.totalGames) * 100;
  }
  
  // Calculate kill/death ratio
  if (this.totalDeaths > 0) {
    this.killDeathRatio = this.totalKills / this.totalDeaths;
  } else if (this.totalKills > 0) {
    this.killDeathRatio = this.totalKills; // No deaths, K/D is equal to kills
  }
  
  // Calculate accuracy
  if (this.totalShots > 0) {
    this.accuracy = (this.shotsHit / this.totalShots) * 100;
  }
  
  // Calculate average score
  if (this.totalGames > 0) {
    this.averageScore = this.totalScore / this.totalGames;
  }
  
  // Calculate weapon accuracies
  if (this.weaponStats.primary.shots > 0) {
    this.weaponStats.primary.accuracy = (this.weaponStats.primary.hits / this.weaponStats.primary.shots) * 100;
  }
  
  if (this.weaponStats.missile.shots > 0) {
    this.weaponStats.missile.accuracy = (this.weaponStats.missile.hits / this.weaponStats.missile.shots) * 100;
  }
  
  if (this.weaponStats.bomb.shots > 0) {
    this.weaponStats.bomb.accuracy = (this.weaponStats.bomb.hits / this.weaponStats.bomb.shots) * 100;
  }
  
  // Determine favorite aircraft based on playtime
  const aircraftTypes = Object.keys(this.aircraftStats);
  let maxPlaytime = 0;
  let favoriteAircraft = this.favoriteAircraft;
  
  for (const type of aircraftTypes) {
    if (this.aircraftStats[type].playtime > maxPlaytime) {
      maxPlaytime = this.aircraftStats[type].playtime;
      favoriteAircraft = type;
    }
  }
  
  this.favoriteAircraft = favoriteAircraft;
  
  // Update last updated timestamp
  this.lastUpdated = Date.now();
  
  next();
});

/**
 * Update stats after game session
 * @param {Object} gameData - Game session data
 * @returns {Promise<PlayerStats>} Updated stats
 */
PlayerStatsSchema.methods.updateAfterGame = async function(gameData) {
  // Extract player data from game session
  const playerData = gameData.participants.find(p => p.user.toString() === this.user.toString());
  if (!playerData) return this;
  
  // Update basic stats
  this.totalGames += 1;
  this.totalKills += playerData.kills || 0;
  this.totalDeaths += playerData.deaths || 0;
  this.totalAssists += playerData.assists || 0;
  this.totalScore += playerData.score || 0;
  this.totalPlaytime += playerData.playtime || 0;
  this.tokensEarned += playerData.tokensEarned || 0;
  
  // Update win/loss
  const won = (
    // In team mode, check if player's team won
    (gameData.gameMode === 'team_deathmatch' && 
     gameData.teams.find(t => t.id === playerData.team)?.isWinner) ||
    // In deathmatch, check if player ranked 1st
    (gameData.gameMode === 'deathmatch' && playerData.position === 1) ||
    // In race, check if player ranked 1st
    (gameData.gameMode === 'race' && playerData.position === 1)
  );
  
  if (won) {
    this.gamesWon += 1;
  } else {
    this.gamesLost += 1;
  }
  
  // Update aircraft stats
  const aircraft = playerData.aircraft.toLowerCase();
  if (this.aircraftStats[aircraft]) {
    this.aircraftStats[aircraft].gamesPlayed += 1;
    this.aircraftStats[aircraft].kills += playerData.kills || 0;
    this.aircraftStats[aircraft].deaths += playerData.deaths || 0;
    this.aircraftStats[aircraft].playtime += playerData.playtime || 0;
    if (won) {
      this.aircraftStats[aircraft].wins += 1;
    }
  }
  
  // Update game mode stats
  const gameMode = gameData.gameMode;
  if (this.gameModeStats[gameMode]) {
    this.gameModeStats[gameMode].gamesPlayed += 1;
    if (won) {
      this.gameModeStats[gameMode].wins += 1;
    }
    
    if (gameMode === 'deathmatch' || gameMode === 'team_deathmatch') {
      this.gameModeStats[gameMode].kills += playerData.kills || 0;
      this.gameModeStats[gameMode].deaths += playerData.deaths || 0;
      
      if (playerData.score > this.gameModeStats[gameMode].bestScore) {
        this.gameModeStats[gameMode].bestScore = playerData.score;
      }
    } else if (gameMode === 'race') {
      // Update best race time if better than current
      const raceTime = playerData.playtime;
      if (raceTime > 0 && (this.gameModeStats.race.bestTime === 0 || raceTime < this.gameModeStats.race.bestTime)) {
        this.gameModeStats.race.bestTime = raceTime;
      }
      
      // Update fastest lap if available and better than current
      if (playerData.details && playerData.details.fastestLap && 
          (this.gameModeStats.race.fastestLap === 0 || 
           playerData.details.fastestLap < this.gameModeStats.race.fastestLap)) {
        this.gameModeStats.race.fastestLap = playerData.details.fastestLap;
      }
    }
  }
  
  // Update personal bests
  if (playerData.kills > this.personalBests.highestKills.value) {
    this.personalBests.highestKills = {
      value: playerData.kills,
      gameId: gameData._id,
      date: gameData.endTime
    };
  }
  
  if (playerData.score > this.personalBests.highestScore.value) {
    this.personalBests.highestScore = {
      value: playerData.score,
      gameId: gameData._id,
      date: gameData.endTime
    };
  }
  
  if (playerData.playtime > this.personalBests.longestSession.value) {
    this.personalBests.longestSession = {
      value: playerData.playtime,
      gameId: gameData._id,
      date: gameData.endTime
    };
  }
  
  // Update recent performance history (keep last 10)
  this.recentPerformance.unshift({
    gameId: gameData._id,
    sessionId: gameData.sessionId,
    gameMode: gameData.gameMode,
    date: gameData.endTime,
    score: playerData.score,
    kills: playerData.kills,
    deaths: playerData.deaths,
    position: playerData.position,
    aircraft: playerData.aircraft
  });
  
  // Trim to last 10 games
  if (this.recentPerformance.length > 10) {
    this.recentPerformance = this.recentPerformance.slice(0, 10);
  }
  
  return this.save();
};

/**
 * Add achievement to player stats
 * @param {Object} achievement - Achievement data
 * @returns {Promise<PlayerStats>} Updated stats
 */
PlayerStatsSchema.methods.addAchievement = async function(achievement) {
  // Check if achievement already exists
  const exists = this.achievements.some(a => a.id === achievement.id);
  if (exists) return this;
  
  // Add achievement
  this.achievements.push({
    id: achievement.id,
    name: achievement.name,
    description: achievement.description,
    unlockedAt: Date.now()
  });
  
  // Update count
  this.achievementsUnlocked += 1;
  
  // Add experience for achievement
  this.experience += achievement.experienceReward || 100;
  
  // Update level based on experience
  this._updateLevel();
  
  return this.save();
};

/**
 * Update player level based on experience
 * @private
 */
PlayerStatsSchema.methods._updateLevel = function() {
  // Simple level formula: level = 1 + sqrt(experience / 100)
  // Level 2 = 100 XP, Level 3 = 400 XP, Level 4 = 900 XP, etc.
  this.level = Math.floor(1 + Math.sqrt(this.experience / 100));
};

/**
 * Add badge to player stats
 * @param {Object} badge - Badge data
 * @returns {Promise<PlayerStats>} Updated stats
 */
PlayerStatsSchema.methods.addBadge = async function(badge) {
  // Check if badge already exists
  const exists = this.badges.some(b => b.id === badge.id);
  if (exists) return this;
  
  // Add badge
  this.badges.push({
    id: badge.id,
    name: badge.name,
    description: badge.description,
    icon: badge.icon,
    rarity: badge.rarity,
    earnedAt: Date.now()
  });
  
  return this.save();
};

/**
 * Reset player statistics
 * @returns {Promise<PlayerStats>} Updated stats
 */
PlayerStatsSchema.methods.resetStats = async function() {
  this.rank = 0;
  this.level = 1;
  this.experience = 0;
  this.totalGames = 0;
  this.gamesWon = 0;
  this.gamesLost = 0;
  this.winRate = 0;
  this.totalKills = 0;
  this.totalDeaths = 0;
  this.killDeathRatio = 0;
  this.totalAssists = 0;
  this.highestKillStreak = 0;
  this.accuracy = 0;
  this.totalShots = 0;
  this.shotsHit = 0;
  this.totalPlaytime = 0;
  this.tokensEarned = 0;
  this.averageScore = 0;
  this.totalScore = 0;
  this.achievementsUnlocked = 0;
  this.achievements = [];
  this.favoriteAircraft = 'fighter';
  this.aircraftStats = {
    fighter: { gamesPlayed: 0, kills: 0, deaths: 0, playtime: 0, wins: 0 },
    bomber: { gamesPlayed: 0, kills: 0, deaths: 0, playtime: 0, wins: 0 },
    light: { gamesPlayed: 0, kills: 0, deaths: 0, playtime: 0, wins: 0 }
  };
  this.weaponStats = {
    primary: { shots: 0, hits: 0, kills: 0, accuracy: 0 },
    missile: { shots: 0, hits: 0, kills: 0, accuracy: 0 },
    bomb: { shots: 0, hits: 0, kills: 0, accuracy: 0 }
  };
  this.gameModeStats = {
    deathmatch: { gamesPlayed: 0, wins: 0, kills: 0, deaths: 0, bestScore: 0 },
    team_deathmatch: { gamesPlayed: 0, wins: 0, kills: 0, deaths: 0, bestScore: 0 },
    race: { gamesPlayed: 0, wins: 0, bestTime: 0, fastestLap: 0 }
  };
  this.recentPerformance = [];
  this.badges = [];
  this.personalBests = {
    highestKills: { value: 0, gameId: null, date: null },
    highestScore: { value: 0, gameId: null, date: null },
    longestSession: { value: 0, gameId: null, date: null },
    fastestRace: { value: 0, gameId: null, date: null }
  };

  return this.save();
};

/**
 * Find players by rank range
 * @param {number} startRank - Starting rank (inclusive)
 * @param {number} endRank - Ending rank (inclusive)
 * @returns {Promise<PlayerStats[]>} Player stats
 */
PlayerStatsSchema.statics.findByRankRange = function(startRank, endRank) {
  return this.find({
    rank: { $gte: startRank, $lte: endRank }
  })
  .sort({ rank: 1 })
  .populate('user', 'username profilePicture');
};

/**
 * Get top players
 * @param {number} limit - Number of players to return
 * @returns {Promise<PlayerStats[]>} Top players
 */
PlayerStatsSchema.statics.getTopPlayers = function(limit = 100) {
  return this.find()
    .sort({ rank: 1 })
    .limit(limit)
    .populate('user', 'username profilePicture');
};

/**
 * Update player rankings
 * @returns {Promise<number>} Number of players updated
 */
PlayerStatsSchema.statics.updateRankings = async function() {
  // Get all players sorted by score
  const players = await this.find()
    .sort({ totalScore: -1, killDeathRatio: -1 });
  
  // Update ranks
  let updatedCount = 0;
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const newRank = i + 1;
    
    if (player.rank !== newRank) {
      player.rank = newRank;
      await player.save();
      updatedCount++;
    }
  }
  
  return updatedCount;
};

/**
 * Find stats by user ID
 * @param {ObjectId} userId - User ID
 * @returns {Promise<PlayerStats>} Player stats
 */
PlayerStatsSchema.statics.findByUserId = function(userId) {
  return this.findOne({ user: userId })
    .populate('user', 'username profilePicture');
};

/**
 * Get player statistics by gamemode
 * @param {string} gameMode - Game mode
 * @param {number} limit - Number of players to return
 * @returns {Promise<PlayerStats[]>} Player stats
 */
PlayerStatsSchema.statics.getTopPlayersByGameMode = function(gameMode, limit = 100) {
  // Validate game mode
  const validModes = ['deathmatch', 'team_deathmatch', 'race'];
  if (!validModes.includes(gameMode)) {
    throw new Error('Invalid game mode');
  }
  
  // Sort by the appropriate field
  let sortField = {};
  
  if (gameMode === 'race') {
    // For race, sort by best time (lower is better)
    sortField = { 'gameModeStats.race.bestTime': 1 };
    
    // Only include players who have played races
    return this.find({
      'gameModeStats.race.gamesPlayed': { $gt: 0 },
      'gameModeStats.race.bestTime': { $gt: 0 }
    })
    .sort(sortField)
    .limit(limit)
    .populate('user', 'username profilePicture');
  } else {
    // For other modes, sort by win rate
    return this.aggregate([
      {
        $match: {
          [`gameModeStats.${gameMode}.gamesPlayed`]: { $gt: 5 } // Minimum games threshold
        }
      },
      {
        $addFields: {
          winRate: {
            $cond: [
              { $gt: [`$gameModeStats.${gameMode}.gamesPlayed`, 0] },
              { $multiply: [
                { $divide: [`$gameModeStats.${gameMode}.wins`, `$gameModeStats.${gameMode}.gamesPlayed`] },
                100
              ]},
              0
            ]
          },
          username: '$username',
          userId: '$user'
        }
      },
      {
        $sort: { winRate: -1, [`gameModeStats.${gameMode}.kills`]: -1 }
      },
      {
        $limit: limit
      }
    ]);
  }
};

/**
 * Create or update player stats
 * @param {ObjectId} userId - User ID
 * @param {string} username - Username
 * @returns {Promise<PlayerStats>} Player stats
 */
PlayerStatsSchema.statics.createOrUpdate = async function(userId, username) {
  let stats = await this.findOne({ user: userId });
  
  if (!stats) {
    stats = new this({
      user: userId,
      username: username
    });
    
    await stats.save();
  } else if (stats.username !== username) {
    stats.username = username;
    await stats.save();
  }
  
  return stats;
};

// Create model
const PlayerStats = mongoose.model('PlayerStats', PlayerStatsSchema);

module.exports = PlayerStats;