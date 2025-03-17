/**
 * Game Service for SkyWars
 * 
 * Provides business logic for game state management, game sessions,
 * matchmaking, and game progression.
 */

const GameSession = require('../models/GameSession');
const User = require('../models/User');
const logger = require('../utils/logger');
const { ObjectId } = require('mongoose').Types;
const tokenService = require('./tokenService');

// In-memory cache for active game states
const activeGames = new Map();

// Default game settings
const DEFAULT_GAME_SETTINGS = {
  maxPlayers: 10,
  minPlayers: 2,
  timeLimit: 15 * 60, // 15 minutes in seconds
  allowReconnection: true,
  reconnectionTimeoutSeconds: 60,
  respawnEnabled: true,
  respawnTimeSeconds: 5,
  startDelay: 10, // seconds to wait after min players joined
  endDelay: 10, // seconds to wait after game end condition met
  victoryCondition: 'last_standing', // 'last_standing', 'score_limit', 'time_limit'
  scoreLimit: 1000,
  teamMode: false,
  friendlyFire: false,
};

// Game maps configuration
const GAME_MAPS = {
  'canyon': {
    name: 'Canyon Run',
    description: 'Narrow canyons with high walls, perfect for dogfights',
    terrain: 'mountains',
    weather: 'clear',
    spawnPoints: [
      { x: 100, y: 250, z: 100 },
      { x: -100, y: 250, z: -100 },
      { x: 100, y: 250, z: -100 },
      { x: -100, y: 250, z: 100 },
      { x: 0, y: 300, z: 0 },
    ],
    boundaries: {
      minX: -2000, maxX: 2000,
      minY: 0, maxY: 1000,
      minZ: -2000, maxZ: 2000
    }
  },
  'ocean': {
    name: 'Ocean Theater',
    description: 'Open skies over a vast ocean with aircraft carriers',
    terrain: 'water',
    weather: 'cloudy',
    spawnPoints: [
      { x: 500, y: 200, z: 500 },
      { x: -500, y: 200, z: -500 },
      { x: 500, y: 200, z: -500 },
      { x: -500, y: 200, z: 500 },
      { x: 0, y: 300, z: 0 },
    ],
    boundaries: {
      minX: -5000, maxX: 5000,
      minY: 0, maxY: 1500,
      minZ: -5000, maxZ: 5000
    }
  },
  'city': {
    name: 'City Streets',
    description: 'Urban combat between skyscrapers',
    terrain: 'urban',
    weather: 'night',
    spawnPoints: [
      { x: 300, y: 150, z: 300 },
      { x: -300, y: 150, z: -300 },
      { x: 300, y: 150, z: -300 },
      { x: -300, y: 150, z: 300 },
      { x: 0, y: 250, z: 0 },
    ],
    boundaries: {
      minX: -1500, maxX: 1500,
      minY: 0, maxY: 800,
      minZ: -1500, maxZ: 1500
    }
  }
};

/**
 * Create a new game session
 * @param {Object} options - Game creation options
 * @param {string} options.createdBy - User ID of the creator
 * @param {string} options.name - Game session name
 * @param {string} options.mapId - Map ID
 * @param {Object} options.settings - Custom game settings
 * @returns {Promise<Object>} Created game session
 */
const createGame = async (options) => {
  try {
    // Validate options
    if (!options.createdBy) {
      throw new Error('Creator ID is required');
    }
    
    // Find creator user
    const creator = await User.findById(options.createdBy);
    if (!creator) {
      throw new Error('Creator not found');
    }
    
    // Get map configuration
    const mapId = options.mapId || 'canyon'; // Default to canyon map
    const mapConfig = GAME_MAPS[mapId];
    
    if (!mapConfig) {
      throw new Error(`Invalid map ID: ${mapId}`);
    }
    
    // Merge default settings with custom settings
    const settings = {
      ...DEFAULT_GAME_SETTINGS,
      ...(options.settings || {})
    };
    
    // Create game session
    const gameSession = new GameSession({
      name: options.name || `${creator.username}'s Game`,
      createdBy: options.createdBy,
      status: 'waiting', // waiting, in_progress, ending, ended
      map: mapId,
      mapDetails: mapConfig,
      settings,
      players: [{
        userId: options.createdBy,
        username: creator.username,
        status: 'active',
        joinedAt: new Date(),
        aircraft: options.aircraft || 'default',
        score: 0,
        kills: 0,
        deaths: 0
      }],
      activePlayers: [options.createdBy],
      createdAt: new Date()
    });
    
    // Save to database
    await gameSession.save();
    
    // Initialize in-memory game state
    initializeGameState(gameSession._id.toString(), mapConfig);
    
    logger.info(`Game created: ${gameSession.name} (${gameSession._id}) by ${creator.username}`);
    
    return gameSession;
  } catch (error) {
    logger.error(`Error creating game: ${error.message}`);
    throw error;
  }
};

