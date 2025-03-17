const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const GameSession = require('../models/GameSession');
const PlayerStat = require('../models/PlayerStat');
const logger = require('../utils/logger');
const tokenService = require('../services/tokenService');
const gameService = require('../services/gameService');
const { calculateCollision } = require('../utils/physicsUtils');

/**
 * Handle game-related socket events
 * @param {Object} io - Socket.io server instance
 * @param {Object} socket - Socket.io client connection
 */
module.exports = (io, socket) => {
  const gameState = socket.gameState;
  let playerId = null;
  let currentSession = null;
  
  /**
   * Initialize player when joining the game
   */
  socket.on('game:join', async (data) => {
    try {
      // Get user from socket authentication
      const userId = socket.user ? socket.user.id : null;
      
      // Generate player ID
      playerId = data.playerId || uuidv4();
      socket.playerId = playerId;
      
      // Set up player data
      const playerData = {
        id: playerId,
        userId: userId,
        username: data.username || `Player-${playerId.substring(0, 4)}`,
        socketId: socket.id,
        position: data.position || { x: 0, y: 100, z: 0 },
        rotation: data.rotation || { x: 0, y: 0, z: 0 },
        velocity: data.velocity || { x: 0, y: 0, z: 0 },
        model: data.model || 'basic-plane',
        health: 100,
        fuel: 100,
        ammo: 50,
        score: 0,
        kills: 0,
        deaths: 0,
        status: 'active',
        walletAddress: data.walletAddress || null,
        joined: Date.now()
      };
      
      // Add player to global state
      gameState.players.set(playerId, playerData);
      
      // Check if joining specific session or creating a new one
      const sessionId = data.sessionId || uuidv4();
      currentSession = sessionId;
      
      // Join session room
      socket.join(sessionId);
      
      // Create session if it doesn't exist
      if (!gameState.sessions.has(sessionId)) {
        // Generate world data
        const worldData = await gameService.generateWorld();
        
        // Create session in state
        gameState.sessions.set(sessionId, {
          id: sessionId,
          name: data.sessionName || `Game ${sessionId.substring(0, 4)}`,
          players: new Map(),
          started: Date.now(),
          worldData,
          settings: data.settings || {
            gameMode: 'deathmatch',
            timeLimit: 10 * 60 * 1000, // 10 minutes
            maxPlayers: 16,
            difficulty: 'normal'
          }
        });
        
        // Create session in database
        if (userId) {
          try {
            const dbSession = new GameSession({
              sessionId,
              name: data.sessionName || `Game ${sessionId.substring(0, 4)}`,
              createdBy: userId,
              gameMode: data.settings?.gameMode || 'deathmatch',
              startTime: Date.now(),
              settings: data.settings || {}
            });
            await dbSession.save();
          } catch (err) {
            logger.error('Failed to save game session to database', err);
          }
        }
        
        // Update server stats
        gameState.serverInfo.totalSessions++;
      }
      
      // Add player to session
      const session = gameState.sessions.get(sessionId);
      session.players.set(playerId, playerData);
      playerData.sessionId = sessionId;
      
      // Get all players in the session for initial state
      const sessionPlayers = Array.from(session.players.values());
      
      // Send initial game state to joining player
      socket.emit('game:init', {
        playerId,
        sessionId,
        players: sessionPlayers,
        worldData: session.worldData,
        settings: session.settings
      });
      
      // Notify other players about new player
      socket.to(sessionId).emit('game:playerJoined', {
        player: playerData
      });
      
      logger.info(`Player ${playerData.username} (${playerId}) joined session ${sessionId}`);
    } catch (error) {
      logger.error('Error in game:join handler:', error);
      socket.emit('game:error', {
        message: 'Failed to join game session',
        details: error.message
      });
    }
  });
  
  /**
   * Handle player position/rotation/velocity updates
   */
  socket.on('game:updatePosition', (data) => {
    if (!playerId || !currentSession) return;
    
    try {
      // Get player data
      const player = gameState.players.get(playerId);
      if (!player) return;
      
      // Update player data
      player.position = data.position;
      player.rotation = data.rotation;
      player.velocity = data.velocity;
      
      // Update player in session
      const session = gameState.sessions.get(currentSession);
      if (session) {
        session.players.set(playerId, player);
      }
      
      // Broadcast to other players in the same session
      socket.to(currentSession).emit('game:playerMoved', {
        id: playerId,
        position: data.position,
        rotation: data.rotation,
        velocity: data.velocity
      });
    } catch (error) {
      logger.error('Error in game:updatePosition handler:', error);
    }
  });
  
  /**
   * Handle player actions (shooting, special abilities, etc.)
   */
  socket.on('game:action', async (data) => {
    if (!playerId || !currentSession) return;
    
    try {
      const actionType = data.type;
      const player = gameState.players.get(playerId);
      const session = gameState.sessions.get(currentSession);
      
      if (!player || !session) return;
      
      switch (actionType) {
        case 'shoot':
          // Check if player has ammo
          if (player.ammo <= 0) {
            socket.emit('game:actionFailed', {
              type: 'shoot',
              reason: 'Out of ammo'
            });
            return;
          }
          
          // Deduct ammo
          player.ammo--;
          
          // Create projectile
          const projectileId = uuidv4();
          const projectileData = {
            id: projectileId,
            ownerId: playerId,
            position: { ...data.position },
            velocity: { ...data.velocity },
            damage: data.damage || 10,
            created: Date.now()
          };
          
          // Broadcast projectile to all players in session
          io.to(currentSession).emit('game:projectile', projectileData);
          
          // Set timeout to remove projectile after 5 seconds
          setTimeout(() => {
            io.to(currentSession).emit('game:removeProjectile', {
              id: projectileId
            });
          }, 5000);
          break;
          
        case 'hit':
          // Process hit on another player
          const targetId = data.targetId;
          const targetPlayer = session.players.get(targetId);
          
          if (!targetPlayer) return;
          
          // Calculate damage
          const damage = data.damage || 10;
          
          // Reduce target health
          targetPlayer.health = Math.max(0, targetPlayer.health - damage);
          
          // Broadcast hit to all players in session
          io.to(currentSession).emit('game:playerHit', {
            id: targetId,
            attackerId: playerId,
            damage,
            health: targetPlayer.health,
            position: data.position || targetPlayer.position
          });
          
          // Check if player is defeated
          if (targetPlayer.health <= 0) {
            // Update stats
            player.kills++;
            player.score += 100;
            targetPlayer.deaths++;
            
            // Broadcast player defeated
            io.to(currentSession).emit('game:playerDefeated', {
              id: targetId,
              attackerId: playerId
            });
            
            // Award tokens for kill if both players have wallet connected
            if (player.walletAddress && targetPlayer.walletAddress && player.userId) {
              try {
                // Award tokens to the player who got the kill
                const tokenAmount = 5; // 5 tokens per kill
                const result = await tokenService.awardTokens(
                  player.walletAddress,
                  tokenAmount,
                  'Player defeat reward'
                );
                
                if (result.success) {
                  // Notify player about token reward
                  socket.emit('token:reward', {
                    amount: tokenAmount,
                    reason: 'Player defeat',
                    txHash: result.transactionHash
                  });
                  
                  // Update database records
                  try {
                    await User.findByIdAndUpdate(player.userId, {
                      $inc: {
                        'gameStats.kills': 1,
                        'gameStats.score': 100,
                        'gameStats.tokensEarned': tokenAmount
                      }
                    });
                  } catch (err) {
                    logger.error('Failed to update user stats after kill', err);
                  }
                }
              } catch (err) {
                logger.error('Failed to award tokens for player defeat', err);
              }
            }
            
            // Respawn defeated player after delay
            setTimeout(() => {
              // Get random spawn point
              const spawnPoint = gameService.getRandomSpawnPoint(session.worldData);
              
              // Reset player health and position
              targetPlayer.health = 100;
              targetPlayer.position = spawnPoint;
              targetPlayer.velocity = { x: 0, y: 0, z: 0 };
              
              // Broadcast respawn
              io.to(currentSession).emit('game:playerRespawned', {
                id: targetId,
                position: spawnPoint,
                health: 100
              });
            }, 3000); // 3 second respawn delay
          }
          break;
          
        case 'useItem':
          // Process item usage
          const itemId = data.itemId;
          
          // Example items: health kit, ammo refill, boost, etc.
          switch (itemId) {
            case 'health':
              player.health = Math.min(100, player.health + 25);
              break;
            case 'ammo':
              player.ammo = Math.min(100, player.ammo + 25);
              break;
            case 'fuel':
              player.fuel = Math.min(100, player.fuel + 25);
              break;
            default:
              return;
          }
          
          // Broadcast item use
          io.to(currentSession).emit('game:itemUsed', {
            playerId,
            itemId,
            health: player.health,
            ammo: player.ammo,
            fuel: player.fuel
          });
          break;
          
        default:
          logger.warn(`Unknown action type: ${actionType}`);
      }
    } catch (error) {
      logger.error(`Error in game:action handler (${data.type}):`, error);
    }
  });
  
  /**
   * Handle achievement completion
   */
  socket.on('game:achievement', async (data) => {
    if (!playerId || !currentSession) return;
    
    try {
      // Get player data
      const player = gameState.players.get(playerId);
      if (!player || !player.userId || !player.walletAddress) return;
      
      const achievementType = data.type;
      const achievementId = data.id;
      
      // Define rewards for different achievement types
      const rewards = {
        'first-flight': 10,
        'first-kill': 15,
        'flying-ace': 25,
        'precision': 20,
        'endurance': 30,
        'teamwork': 15,
        'mission-complete': 50
      };
      
      // Get reward amount
      const rewardAmount = rewards[achievementType] || 10;
      
      // Award tokens
      const result = await tokenService.awardTokens(
        player.walletAddress,
        rewardAmount,
        `Achievement: ${achievementType}`
      );
      
      if (result.success) {
        // Notify player about achievement and reward
        socket.emit('game:achievementComplete', {
          id: achievementId,
          type: achievementType,
          reward: rewardAmount,
          txHash: result.transactionHash
        });
        
        // Broadcast achievement to other players
        socket.to(currentSession).emit('game:playerAchievement', {
          playerId,
          username: player.username,
          achievementType
        });
        
        // Update user record in database
        try {
          await User.findByIdAndUpdate(player.userId, {
            $inc: { 'gameStats.tokensEarned': rewardAmount },
            $push: { 'gameStats.achievements': {
              type: achievementType,
              completedAt: Date.now(),
              reward: rewardAmount
            }}
          });
        } catch (err) {
          logger.error('Failed to update user achievements', err);
        }
      }
    } catch (error) {
      logger.error(`Error in game:achievement handler:`, error);
    }
  });
  
  /**
   * Handle game session completion
   */
  socket.on('game:endSession', async (data) => {
    if (!currentSession) return;
    
    try {
      // Get session data
      const session = gameState.sessions.get(currentSession);
      if (!session) return;
      
      // Calculate session stats
      const sessionDuration = Date.now() - session.started;
      const playerStats = Array.from(session.players.values())
        .map(player => ({
          playerId: player.id,
          userId: player.userId,
          username: player.username,
          score: player.score,
          kills: player.kills,
          deaths: player.deaths
        }));
      
      // Sort players by score
      playerStats.sort((a, b) => b.score - a.score);
      
      // Determine winners
      const winners = playerStats.slice(0, 3);
      
      // Notify all players in session
      io.to(currentSession).emit('game:sessionComplete', {
        sessionId: currentSession,
        duration: sessionDuration,
        players: playerStats,
        winners
      });
      
      // Save session results to database
      try {
        await GameSession.findOneAndUpdate(
          { sessionId: currentSession },
          {
            endTime: Date.now(),
            duration: sessionDuration,
            playerCount: playerStats.length,
            playerStats,
            winners: winners.map(w => w.userId).filter(Boolean)
          }
        );
        
        // Update player stats in database
        for (const player of playerStats) {
          if (player.userId) {
            try {
              await User.findByIdAndUpdate(player.userId, {
                $inc: {
                  'gameStats.totalGames': 1,
                  'gameStats.totalScore': player.score,
                  'gameStats.kills': player.kills,
                  'gameStats.deaths': player.deaths
                }
              });
              
              // Create or update player stats
              await PlayerStat.findOneAndUpdate(
                { userId: player.userId },
                {
                  $inc: {
                    totalGames: 1,
                    totalScore: player.score,
                    kills: player.kills,
                    deaths: player.deaths
                  },
                  $push: {
                    recentGames: {
                      sessionId: currentSession,
                      score: player.score,
                      kills: player.kills,
                      deaths: player.deaths,
                      date: Date.now()
                    }
                  }
                },
                { upsert: true, new: true }
              );
            } catch (err) {
              logger.error('Failed to update player stats', err);
            }
          }
        }
      } catch (err) {
        logger.error('Failed to save session results', err);
      }
      
      // Award tokens to winners if they have wallets
      for (let i = 0; i < winners.length && i < 3; i++) {
        const winner = winners[i];
        if (!winner.userId) continue;
        
        try {
          const user = await User.findById(winner.userId);
          if (!user || !user.walletAddress) continue;
          
          // Award different amounts based on position
          const rewards = [50, 30, 15]; // 1st, 2nd, 3rd place
          const amount = rewards[i];
          
          const result = await tokenService.awardTokens(
            user.walletAddress,
            amount,
            `Game session winner (${i + 1}${getOrdinalSuffix(i + 1)} place)`
          );
          
          if (result.success) {
            // Find winner's socket to notify them
            const winnerPlayer = Array.from(gameState.players.values())
              .find(p => p.userId === winner.userId);
            
            if (winnerPlayer) {
              const winnerSocket = io.sockets.sockets.get(winnerPlayer.socketId);
              if (winnerSocket) {
                winnerSocket.emit('token:reward', {
                  amount,
                  reason: `Winner reward (${i + 1}${getOrdinalSuffix(i + 1)} place)`,
                  txHash: result.transactionHash
                });
              }
            }
            
            // Update user record
            await User.findByIdAndUpdate(winner.userId, {
              $inc: { 'gameStats.tokensEarned': amount }
            });
          }
        } catch (err) {
          logger.error('Failed to award tokens to winner', err);
        }
      }
      
      // Remove session after a delay
      setTimeout(() => {
        if (gameState.sessions.has(currentSession)) {
          gameState.sessions.delete(currentSession);
          logger.info(`Session removed: ${currentSession}`);
        }
      }, 60000); // Keep session alive for 1 minute after completion
    } catch (error) {
      logger.error('Error in game:endSession handler:', error);
    }
  });
  
  /**
   * Join a lobby
   */
  socket.on('lobby:join', (data) => {
    if (!playerId) return;
    
    try {
      // Get player data
      const player = gameState.players.get(playerId);
      if (!player) return;
      
      // Determine which lobby to join
      const lobbyId = data.lobbyId || 'default';
      
      // Create lobby if it doesn't exist
      if (!gameState.lobbies.has(lobbyId)) {
        gameState.lobbies.set(lobbyId, {
          id: lobbyId,
          name: data.lobbyName || 'Default Lobby',
          players: new Map(),
          created: Date.now(),
          settings: data.settings || {
            gameMode: 'deathmatch',
            map: 'random',
            maxPlayers: 10
          }
        });
      }
      
      // Join lobby room
      socket.join(`lobby:${lobbyId}`);
      
      // Add player to lobby
      const lobby = gameState.lobbies.get(lobbyId);
      lobby.players.set(playerId, player);
      player.lobbyId = lobbyId;
      
      // Get all players in the lobby
      const lobbyPlayers = Array.from(lobby.players.values());
      
      // Send lobby data to joining player
      socket.emit('lobby:joined', {
        lobbyId,
        name: lobby.name,
        players: lobbyPlayers,
        settings: lobby.settings
      });
      
      // Notify other players about new player
      socket.to(`lobby:${lobbyId}`).emit('lobby:playerJoined', {
        player
      });
      
      logger.info(`Player ${player.username} joined lobby ${lobbyId}`);
    } catch (error) {
      logger.error('Error in lobby:join handler:', error);
    }
  });
  
  /**
   * Start game from lobby
   */
  socket.on('lobby:startGame', async (data) => {
    if (!playerId) return;
    
    try {
      // Get player data
      const player = gameState.players.get(playerId);
      if (!player || !player.lobbyId) return;
      
      const lobbyId = player.lobbyId;
      const lobby = gameState.lobbies.get(lobbyId);
      
      if (!lobby) return;
      
      // Create new game session
      const sessionId = uuidv4();
      
      // Generate world data
      const worldData = await gameService.generateWorld(lobby.settings.map);
      
      // Create session
      gameState.sessions.set(sessionId, {
        id: sessionId,
        name: `${lobby.name} Game`,
        players: new Map(),
        started: Date.now(),
        worldData,
        settings: {
          ...lobby.settings,
          lobbyId // Reference back to the lobby
        }
      });
      
      // Update server stats
      gameState.serverInfo.totalSessions++;
      
      // Create session in database
      if (player.userId) {
        try {
          const dbSession = new GameSession({
            sessionId,
            name: `${lobby.name} Game`,
            createdBy: player.userId,
            gameMode: lobby.settings.gameMode,
            startTime: Date.now(),
            settings: lobby.settings
          });
          await dbSession.save();
        } catch (err) {
          logger.error('Failed to save game session to database', err);
        }
      }
      
      // Notify all players in lobby to join the game
      io.to(`lobby:${lobbyId}`).emit('lobby:gameStarting', {
        sessionId,
        countdown: 5 // 5 second countdown
      });
      
      // After countdown, notify ready
      setTimeout(() => {
        io.to(`lobby:${lobbyId}`).emit('lobby:gameReady', {
          sessionId
        });
      }, 5000);
      
      logger.info(`Game starting from lobby ${lobbyId}: Session ${sessionId}`);
    } catch (error) {
      logger.error('Error in lobby:startGame handler:', error);
    }
  });
};

/**
 * Helper function to get ordinal suffix for numbers
 */
function getOrdinalSuffix(i) {
  const j = i % 10;
  const k = i % 100;
  if (j === 1 && k !== 11) {
    return 'st';
  }
  if (j === 2 && k !== 12) {
    return 'nd';
  }
  if (j === 3 && k !== 13) {
    return 'rd';
  }
  return 'th';
}