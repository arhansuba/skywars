/**
 * Game Session Controller
 *
 * Handles operations related to game sessions, including creation, joining,
 * listing, and retrieving details.
 *
 * @module controllers/gameSessionController
 */

const GameSession = require('../models/GameSession');
const User = require('../models/User');
const PlayerStats = require('../models/PlayerStats');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

/**
 * Get all active game sessions
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getActiveSessions = async (req, res) => {
  try {
    const sessions = await GameSession.findActiveSessions();
    
    res.json({
      sessions: sessions.map(session => ({
        id: session._id,
        sessionId: session.sessionId,
        gameMode: session.gameMode,
        environment: session.environment,
        status: session.status,
        startTime: session.startTime,
        participantCount: session.participants.length,
        maxPlayers: session.maxPlayers,
        hostServer: session.hostServer
      }))
    });
  } catch (error) {
    console.error('Get active sessions error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving active sessions' 
    });
  }
};

/**
 * Get user's recent sessions
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getUserSessions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10, offset = 0 } = req.query;
    
    // Get sessions
    const sessions = await GameSession.find({
      'participants.user': mongoose.Types.ObjectId(userId)
    })
    .sort({ startTime: -1 })
    .skip(parseInt(offset))
    .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await GameSession.countDocuments({
      'participants.user': mongoose.Types.ObjectId(userId)
    });
    
    // Format sessions with user-specific data
    const formattedSessions = sessions.map(session => {
      const participant = session.participants.find(
        p => p.user.toString() === userId
      );
      
      return {
        id: session._id,
        sessionId: session.sessionId,
        gameMode: session.gameMode,
        environment: session.environment,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.duration,
        participantCount: session.participants.length,
        userStats: participant ? {
          score: participant.score,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
          position: p.position,
      tokensEarned: p.tokensEarned,
      playtime: p.playtime,
      aircraft: p.aircraft,
      isAI: p.isAI,
      joinTime: p.joinTime,
      leaveTime: p.leaveTime
    }));
    
    // Format events (limit to important ones for detail view)
    const filteredEvents = session.events
      .filter(e => ['kill', 'token_reward', 'achievement'].includes(e.type))
      .map(e => ({
        id: e._id,
        type: e.type,
        timestamp: e.timestamp,
        playerId: e.playerId,
        targetId: e.targetId,
        message: e.message,
        details: e.details
      }));
    
    res.json({
      session: {
        id: session._id,
        sessionId: session.sessionId,
        gameMode: session.gameMode,
        environment: session.environment,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.duration,
        settings: session.settings,
        participants,
        teams: session.teams,
        events: filteredEvents,
        leaderboard: session.leaderboard,
        weatherEvents: session.weatherEvents,
        hostServer: session.hostServer,
        version: session.version
      }
    });
  } catch (error) {
    console.error('Get session details error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving session details' 
    });
  }
};

/**
 * Create new game session
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.createSession = async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { 
      gameMode, 
      environment, 
      maxPlayers, 
      settings,
      hostServer
    } = req.body;
    
    // Generate session ID
    const sessionId = `${gameMode}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    
    // Create new session
    const session = new GameSession({
      sessionId,
      gameMode,
      environment,
      maxPlayers: maxPlayers || 32,
      settings,
      hostServer: hostServer || 'main',
      status: 'waiting'
    });
    
    // Save session
    await session.save();
    
    res.status(201).json({
      message: 'Game session created successfully',
      session: {
        id: session._id,
        sessionId: session.sessionId,
        gameMode: session.gameMode,
        environment: session.environment,
        status: session.status,
        startTime: session.startTime,
        maxPlayers: session.maxPlayers,
        settings: session.settings,
        hostServer: session.hostServer
      }
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ 
      error: 'Server error while creating session' 
    });
  }
};

/**
 * Join game session
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.joinSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const { playerId, username, aircraft, team } = req.body;
    
    // Find session
    const session = await GameSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ 
        error: 'Session not found' 
      });
    }
    
    // Check if session is joinable
    if (session.status !== 'waiting' && session.status !== 'running') {
      return res.status(400).json({ 
        error: 'Session is not joinable' 
      });
    }
    
    // Check if session is full
    if (session.participants.length >= session.maxPlayers) {
      return res.status(400).json({ 
        error: 'Session is full' 
      });
    }
    
    // Check if user is already in session
    const existingParticipant = session.participants.find(
      p => p.user && p.user.toString() === userId
    );
    
    if (existingParticipant) {
      return res.status(400).json({ 
        error: 'User is already in this session' 
      });
    }
    
    // Get user for username
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    
    // Add user to session
    session.participants.push({
      user: userId,
      playerId: playerId || `player-${Math.random().toString(36).substring(2, 10)}`,
      username: username || user.username,
      team: team || null,
      joinTime: Date.now(),
      aircraft: aircraft || 'fighter'
    });
    
    // Add join event
    session.events.push({
      type: 'join',
      playerId: playerId,
      timestamp: Date.now(),
      message: `${username || user.username} joined the game`
    });
    
    // Save session
    await session.save();
    
    res.json({
      message: 'Joined session successfully',
      session: {
        id: session._id,
        sessionId: session.sessionId,
        gameMode: session.gameMode,
        environment: session.environment,
        status: session.status
      }
    });
  } catch (error) {
    console.error('Join session error:', error);
    res.status(500).json({ 
      error: 'Server error while joining session' 
    });
  }
};

/**
 * Leave game session
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.leaveSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    
    // Find session
    const session = await GameSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ 
        error: 'Session not found' 
      });
    }
    
    // Find participant
    const participantIndex = session.participants.findIndex(
      p => p.user && p.user.toString() === userId
    );
    
    if (participantIndex === -1) {
      return res.status(400).json({ 
        error: 'User is not in this session' 
      });
    }
    
    // Update leave time
    session.participants[participantIndex].leaveTime = Date.now();
    
    // Calculate playtime
    const joinTime = session.participants[participantIndex].joinTime;
    session.participants[participantIndex].playtime = 
      Date.now() - joinTime;
    
    // Add leave event
    session.events.push({
      type: 'leave',
      playerId: session.participants[participantIndex].playerId,
      timestamp: Date.now(),
      message: `${session.participants[participantIndex].username} left the game`
    });
    
    // Save session
    await session.save();
    
    res.json({
      message: 'Left session successfully'
    });
  } catch (error) {
    console.error('Leave session error:', error);
    res.status(500).json({ 
      error: 'Server error while leaving session' 
    });
  }
};

/**
 * Start game session
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.startSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Find session
    const session = await GameSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ 
        error: 'Session not found' 
      });
    }
    
    // Check if user is admin or session host
    if (req.user.role !== 'admin') {
      // Implement host check logic if needed
    }
    
    // Check if session can be started
    if (session.status !== 'waiting') {
      return res.status(400).json({ 
        error: 'Session is not in waiting status' 
      });
    }
    
    // Start session
    session.status = 'running';
    session.startTime = Date.now();
    
    // Save session
    await session.save();
    
    res.json({
      message: 'Session started successfully',
      startTime: session.startTime
    });
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({ 
      error: 'Server error while starting session' 
    });
  }
};

/**
 * End game session
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.endSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { leaderboard } = req.body;
    
    // Find session
    const session = await GameSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ 
        error: 'Session not found' 
      });
    }
    
    // Check if user is admin or session host
    if (req.user.role !== 'admin') {
      // Implement host check logic if needed
    }
    
    // Check if session can be ended
    if (session.status !== 'running') {
      return res.status(400).json({ 
        error: 'Session is not in running status' 
      });
    }
    
    // End session
    session.status = 'completed';
    session.endTime = Date.now();
    session.duration = session.endTime - session.startTime;
    
    // Update leaderboard if provided
    if (leaderboard) {
      session.leaderboard = leaderboard;
    }
    
    // Update participant stats
    for (const participant of session.participants) {
      // Skip AI players
      if (participant.isAI || !participant.user) continue;
      
      // Calculate playtime if still in game
      if (!participant.leaveTime) {
        participant.leaveTime = Date.now();
        participant.playtime = participant.leaveTime - participant.joinTime;
      }
      
      // Update player stats
      try {
        const stats = await PlayerStats.findOne({ user: participant.user });
        if (stats) {
          await stats.updateAfterGame({
            _id: session._id,
            sessionId: session.sessionId,
            gameMode: session.gameMode,
            startTime: session.startTime,
            endTime: session.endTime,
            duration: session.duration,
            teams: session.teams,
            participants: [participant]
          });
        }
      } catch (statError) {
        console.error('Error updating player stats:', statError);
      }
    }
    
    // Save session
    await session.save();
    
    res.json({
      message: 'Session ended successfully',
      endTime: session.endTime,
      duration: session.duration
    });
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ 
      error: 'Server error while ending session' 
    });
  }
};

/**
 * Add event to session
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.addSessionEvent = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { type, playerId, targetId, message, details } = req.body;
    
    // Find session
    const session = await GameSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ 
        error: 'Session not found' 
      });
    }
    
    // Check if session is active
    if (session.status !== 'running') {
      return res.status(400).json({ 
        error: 'Session is not active' 
      });
    }
    
    // Add event
    const event = {
      type,
      timestamp: Date.now(),
      playerId,
      targetId,
      message,
      details
    };
    
    session.events.push(event);
    
    // Handle special event types
    if (type === 'kill') {
      // Update killer stats
      const killerIndex = session.participants.findIndex(p => p.playerId === playerId);
      if (killerIndex !== -1) {
        session.participants[killerIndex].kills += 1;
        session.participants[killerIndex].score += details?.pointsAwarded || 100;
      }
      
      // Update victim stats
      const victimIndex = session.participants.findIndex(p => p.playerId === targetId);
      if (victimIndex !== -1) {
        session.participants[victimIndex].deaths += 1;
      }
    } else if (type === 'token_reward') {
      // Update token stats
      const playerIndex = session.participants.findIndex(p => p.playerId === playerId);
      if (playerIndex !== -1) {
        const tokenAmount = details?.amount || 0;
        session.participants[playerIndex].tokensEarned += tokenAmount;
        
        // Create transaction record if user has wallet
        if (session.participants[playerIndex].user && tokenAmount > 0) {
          try {
            const user = await User.findById(session.participants[playerIndex].user);
            if (user && user.walletAddress) {
              await Transaction.createTransaction({
                transactionId: `reward-${sessionId}-${playerId}-${Date.now()}`,
                type: 'reward',
                user: user._id,
                amount: tokenAmount,
                status: 'completed',
                gameSession: session._id,
                reason: details?.reason || 'Game reward',
                completedAt: Date.now(),
                walletAddress: user.walletAddress
              });
            }
          } catch (txError) {
            console.error('Error creating transaction record:', txError);
          }
        }
      }
    }
    
    // Save session
    await session.save();
    
    res.json({
      message: 'Event added successfully',
      event: {
        id: session.events[session.events.length - 1]._id,
        type,
        timestamp: event.timestamp,
        playerId,
        targetId,
        message
      }
    });
  } catch (error) {
    console.error('Add session event error:', error);
    res.status(500).json({ 
      error: 'Server error while adding event' 
    });
  }
};

/**
 * Update participant stats
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.updateParticipantStats = async (req, res) => {
  try {
    const { sessionId, playerId } = req.params;
    const { score, kills, deaths, assists, position } = req.body;
    
    // Find session
    const session = await GameSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ 
        error: 'Session not found' 
      });
    }
    
    // Find participant
    const participantIndex = session.participants.findIndex(
      p => p.playerId === playerId
    );
    
    if (participantIndex === -1) {
      return res.status(404).json({ 
        error: 'Participant not found' 
      });
    }
    
    // Update stats
    if (score !== undefined) session.participants[participantIndex].score = score;
    if (kills !== undefined) session.participants[participantIndex].kills = kills;
    if (deaths !== undefined) session.participants[participantIndex].deaths = deaths;
    if (assists !== undefined) session.participants[participantIndex].assists = assists;
    if (position !== undefined) session.participants[participantIndex].position = position;
    
    // Save session
    await session.save();
    
    res.json({
      message: 'Participant stats updated successfully',
      participant: {
        playerId,
        score: session.participants[participantIndex].score,
        kills: session.participants[participantIndex].kills,
        deaths: session.participants[participantIndex].deaths,
        assists: session.participants[participantIndex].assists,
        position: session.participants[participantIndex].position
      }
    });
  } catch (error) {
    console.error('Update participant stats error:', error);
    res.status(500).json({ 
      error: 'Server error while updating participant stats' 
    });
  }
};

/**
 * Update team scores
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.updateTeamScores = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { teams } = req.body;
    
    if (!teams || !Array.isArray(teams)) {
      return res.status(400).json({ 
        error: 'Teams data is required' 
      });
    }
    
    // Find session
    const session = await GameSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ 
        error: 'Session not found' 
      });
    }
    
    // Update teams
    for (const team of teams) {
      const teamIndex = session.teams.findIndex(t => t.id === team.id);
      
      if (teamIndex !== -1) {
        // Update existing team
        if (team.score !== undefined) session.teams[teamIndex].score = team.score;
        if (team.isWinner !== undefined) session.teams[teamIndex].isWinner = team.isWinner;
      } else {
        // Add new team
        session.teams.push({
          id: team.id,
          name: team.name || `Team ${team.id}`,
          color: team.color || '#FFFFFF',
          score: team.score || 0,
          isWinner: team.isWinner || false
        });
      }
    }
    
    // Save session
    await session.save();
    
    res.json({
      message: 'Team scores updated successfully',
      teams: session.teams
    });
  } catch (error) {
    console.error('Update team scores error:', error);
    res.status(500).json({ 
      error: 'Server error while updating team scores' 
    });
  }
};

/**
 * Get session stats
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getSessionStats = async (req, res) => {
  try {
    // Get total sessions
    const totalSessions = await GameSession.countDocuments();
    
    // Get completed sessions
    const completedSessions = await GameSession.countDocuments({ 
      status: 'completed' 
    });
    
    // Get active sessions
    const activeSessions = await GameSession.countDocuments({ 
      status: { $in: ['waiting', 'running'] } 
    });
    
    // Get player count
    const playerCount = await GameSession.aggregate([
      {
        $match: { status: { $in: ['waiting', 'running'] } }
      },
      {
        $project: {
          participantCount: { $size: '$participants' }
        }
      },
      {
        $group: {
          _id: null,
          totalPlayers: { $sum: '$participantCount' }
        }
      }
    ]);
    
    // Get game mode stats
    const gameModeStats = await GameSession.aggregate([
      {
        $group: {
          _id: '$gameMode',
          count: { $sum: 1 },
          avgDuration: { $avg: '$duration' }
        }
      }
    ]);
    
    res.json({
      stats: {
        totalSessions,
        completedSessions,
        activeSessions,
        currentPlayers: playerCount.length > 0 ? playerCount[0].totalPlayers : 0,
        gameModes: gameModeStats.map(mode => ({
          mode: mode._id,
          sessionCount: mode.count,
          avgDuration: mode.avgDuration
        }))
      }
    });
  } catch (error) {
    console.error('Get session stats error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving session stats' 
    });
  }
};

module.exports = exports;articipant.position,
          tokensEarned: participant.tokensEarned,
          aircraft: participant.aircraft,
          team: participant.team
        } : null,
        teams: session.teams
      };
    });
    
    res.json({
      sessions: formattedSessions,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get user sessions error:', error);
    res.status(500).json({ 
      error: 'Server error while retrieving user sessions' 
    });
  }
};

/**
 * Get session details
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object} JSON response
 */
exports.getSessionDetails = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Find session
    const session = await GameSession.findOne({ sessionId })
      .populate('participants.user', 'username profilePicture');
    
    if (!session) {
      return res.status(404).json({ 
        error: 'Session not found' 
      });
    }
    
    // Format participants
    const participants = session.participants.map(p => ({
      id: p._id,
      user: p.user ? {
        id: p.user._id,
        username: p.user.username,
        profilePicture: p.user.profilePicture
      } : null,
      playerId: p.playerId,
      username: p.username,
      team: p.team,
      score: p.score,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      position: p.position,
      tokensEarned: p.tokensEarned,
      aircraft: p.aircraft,
      joinTime: p.joinTime,
      leaveTime: p.leaveTime