/**
 * Initialize in-memory game state
 * @param {string} gameId - Game session ID
 * @param {Object} mapConfig - Map configuration
 */
const initializeGameState = (gameId, mapConfig) => {
  activeGames.set(gameId, {
    players: new Map(),
    projectiles: new Map(),
    lastUpdateTime: Date.now(),
    mapConfig
  });
  
  logger.debug(`Game state initialized: ${gameId}`);
};

/**
 * Get game session by ID
 * @param {string} gameId - Game session ID
 * @returns {Promise<Object>} Game session
 */
const getGameById = async (gameId) => {
  try {
    if (!gameId) {
      throw new Error('Game ID is required');
    }
    
    // Find game session
    const gameSession = await GameSession.findById(gameId);
    
    if (!gameSession) {
      throw new Error(`Game session not found: ${gameId}`);
    }
    
    return gameSession;
  } catch (error) {
    logger.error(`Error getting game: ${error.message}`);
    throw error;
  }
};

/**
 * Find active games with available slots
 * @param {Object} filter - Filter options
 * @param {number} limit - Maximum results to return
 * @returns {Promise<Array>} Array of game sessions
 */
const findAvailableGames = async (filter = {}, limit = 10) => {
  try {
    const query = {
      status: { $in: ['waiting', 'in_progress'] },
      'settings.allowJoinInProgress': true
    };
    
    // Add custom filters
    if (filter.mapId) {
      query.map = filter.mapId;
    }
    
    if (filter.minPlayers) {
      query['activePlayers.0'] = { $exists: true };
    }
    
    if (filter.excludeFull) {
      query.$expr = { $lt: [{ $size: '$players' }, '$settings.maxPlayers'] };
    }
    
    // Find games
    const games = await GameSession.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    
    // Add player count info
    return games.map(game => ({
      ...game,
      playerCount: game.activePlayers.length,
      isFull: game.activePlayers.length >= game.settings.maxPlayers
    }));
  } catch (error) {
    logger.error(`Error finding available games: ${error.message}`);
    throw error;
  }
};

/**
 * Get game state for a game session
 * @param {string} gameId - Game session ID
 * @returns {Promise<Object>} Complete game state
 */
const getGameState = async (gameId) => {
  try {
    if (!gameId) {
      throw new Error('Game ID is required');
    }
    
    // Get in-memory game state
    const gameState = activeGames.get(gameId);
    
    if (!gameState) {
      throw new Error(`Game state not found: ${gameId}`);
    }
    
    // Get game session from database for metadata
    const gameSession = await GameSession.findById(gameId);
    
    if (!gameSession) {
      throw new Error(`Game session not found: ${gameId}`);
    }
    
    // Format player states for response
    const players = {};
    gameState.players.forEach((state, playerId) => {
      players[playerId] = {
        position: state.position,
        rotation: state.rotation,
        velocity: state.velocity,
        health: state.health,
        fuel: state.fuel,
        shields: state.shieldActive,
        boostActive: state.boostActive,
        aircraft: state.aircraft
      };
    });
    
    // Format projectiles for response
    const projectiles = {};
    gameState.projectiles.forEach((proj, projId) => {
      projectiles[projId] = {
        id: projId,
        ownerId: proj.ownerId,
        position: proj.position,
        direction: proj.direction,
        speed: proj.speed,
        type: proj.type || 'bullet',
        createdAt: proj.createdAt
      };
    });
    
    // Build complete state object
    return {
      id: gameId,
      name: gameSession.name,
      status: gameSession.status,
      map: gameSession.map,
      settings: gameSession.settings,
      players,
      projectiles,
      stats: {
        startedAt: gameSession.startedAt,
        timeRemaining: gameSession.status === 'in_progress' ? 
          Math.max(0, (gameSession.settings.timeLimit * 1000) - (Date.now() - gameSession.startedAt)) / 1000 : 0,
        activePlayers: gameSession.activePlayers.length
      },
      timestamp: Date.now()
    };
  } catch (error) {
    logger.error(`Error getting game state: ${error.message}`);
    throw error;
  }
};

