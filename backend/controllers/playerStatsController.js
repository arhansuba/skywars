/**
 * Player Statistics Controller
 *
 * Handles operations related to player statistics, leaderboards,
 * achievements, and ranking.
 *
 * @module controllers/playerStatsController
 */

const PlayerStats = require('../models/PlayerStats');
const User = require('../models/User');
const GameSession = require('../models/GameSession');
const Leaderboard = require('../models/Leaderboard');
const mongoose = require('mongoose');

/**
 * Get user statistics
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getUserStats = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    
    // Check if user exists
    const user = await User.findById(userId).select('username profilePicture');
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    
    // Get player stats
    const stats = await PlayerStats.findByUserId(userId);
    if (!stats) {
      return res.status(404).json({ 
        error: 'Statistics not found for this user' 
      });
    }
    
    // Format response
    res.json({
      user: {
        id: user._id,
        username: user.username,
        profilePicture: user.profilePicture
      },
      stats: {
        rank: stats.rank,
        level: stats.level,
        experience: stats.experience,
        totalGames: stats.totalGames,
        gamesWon: stats.gamesWon,
        gamesLost: stats.gamesLost,
        winRate: stats.winRate,
        totalKills: stats.totalKills,
        totalDeaths: stats.totalDeaths,
        killDeathRatio: stats.killDeathRatio,
        totalAssists: stats.totalAssists,
        accuracy: stats.accuracy,
        totalPlaytime: stats.totalPlaytime,
        favoriteAircraft: stats.favoriteAircraft,
        achievementsUnlocked: stats.achievementsUnlocked,
        badges: stats.badges.map(badge => ({
          id: badge.id,
          name: badge.name,
          description: badge.description,
          icon: badge.icon,
          rarity: badge.rarity,
          earnedAt: badge.earnedAt
        })),
        recentPerformance: stats.recentPerformance,
        personalBests: stats.personalBests,
        aircraftStats: stats.aircraftStats,
        weaponStats: stats.weaponStats,
        gameModeStats: stats.gameModeStats
      }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving active leaderboards' 
    });
  }
};

/**
 * Get user ranking
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getUserRanking = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    
    // Get player stats
    const stats = await PlayerStats.findByUserId(userId);
    if (!stats) {
      return res.status(404).json({ 
        error: 'Statistics not found for this user' 
      });
    }
    
    // Get players around user's rank
    const range = 5; // Get 5 players above and below
    const rangeStart = Math.max(1, stats.rank - range);
    const rangeEnd = stats.rank + range;
    
    const playersAround = await PlayerStats.findByRankRange(rangeStart, rangeEnd);
    
    // Check positions in seasonal leaderboards
    const seasonalRankings = [];
    const activeLeaderboards = await Leaderboard.find({ 
      type: 'seasonal',
      isActive: true
    });
    
    for (const leaderboard of activeLeaderboards) {
      const entry = leaderboard.getUserEntry(userId);
      if (entry) {
        seasonalRankings.push({
          leaderboardId: leaderboard._id,
          type: leaderboard.type,
          gameMode: leaderboard.gameMode,
          season: leaderboard.season,
          rank: entry.rank,
          score: entry.score,
          totalEntries: leaderboard.entries.length
        });
      }
    }
    
    // Format response
    res.json({
      globalRank: stats.rank,
      totalPlayers: await PlayerStats.countDocuments(),
      playersAround: playersAround.map(player => ({
        rank: player.rank,
        user: player.user ? {
          id: player.user._id,
          username: player.user.username,
          profilePicture: player.user.profilePicture
        } : null,
        level: player.level,
        killDeathRatio: player.killDeathRatio,
        winRate: player.winRate,
        isCurrentUser: player.user && player.user._id.toString() === userId
      })),
      seasonalRankings
    });
  } catch (error) {
    console.error('Get user ranking error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving user ranking' 
    });
  }
};

/**
 * Get player statistics by game mode
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getStatsByGameMode = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    const { gameMode } = req.params;
    
    // Validate game mode
    const validModes = ['deathmatch', 'team_deathmatch', 'race'];
    if (!validModes.includes(gameMode)) {
      return res.status(400).json({ 
        error: 'Invalid game mode' 
      });
    }
    
    // Get player stats
    const stats = await PlayerStats.findByUserId(userId);
    if (!stats) {
      return res.status(404).json({ 
        error: 'Statistics not found for this user' 
      });
    }
    
    // Get game mode specific stats
    const gameModeStats = stats.gameModeStats[gameMode];
    
    // Get recent sessions for this game mode
    const recentSessions = await GameSession.find({
      'participants.user': mongoose.Types.ObjectId(userId),
      gameMode
    })
    .sort({ startTime: -1 })
    .limit(5);
    
    // Format response
    res.json({
      gameMode,
      stats: gameModeStats,
      recentSessions: recentSessions.map(session => {
        const participant = session.participants.find(
          p => p.user && p.user.toString() === userId
        );
        
        return {
          sessionId: session.sessionId,
          startTime: session.startTime,
          endTime: session.endTime,
          duration: session.duration,
          environment: session.environment,
          userStats: participant ? {
            score: participant.score,
            kills: participant.kills,
            deaths: participant.deaths,
            position: participant.position,
            aircraft: participant.aircraft
          } : null
        };
      })
    });
  } catch (error) {
    console.error('Get stats by game mode error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving game mode statistics' 
    });
  }
};

/**
 * Update rankings
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.updateRankings = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Not authorized to perform this action' 
      });
    }
    
    // Update all player rankings
    const updatedCount = await PlayerStats.updateRankings();
    
    res.json({
      message: 'Rankings updated successfully',
      updatedCount
    });
  } catch (error) {
    console.error('Update rankings error:', error);
    res.status(500).json({ 
      error: 'Server error while updating rankings' 
    });
  }
};

/**
 * Create achievement
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.createAchievement = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Not authorized to perform this action' 
      });
    }
    
    const { userId } = req.params;
    const { achievement } = req.body;
    
    if (!achievement || !achievement.id || !achievement.name) {
      return res.status(400).json({ 
        error: 'Achievement data is required' 
      });
    }
    
    // Get player stats
    const stats = await PlayerStats.findByUserId(userId);
    if (!stats) {
      return res.status(404).json({ 
        error: 'Statistics not found for this user' 
      });
    }
    
    // Add achievement
    await stats.addAchievement(achievement);
    
    res.json({
      message: 'Achievement added successfully',
      achievement: {
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        unlockedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Create achievement error:', error);
    res.status(500).json({ 
      error: 'Server error while creating achievement' 
    });
  }
};

/**
 * Get player progression
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getPlayerProgression = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    
    // Get player stats
    const stats = await PlayerStats.findByUserId(userId);
    if (!stats) {
      return res.status(404).json({ 
        error: 'Statistics not found for this user' 
      });
    }
    
    // Get all sessions for this user
    const sessions = await GameSession.find({
      'participants.user': mongoose.Types.ObjectId(userId),
      status: 'completed'
    })
    .sort({ startTime: 1 });
    
    // Calculate progression metrics
    const progressionData = {
      xp: [],
      kd: [],
      winRate: [],
      accuracy: []
    };
    
    // Calculate running stats
    let runningKills = 0;
    let runningDeaths = 0;
    let runningWins = 0;
    let runningGames = 0;
    let runningShotsHit = 0;
    let runningShotsFired = 0;
    
    for (const session of sessions) {
      const participant = session.participants.find(
        p => p.user && p.user.toString() === userId
      );
      
      if (!participant) continue;
      
      // Update running stats
      runningGames++;
      runningKills += participant.kills || 0;
      runningDeaths += participant.deaths || 0;
      
      // Calculate if player was winner
      let isWinner = false;
      
      if (session.gameMode === 'team_deathmatch' && participant.team) {
        // Team mode - check if team won
        const team = session.teams.find(t => t.id === participant.team);
        isWinner = team && team.isWinner;
      } else {
        // Individual mode - check position
        isWinner = participant.position === 1;
      }
      
      if (isWinner) {
        runningWins++;
      }
      
      // Assume each kill has X shots fired and Y shots hit (simplified)
      // In a real implementation, this would be tracked properly
      const shotsFired = participant.kills * 5;
      const shotsHit = participant.kills * 2;
      
      runningShotsFired += shotsFired;
      runningShotsHit += shotsHit;
      
      // Calculate stats
      const kdRatio = runningDeaths > 0 ? runningKills / runningDeaths : runningKills;
      const winRate = runningGames > 0 ? (runningWins / runningGames) * 100 : 0;
      const accuracy = runningShotsFired > 0 ? (runningShotsHit / runningShotsFired) * 100 : 0;
      
      // Add data point
      progressionData.kd.push({
        date: session.endTime,
        value: kdRatio
      });
      
      progressionData.winRate.push({
        date: session.endTime,
        value: winRate
      });
      
      progressionData.accuracy.push({
        date: session.endTime,
        value: accuracy
      });
    }
    
    // Format response
    res.json({
      currentLevel: stats.level,
      currentXP: stats.experience,
      xpToNextLevel: (stats.level + 1) * (stats.level + 1) * 100 - stats.experience,
      progression: progressionData,
      totalProgressionGames: runningGames
    });
  } catch (error) {
    console.error('Get player progression error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving player progression' 
    });
  }
};

/**
 * Get aircraft stats
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getAircraftStats = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    const { aircraft } = req.params;
    
    // Validate aircraft type
    const validTypes = ['fighter', 'bomber', 'light'];
    if (!validTypes.includes(aircraft)) {
      return res.status(400).json({ 
        error: 'Invalid aircraft type' 
      });
    }
    
    // Get player stats
    const stats = await PlayerStats.findByUserId(userId);
    if (!stats) {
      return res.status(404).json({ 
        error: 'Statistics not found for this user' 
      });
    }
    
    // Get aircraft specific stats
    const aircraftStats = stats.aircraftStats[aircraft];
    
    // Get recent sessions with this aircraft
    const recentSessions = await GameSession.find({
      'participants.user': mongoose.Types.ObjectId(userId),
      'participants.aircraft': aircraft
    })
    .sort({ startTime: -1 })
    .limit(5);
    
    res.json({
      aircraft,
      stats: aircraftStats,
      recentSessions: recentSessions.map(session => {
        const participant = session.participants.find(
          p => p.user && p.user.toString() === userId && p.aircraft === aircraft
        );
        
        return {
          sessionId: session.sessionId,
          gameMode: session.gameMode,
          startTime: session.startTime,
          endTime: session.endTime,
          duration: session.duration,
          environment: session.environment,
          userStats: participant ? {
            score: participant.score,
            kills: participant.kills,
            deaths: participant.deaths,
            position: participant.position
          } : null
        };
      })
    });
  } catch (error) {
    console.error('Get aircraft stats error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving aircraft statistics' 
    });
  }
};

/**
 * Get global statistics
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getGlobalStats = async (req, res) => {
  try {
    // Get total player count
    const totalPlayers = await PlayerStats.countDocuments();
    
    // Get total games played
    const totalGames = await GameSession.countDocuments({ 
      status: 'completed' 
    });
    
    // Get average K/D
    const kdStats = await PlayerStats.aggregate([
      {
        $group: {
          _id: null,
          avgKD: { $avg: '$killDeathRatio' },
          avgWinRate: { $avg: '$winRate' },
          avgAccuracy: { $avg: '$accuracy' },
          totalKills: { $sum: '$totalKills' },
          totalDeaths: { $sum: '$totalDeaths' },
          totalPlaytime: { $sum: '$totalPlaytime' }
        }
      }
    ]);
    
    // Get aircraft usage stats
    const aircraftStats = await PlayerStats.aggregate([
      {
        $group: {
          _id: '$favoriteAircraft',
          count: { $sum: 1 },
          totalKills: { $sum: '$totalKills' },
          avgKD: { $avg: '$killDeathRatio' }
        }
      }
    ]);
    
    // Format response
    res.json({
      playerStats: {
        totalPlayers,
        averageLevel: kdStats.length > 0 ? await PlayerStats.aggregate([
          { $group: { _id: null, avg: { $avg: '$level' } } }
        ]).then(res => res[0]?.avg || 0) : 0,
        averageKD: kdStats.length > 0 ? kdStats[0].avgKD : 0,
        averageWinRate: kdStats.length > 0 ? kdStats[0].avgWinRate : 0,
        averageAccuracy: kdStats.length > 0 ? kdStats[0].avgAccuracy : 0
      },
      gameStats: {
        totalGames,
        totalKills: kdStats.length > 0 ? kdStats[0].totalKills : 0,
        totalDeaths: kdStats.length > 0 ? kdStats[0].totalDeaths : 0,
        totalPlaytime: kdStats.length > 0 ? kdStats[0].totalPlaytime : 0
      },
      aircraftStats: aircraftStats.map(stat => ({
        type: stat._id,
        popularity: (stat.count / totalPlayers) * 100,
        killContribution: kdStats.length > 0 ? (stat.totalKills / kdStats[0].totalKills) * 100 : 0,
        averageKD: stat.avgKD
      }))
    });
  } catch (error) {
    console.error('Get global stats error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving global statistics' 
    });
  }
};

module.exports = exports;ing user statistics' 
    });
  }
};

/**
 * Get user achievements
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getUserAchievements = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    
    // Get player stats
    const stats = await PlayerStats.findByUserId(userId);
    if (!stats) {
      return res.status(404).json({ 
        error: 'Statistics not found for this user' 
      });
    }
    
    // Format response
    res.json({
      achievements: stats.achievements.map(achievement => ({
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        unlockedAt: achievement.unlockedAt
      })),
      achievementsUnlocked: stats.achievementsUnlocked
    });
  } catch (error) {
    console.error('Get user achievements error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving user achievements' 
    });
  }
};

/**
 * Get global leaderboard
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getGlobalLeaderboard = async (req, res) => {
  try {
    const { limit = 100, offset = 0, gameMode } = req.query;
    
    // Build query based on game mode
    let query = {};
    let sort = { rank: 1 };
    
    // Get leaderboard
    let leaderboard;
    
    if (gameMode) {
      // Get specific game mode leaderboard
      leaderboard = await PlayerStats.getTopPlayersByGameMode(
        gameMode, 
        parseInt(limit)
      );
    } else {
      // Get overall leaderboard
      leaderboard = await PlayerStats.find(query)
        .sort(sort)
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .populate('user', 'username profilePicture');
    }
    
    // Format response
    const formattedLeaderboard = Array.isArray(leaderboard) ? 
      leaderboard.map((player, index) => ({
        rank: player.rank || index + 1 + parseInt(offset),
        user: player.user ? {
          id: player.user._id,
          username: player.user.username,
          profilePicture: player.user.profilePicture
        } : {
          id: player.userId || player._id,
          username: player.username
        },
        level: player.level,
        totalGames: player.totalGames,
        gamesWon: player.gamesWon,
        winRate: player.winRate,
        killDeathRatio: player.killDeathRatio,
        accuracy: player.accuracy,
        favoriteAircraft: player.favoriteAircraft
      })) : [];
    
    // Get total count for pagination
    const total = await PlayerStats.countDocuments(query);
    
    res.json({
      leaderboard: formattedLeaderboard,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get global leaderboard error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving global leaderboard' 
    });
  }
};

/**
 * Get seasonal leaderboard
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getSeasonalLeaderboard = async (req, res) => {
  try {
    const { gameMode = 'all', season } = req.query;
    
    // Find leaderboard
    let leaderboard;
    
    if (season) {
      // Find specific season
      leaderboard = await Leaderboard.findOne({
        type: 'seasonal',
        gameMode,
        season: parseInt(season)
      });
    } else {
      // Find current season
      leaderboard = await Leaderboard.findCurrentSeasonal(gameMode);
    }
    
    if (!leaderboard) {
      return res.status(404).json({ 
        error: 'Leaderboard not found' 
      });
    }
    
    // Get user's entry if authenticated
    let userEntry = null;
    if (req.user && req.user.id) {
      userEntry = leaderboard.getUserEntry(req.user.id);
    }
    
    // Format response
    res.json({
      leaderboard: {
        id: leaderboard._id,
        type: leaderboard.type,
        gameMode: leaderboard.gameMode,
        season: leaderboard.season,
        startDate: leaderboard.startDate,
        endDate: leaderboard.endDate,
        isActive: leaderboard.isActive,
        entries: leaderboard.entries.slice(0, 100), // Limit to top 100
        rewards: leaderboard.rewards,
        lastUpdated: leaderboard.lastUpdated
      },
      userEntry
    });
  } catch (error) {
    console.error('Get seasonal leaderboard error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving seasonal leaderboard' 
    });
  }
};

/**
 * Get active leaderboards
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getActiveLeaderboards = async (req, res) => {
  try {
    // Get all active leaderboards
    const leaderboards = await Leaderboard.findActive();
    
    // Format response
    res.json({
      leaderboards: leaderboards.map(leaderboard => ({
        id: leaderboard._id,
        type: leaderboard.type,
        gameMode: leaderboard.gameMode,
        season: leaderboard.season,
        startDate: leaderboard.startDate,
        endDate: leaderboard.endDate,
        entryCount: leaderboard.entries.length,
        rewards: leaderboard.rewards,
        lastUpdated: leaderboard.lastUpdated
      }))
    });
  } catch (error) {
    console.error('Get active leaderboards error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving active leaderboards'
    });
  }
}