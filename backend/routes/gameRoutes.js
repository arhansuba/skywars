/**
 * Game Routes for SkyWars
 * 
 * Handles game session management, matchmaking, game state, 
 * leaderboards, and statistics.
 */

const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const { authenticate } = require('../middleware/auth');
const { validateGameCreation } = require('../middleware/validation');
const rateLimiter = require('../middleware/rateLimiter');

/**
 * @route   POST /api/games
 * @desc    Create a new game session
 * @access  Private
 */
router.post('/', 
  authenticate,
  validateGameCreation,
  gameController.createGame
);

/**
 * @route   GET /api/games
 * @desc    Get available games with filtering options
 * @access  Private
 */
router.get('/', 
  authenticate,
  gameController.getAvailableGames
);

/**
 * @route   GET /api/games/:gameId
 * @desc    Get details for a specific game
 * @access  Private
 */
router.get('/:gameId', 
  authenticate,
  gameController.getGameById
);

/**
 * @route   POST /api/games/:gameId/join
 * @desc    Join an existing game
 * @access  Private
 */
router.post('/:gameId/join', 
  authenticate,
  gameController.joinGame
);

/**
 * @route   POST /api/games/:gameId/leave
 * @desc    Leave a game
 * @access  Private
 */
router.post('/:gameId/leave', 
  authenticate,
  gameController.leaveGame
);

/**
 * @route   POST /api/games/:gameId/start
 * @desc    Start a game (for game creator only)
 * @access  Private
 */
router.post('/:gameId/start', 
  authenticate,
  gameController.startGame
);

/**
 * @route   POST /api/games/:gameId/end
 * @desc    End a game (for game creator or admin only)
 * @access  Private
 */
router.post('/:gameId/end', 
  authenticate,
  gameController.endGame
);

/**
 * @route   GET /api/games/:gameId/state
 * @desc    Get current game state
 * @access  Private
 */
router.get('/:gameId/state', 
  authenticate,
  gameController.getGameState
);

/**
 * @route   GET /api/games/:gameId/players
 * @desc    Get players in a game
 * @access  Private
 */
router.get('/:gameId/players', 
  authenticate,
  gameController.getGamePlayers
);

/**
 * @route   POST /api/games/:gameId/invite
 * @desc    Invite a player to a game
 * @access  Private
 */
router.post('/:gameId/invite', 
  authenticate,
  gameController.invitePlayer
);

/**
 * @route   GET /api/games/invites
 * @desc    Get all game invites for the current user
 * @access  Private
 */
router.get('/invites', 
  authenticate,
  gameController.getInvites
);

/**
 * @route   POST /api/games/invites/:inviteId/accept
 * @desc    Accept a game invite
 * @access  Private
 */
router.post('/invites/:inviteId/accept', 
  authenticate,
  gameController.acceptInvite
);

/**
 * @route   POST /api/games/invites/:inviteId/decline
 * @desc    Decline a game invite
 * @access  Private
 */
router.post('/invites/:inviteId/decline', 
  authenticate,
  gameController.declineInvite
);

/**
 * @route   GET /api/games/history
 * @desc    Get game history for current user
 * @access  Private
 */
router.get('/history', 
  authenticate,
  gameController.getGameHistory
);

/**
 * @route   GET /api/games/:gameId/results
 * @desc    Get game results
 * @access  Private
 */
router.get('/:gameId/results', 
  authenticate,
  gameController.getGameResults
);

/**
 * @route   GET /api/games/maps
 * @desc    Get available game maps
 * @access  Private
 */
router.get('/maps', 
  authenticate,
  gameController.getMaps
);

/**
 * @route   GET /api/games/matchmaking
 * @desc    Quick join matchmaking
 * @access  Private
 */
router.get('/matchmaking', 
  authenticate,
  gameController.findMatch
);

/**
 * @route   GET /api/games/leaderboard
 * @desc    Get global leaderboard
 * @access  Public
 */
router.get('/leaderboard', 
  gameController.getLeaderboard
);

/**
 * @route   GET /api/games/leaderboard/friends
 * @desc    Get friends leaderboard
 * @access  Private
 */
router.get('/leaderboard/friends', 
  authenticate,
  gameController.getFriendsLeaderboard
);

/**
 * @route   GET /api/games/stats
 * @desc    Get current user's game statistics
 * @access  Private
 */
router.get('/stats', 
  authenticate,
  gameController.getUserStats
);

/**
 * @route   GET /api/games/stats/:userId
 * @desc    Get another user's game statistics
 * @access  Private
 */
router.get('/stats/:userId', 
  authenticate,
  gameController.getUserStats
);

/**
 * @route   POST /api/games/:gameId/report
 * @desc    Report a game issue or player
 * @access  Private
 */
router.post('/:gameId/report', 
  authenticate,
  rateLimiter('game-report', 5, 60 * 60), // 5 reports per hour
  gameController.reportIssue
);

module.exports = router;