/**
 * Update game state with new data
 * @param {string} gameId - Game session ID
 * @param {Object} updates - State updates
 * @returns {Promise<Object>} Updated game state
 */
const updateGameState = async (gameId, updates) => {
  try {
    if (!gameId) {
      throw new Error('Game ID is required');
    }
    
    // Get in-memory game state
    const gameState = activeGames.get(gameId);
    
    if (!gameState) {
      throw new Error(`Game state not found: ${gameId}`);
    }
    
    // Update player states
    if (updates.players) {
      for (const [playerId, playerUpdates] of Object.entries(updates.players)) {
        if (!gameState.players.has(playerId)) {
          continue; // Skip players not in game
        }
        
        const playerState = gameState.players.get(playerId);
        
        // Apply updates
        Object.assign(playerState, playerUpdates);
      }
    }
    
    // Add new projectiles
    if (updates.newProjectiles && Array.isArray(updates.newProjectiles)) {
      for (const projectile of updates.newProjectiles) {
        if (!projectile.id || !projectile.ownerId) {
          continue; // Skip invalid projectiles
        }
        
        // Add to projectiles map
        gameState.projectiles.set(projectile.id, {
          ...projectile,
          createdAt: Date.now()
        });
      }
    }
    
    // Remove projectiles
    if (updates.removeProjectiles && Array.isArray(updates.removeProjectiles)) {
      for (const projectileId of updates.removeProjectiles) {
        gameState.projectiles.delete(projectileId);
      }
    }
    
    // Update last update time
    gameState.lastUpdateTime = Date.now();
    
    return getGameState(gameId);
  } catch (error) {
    logger.error(`Error updating game state: ${error.message}`);
    throw error;
  }
};

/**
 * Add player to game session
 * @param {string} gameId - Game session ID
 * @param {string} userId - User ID
 * @param {Object} options - Join options
 * @returns {Promise<Object>} Updated game session
 */
const addPlayerToGame = async (gameId, userId, options = {}) => {
  try {
    if (!gameId || !userId) {
      throw new Error('Game ID and User ID are required');
    }
    
    // Find game session
    const gameSession = await GameSession.findById(gameId);
    
    if (!gameSession) {
      throw new Error(`Game session not found: ${gameId}`);
    }
    
    // Check if game is joinable
    if (gameSession.status !== 'waiting' && gameSession.status !== 'in_progress') {
      throw new Error(`Game is not joinable (status: ${gameSession.status})`);
    }
    
    // Check if in-progress joining is allowed
    if (gameSession.status === 'in_progress' && !gameSession.settings.allowJoinInProgress) {
      throw new Error('Joining in-progress games is not allowed');
    }
    
    // Check if game is full
    if (gameSession.players.length >= gameSession.settings.maxPlayers) {
      throw new Error('Game is full');
    }
    
    // Find user
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    
    // Check if player is already in the game
    const existingPlayerIndex = gameSession.players.findIndex(p => p.userId.toString() === userId.toString());
    
    if (existingPlayerIndex !== -1) {
      const existingPlayer = gameSession.players[existingPlayerIndex];
      
      // Handle reconnection
      if (existingPlayer.status === 'disconnected' && existingPlayer.canReconnect) {
        // Check if reconnection period is valid
        if (existingPlayer.reconnectExpiry && new Date(existingPlayer.reconnectExpiry) > new Date()) {
          // Update player status
          gameSession.players[existingPlayerIndex].status = 'active';
          gameSession.players[existingPlayerIndex].canReconnect = false;
          gameSession.players[existingPlayerIndex].reconnectExpiry = null;
          gameSession.players[existingPlayerIndex].disconnectedAt = null;
          
          // Add back to active players if needed
          if (!gameSession.activePlayers.some(id => id.toString() === userId.toString())) {
            gameSession.activePlayers.push(userId);
          }
          
          await gameSession.save();
          
          logger.info(`Player ${user.username} reconnected to game ${gameId}`);
          return { gameSession, isReconnection: true };
        } else {
          throw new Error('Reconnection period expired');
        }
      } else if (existingPlayer.status === 'active') {
        throw new Error('Already connected to this game');
      } else if (existingPlayer.status === 'left') {
        // Allow rejoin if they previously left
        gameSession.players[existingPlayerIndex].status = 'active';
        gameSession.players[existingPlayerIndex].leftAt = null;
        gameSession.players[existingPlayerIndex].joinedAt = new Date();
        
        // Add to active players
        if (!gameSession.activePlayers.some(id => id.toString() === userId.toString())) {
          gameSession.activePlayers.push(userId);
        }
        
        await gameSession.save();
        
        logger.info(`Player ${user.username} rejoined game ${gameId}`);
        return { gameSession, isRejoin: true };
      }
    }
    
    // Add player to game
    gameSession.players.push({
      userId,
      username: user.username,
      status: 'active',
      joinedAt: new Date(),
      aircraft: options.aircraftId || 'default',
      score: 0,
      kills: 0,
      deaths: 0
    });
    
    // Add to active players
    gameSession.activePlayers.push(userId);
    
    // Save changes
    await gameSession.save();
    
    logger.info(`Player ${user.username} added to game ${gameId}`);
    
    // Check if game should start
    if (gameSession.status === 'waiting' && 
        gameSession.activePlayers.length >= gameSession.settings.minPlayers) {
      
      // If start delay is enabled, schedule start
      if (gameSession.settings.startDelay > 0) {
        setTimeout(async () => {
          try {
            // Reload game session to check if it's still waiting
            const currentGame = await GameSession.findById(gameId);
            
            if (currentGame && currentGame.status === 'waiting' && 
                currentGame.activePlayers.length >= currentGame.settings.minPlayers) {
              
              // Start the game
              await startGame(gameId);
            }
          } catch (error) {
            logger.error(`Error auto-starting game: ${error.message}`);
          }
        }, gameSession.settings.startDelay * 1000);
        
        logger.info(`Game ${gameId} scheduled to start in ${gameSession.settings.startDelay}s`);
      } else {
        // Start immediately
        await startGame(gameId);
      }
    }
    
    return { gameSession, isNew: true };
  } catch (error) {
    logger.error(`Error adding player to game: ${error.message}`);
    throw error;
  }
};

/**
 * Remove player from game session
 * @param {string} gameId - Game session ID
 * @param {string} userId - User ID
 * @param {string} reason - Reason for removal
 * @returns {Promise<Object>} Updated game session
 */
const removePlayerFromGame = async (gameId, userId, reason = 'left') => {
  try {
    if (!gameId || !userId) {
      throw new Error('Game ID and User ID are required');
    }
    
    // Find game session
    const gameSession = await GameSession.findById(gameId);
    
    if (!gameSession) {
      throw new Error(`Game session not found: ${gameId}`);
    }
    
    // Find player in the game
    const playerIndex = gameSession.players.findIndex(p => p.userId.toString() === userId.toString());
    
    if (playerIndex === -1) {
      throw new Error(`Player not found in game: ${userId}`);
    }
    
    // Update player status
    if (reason === 'disconnected' && gameSession.settings.allowReconnection) {
      // Mark as disconnected with reconnection possibility
      gameSession.players[playerIndex].status = 'disconnected';
      gameSession.players[playerIndex].disconnectedAt = new Date();
      gameSession.players[playerIndex].canReconnect = true;
      gameSession.players[playerIndex].reconnectExpiry = new Date(
        Date.now() + (gameSession.settings.reconnectionTimeoutSeconds * 1000)
      );
      
      logger.info(`Player ${gameSession.players[playerIndex].username} disconnected from game ${gameId} with reconnection window`);
    } else {
      // Mark as left
      gameSession.players[playerIndex].status = 'left';
      gameSession.players[playerIndex].leftAt = new Date();
      
      logger.info(`Player ${gameSession.players[playerIndex].username} left game ${gameId}`);
    }
    
    // Remove from active players
    gameSession.activePlayers = gameSession.activePlayers.filter(
      id => id.toString() !== userId.toString()
    );
    
    // Save changes
    await gameSession.save();
    
    // Check if game should end
    if (gameSession.activePlayers.length < gameSession.settings.minPlayers &&
        gameSession.status === 'in_progress') {
      
      // Set game to ending state
      gameSession.status = 'ending';
      gameSession.endReason = 'insufficient_players';
      
      // Schedule game end
      setTimeout(async () => {
        try {
          await endGame(gameId, 'insufficient_players');
        } catch (error) {
          logger.error(`Error ending game: ${error.message}`);
        }
      }, gameSession.settings.endDelay * 1000);
      
      await gameSession.save();
      
      logger.info(`Game ${gameId} ending in ${gameSession.settings.endDelay}s due to insufficient players`);
    }
    
    return gameSession;
  } catch (error) {
    logger.error(`Error removing player from game: ${error.message}`);
    throw error;
  }
};

/**
 * Start a game session
 * @param {string} gameId - Game session ID
 * @returns {Promise<Object>} Updated game session
 */
const startGame = async (gameId) => {
  try {
    if (!gameId) {
      throw new Error('Game ID is required');
    }
    
    // Find game session
    const gameSession = await GameSession.findById(gameId);
    
    if (!gameSession) {
      throw new Error(`Game session not found: ${gameId}`);
    }
    
    // Verify game is in 'waiting' status
    if (gameSession.status !== 'waiting') {
      throw new Error(`Game is not in waiting status: ${gameSession.status}`);
    }
    
    // Verify minimum players
    if (gameSession.activePlayers.length < gameSession.settings.minPlayers) {
      throw new Error(`Not enough players to start game: ${gameSession.activePlayers.length}/${gameSession.settings.minPlayers}`);
    }
    
    // Update game session
    gameSession.status = 'in_progress';
    gameSession.startedAt = new Date();
    
    // Set up game end by time limit if enabled
    if (gameSession.settings.timeLimit > 0) {
      const endTimeMs = gameSession.startedAt.getTime() + (gameSession.settings.timeLimit * 1000);
      
      // Schedule game end
      setTimeout(async () => {
        try {
          // Verify game is still in progress
          const currentGame = await GameSession.findById(gameId);
          
          if (currentGame && currentGame.status === 'in_progress') {
            await endGame(gameId, 'time_limit');
          }
        } catch (error) {
          logger.error(`Error ending game by time limit: ${error.message}`);
        }
      }, gameSession.settings.timeLimit * 1000);
      
      logger.info(`Game ${gameId} scheduled to end at ${new Date(endTimeMs).toISOString()}`);
    }
    
    // Save changes
    await gameSession.save();
    
    logger.info(`Game started: ${gameId}`);
    
    return gameSession;
  } catch (error) {
    logger.error(`Error starting game: ${error.message}`);
    throw error;
  }
};

/**
 * End a game session
 * @param {string} gameId - Game session ID
 * @param {string} reason - Reason for ending
 * @returns {Promise<Object>} Updated game session
 */
const endGame = async (gameId, reason = 'admin_action') => {
  try {
    if (!gameId) {
      throw new Error('Game ID is required');
    }
    
    // Find game session
    const gameSession = await GameSession.findById(gameId);
    
    if (!gameSession) {
      throw new Error(`Game session not found: ${gameId}`);
    }
    
    // Skip if already ended
    if (gameSession.status === 'ended') {
      return gameSession;
    }
    
    // Update game session
    gameSession.status = 'ended';
    gameSession.endedAt = new Date();
    gameSession.endReason = reason;
    
    // Calculate game duration
    if (gameSession.startedAt) {
      const duration = gameSession.endedAt - gameSession.startedAt;
      gameSession.durationSeconds = Math.floor(duration / 1000);
    }
    
    // Determine winner(s)
    const winners = determineWinners(gameSession);
    gameSession.winners = winners.map(w => w.userId);
    
    // Save changes
    await gameSession.save();
    
    // Award tokens to players
    await awardTokensToPlayers(gameSession);
    
    // Clean up in-memory game state
    activeGames.delete(gameId);
    
    logger.info(`Game ended: ${gameId}, Reason: ${reason}, Duration: ${gameSession.durationSeconds}s`);
    
    return gameSession;
  } catch (error) {
    logger.error(`Error ending game: ${error.message}`);
    throw error;
  }
};

/**
 * Determine winners from game session data
 * @param {Object} gameSession - Game session document
 * @returns {Array} Array of winner objects
 */
const determineWinners = (gameSession) => {
  // Different win conditions based on game mode
  switch (gameSession.settings.victoryCondition) {
    case 'last_standing':
      // Winner is the last player/team alive
      return gameSession.players
        .filter(p => p.status === 'active')
        .map(p => ({
          userId: p.userId,
          username: p.username,
          score: p.score,
          kills: p.kills
        }));
      
    case 'score_limit':
      // Winners are players who reached the score limit
      return gameSession.players
        .filter(p => p.score >= gameSession.settings.scoreLimit)
        .map(p => ({
          userId: p.userId,
          username: p.username,
          score: p.score,
          kills: p.kills
        }));
      
    case 'time_limit':
    default:
      // Winner is the player with the highest score
      // Sort players by score (descending)
      const sortedPlayers = [...gameSession.players].sort((a, b) => b.score - a.score);
      
      // Get top scorer(s)
      const topScore = sortedPlayers[0]?.score || 0;
      
      return sortedPlayers
        .filter(p => p.score === topScore)
        .map(p => ({
          userId: p.userId,
          username: p.username,
          score: p.score,
          kills: p.kills
        }));
  }
};

/**
 * Award tokens to players based on game performance
 * @param {Object} gameSession - Game session document
 */
const awardTokensToPlayers = async (gameSession) => {
  try {
    const { players, winners } = gameSession;
    
    // Award tokens to each player
    for (const player of players) {
      let tokenAmount = 0;
      
      // Skip players who never connected or joined
      if (player.status === 'invited') {
        continue;
      }
      
      // Base participation reward (even for disconnected players)
      tokenAmount += 10;
      
      // Kills reward (2 tokens per kill)
      tokenAmount += player.kills * 2;
      
      // Score-based reward (1 token per 100 score)
      tokenAmount += Math.floor(player.score / 100);
      
      // Winner bonus (20 tokens)
      if (winners.some(w => w.toString() === player.userId.toString())) {
        tokenAmount += 20;
      }
      
      // Complete game bonus (for players who stayed until the end)
      if (player.status === 'active') {
        tokenAmount += 5;
      }
      
      // Award tokens if amount > 0
      if (tokenAmount > 0) {
        try {
          await tokenService.awardGameTokens(
            player.userId.toString(),
            tokenAmount,
            gameSession._id.toString()
          );
          
          logger.info(`Awarded ${tokenAmount} tokens to player ${player.username} (${player.userId})`);
        } catch (error) {
          logger.error(`Failed to award tokens to player ${player.userId}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    logger.error(`Error awarding tokens: ${error.message}`);
  }
};

/**
 * Record player defeat event
 * @param {string} gameId - Game session ID
 * @param {string} defeatedId - Defeated player ID
 * @param {string|null} defeatedById - Player ID that defeated this player, or null for environment
 * @returns {Promise<Object>} Updated player data
 */
const recordPlayerDefeat = async (gameId, defeatedId, defeatedById = null) => {
  try {
    if (!gameId || !defeatedId) {
      throw new Error('Game ID and defeated player ID are required');
    }
    
    // Find game session
    const gameSession = await GameSession.findById(gameId);
    
    if (!gameSession) {
      throw new Error(`Game session not found: ${gameId}`);
    }
    
    // Find the defeated player
    const defeatedIndex = gameSession.players.findIndex(p => p.userId.toString() === defeatedId);
    
    if (defeatedIndex === -1) {
      throw new Error(`Player not found in game: ${defeatedId}`);
    }
    
    // Update defeated player stats
    gameSession.players[defeatedIndex].deaths++;
    
    let killerData = null;
    
    // Update killer stats if applicable
    if (defeatedById) {
      const killerIndex = gameSession.players.findIndex(p => p.userId.toString() === defeatedById);
      
      if (killerIndex !== -1) {
        gameSession.players[killerIndex].kills++;
        gameSession.players[killerIndex].score += 100; // 100 points per kill
        
        killerData = {
          userId: gameSession.players[killerIndex].userId,
          username: gameSession.players[killerIndex].username,
          kills: gameSession.players[killerIndex].kills,
          score: gameSession.players[killerIndex].score
        };
      }
    }
    
    // Save changes
    await gameSession.save();
    
    // Check for victory condition
    if (gameSession.settings.victoryCondition === 'last_standing') {
      const activePlayers = gameSession.players.filter(p => p.status === 'active');
      
      // If only one player/team remains, end the game
      if (activePlayers.length === 1 && !gameSession.settings.teamMode) {
        // Schedule game end
        setTimeout(async () => {
          try {
            await endGame(gameId, 'last_player_standing');
          } catch (error) {
            logger.error(`Error ending game after last player: ${error.message}`);
          }
        }, gameSession.settings.endDelay * 1000);
        
        // Update game session status
        gameSession.status = 'ending';
        await gameSession.save();
        
        logger.info(`Game ${gameId} ending in ${gameSession.settings.endDelay}s due to last player standing`);
      }
    } else if (gameSession.settings.victoryCondition === 'score_limit') {
      // Check if any player reached the score limit
      const reachedScoreLimit = gameSession.players.some(p => p.score >= gameSession.settings.scoreLimit);
      
      if (reachedScoreLimit) {
        // Schedule game end
        setTimeout(async () => {
          try {
            await endGame(gameId, 'score_limit_reached');
          } catch (error) {
            logger.error(`Error ending game after score limit: ${error.message}`);
          }
        }, gameSession.settings.endDelay * 1000);
        
        // Update game session status
        gameSession.status = 'ending';
        await gameSession.save();
        
        logger.info(`Game ${gameId} ending in ${gameSession.settings.endDelay}s due to score limit reached`);
      }
    }
    
    return {
      defeatedPlayer: {
        userId: gameSession.players[defeatedIndex].userId,
        username: gameSession.players[defeatedIndex].username,
        deaths: gameSession.players[defeatedIndex].deaths,
        score: gameSession.players[defeatedIndex].score
      },
      killerPlayer: killerData
    };
  } catch (error) {
    logger.error(`Error recording player defeat: ${error.message}`);
    throw error;
  }
};

/**
 * Clean up stale game sessions
 * @returns {Promise<number>} Number of games cleaned up
 */
const cleanupStaleGames = async () => {
  try {
    const now = new Date();
    let cleanupCount = 0;
    
    // Find waiting games that haven't started and are older than 1 hour
    const staleWaitingGames = await GameSession.find({
      status: 'waiting',
      createdAt: { $lt: new Date(now - 3600000) } // 1 hour ago
    });
    
    // End these games
    for (const game of staleWaitingGames) {
      await endGame(game._id.toString(), 'timeout_waiting');
      cleanupCount++;
    }
    
    // Find in-progress games that haven't been updated in 3 hours
    const staleInProgressGames = await GameSession.find({
      status: 'in_progress',
      startedAt: { $lt: new Date(now - 10800000) } // 3 hours ago
    });
    
    // End these games
    for (const game of staleInProgressGames) {
      await endGame(game._id.toString(), 'timeout_in_progress');
      cleanupCount++;
    }
    
    // Find ending games that haven't completed in 1 hour
    const staleEndingGames = await GameSession.find({
      status: 'ending',
      $or: [
        { endedAt: { $lt: new Date(now - 3600000) } }, // 1 hour ago
        { updatedAt: { $lt: new Date(now - 3600000) } } // 1 hour ago
      ]
    });
    
    // Force end these games
    for (const game of staleEndingGames) {
      game.status = 'ended';
      game.endedAt = now;
      game.endReason = 'timeout_ending';
      await game.save();
      
      // Clean up in-memory game state
      activeGames.delete(game._id.toString());
      
      cleanupCount++;
    }
    
    if (cleanupCount > 0) {
      logger.info(`Cleaned up ${cleanupCount} stale game sessions`);
    }
    
    return cleanupCount;
  } catch (error) {
    logger.error(`Error cleaning up stale games: ${error.message}`);
    throw error;
  }
};

// Start periodic cleanup task
const CLEANUP_INTERVAL = 15 * 60 * 1000; // 15 minutes

setInterval(async () => {
  try {
    await cleanupStaleGames();
  } catch (error) {
    logger.error(`Error in periodic game cleanup: ${error.message}`);
  }
}, CLEANUP_INTERVAL);

module.exports = {
  createGame,
  getGameById,
  findAvailableGames,
  getGameState,
  updateGameState,
  addPlayerToGame,
  removePlayerFromGame,
  startGame,
  endGame,
  recordPlayerDefeat,
  cleanupStaleGames,
  GAME_MAPS,
  DEFAULT_GAME_SETTINGS
};