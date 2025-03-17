import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

// Create context
const GameContext = createContext();

/**
 * Game Provider component for managing game state
 */
export const GameProvider = ({ children }) => {
  // Game session state
  const [currentGame, setCurrentGame] = useState(null);
  const [availableGames, setAvailableGames] = useState([]);
  const [gameLoading, setGameLoading] = useState(false);
  const [gameError, setGameError] = useState(null);
  
  // Game invites state
  const [invites, setInvites] = useState([]);
  
  // Game socket state
  const [gameSocket, setGameSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Game state (players, positions, etc.)
  const [players, setPlayers] = useState({});
  const [projectiles, setProjectiles] = useState({});
  const [gameSettings, setGameSettings] = useState(null);
  const [mapInfo, setMapInfo] = useState(null);
  
  // Player state
  const [playerPosition, setPlayerPosition] = useState({ x: 0, y: 0, z: 0 });
  const [playerRotation, setPlayerRotation] = useState({ x: 0, y: 0, z: 0 });
  const [playerVelocity, setPlayerVelocity] = useState({ x: 0, y: 0, z: 0 });
  const [playerHealth, setPlayerHealth] = useState(100);
  const [playerFuel, setPlayerFuel] = useState(100);
  const [playerScore, setPlayerScore] = useState(0);
  const [playerShields, setPlayerShields] = useState(false);
  const [playerBoost, setPlayerBoost] = useState(false);
  
  // Get API token from localStorage
  const getToken = () => localStorage.getItem('token');
  
  /**
   * Initialize game socket connection
   */
  const initGameSocket = useCallback(() => {
    // Close existing connection if any
    if (gameSocket) {
      gameSocket.disconnect();
    }
    
    const token = getToken();
    if (!token) return;
    
    // Connect to game socket
    const socket = io(`${process.env.REACT_APP_API_URL}/game`, {
      auth: { token }
    });
    
    // Socket event handlers
    socket.on('connect', () => {
      console.log('Connected to game socket');
      setIsConnected(true);
    });
    
    socket.on('disconnect', (reason) => {
      console.log(`Disconnected from game socket: ${reason}`);
      setIsConnected(false);
    });
    
    socket.on('connect_error', (error) => {
      console.error('Game socket connection error:', error);
      setIsConnected(false);
      setGameError(`Connection error: ${error.message}`);
    });
    
    // Set socket
    setGameSocket(socket);
    
    // Clean up on unmount
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [gameSocket]);
  
  /**
   * Set up game socket event handlers
   */
  const setupGameEvents = useCallback(() => {
    if (!gameSocket) return;
    
    // Join game success event
    gameSocket.on('join-success', (data) => {
      console.log('Joined game successfully:', data);
      
      // Set initial player position and settings
      setPlayerPosition(data.position);
      setGameSettings(data.settings);
      setMapInfo(data.map);
      
      // Fetch full game details
      fetchGameById(data.gameId);
    });
    
    // Game state update event
    gameSocket.on('game-state', (data) => {
      // Update players
      setPlayers(data.players);
      
      // Update projectiles
      setProjectiles(data.projectiles);
      
      // Update game settings if provided
      if (data.settings) {
        setGameSettings(data.settings);
      }
    });
    
    // Player movement event
    gameSocket.on('player-moved', (data) => {
      setPlayers(prevPlayers => ({
        ...prevPlayers,
        [data.playerId]: {
          ...(prevPlayers[data.playerId] || {}),
          position: data.position,
          rotation: data.rotation,
          velocity: data.velocity
        }
      }));
    });
    
    // Player joined event
    gameSocket.on('player-joined', (data) => {
      setPlayers(prevPlayers => ({
        ...prevPlayers,
        [data.id]: {
          position: data.position,
          rotation: data.rotation || { x: 0, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          username: data.username,
          aircraft: data.aircraft,
          health: 100,
          fuel: 100
        }
      }));
    });
    
    // Player left event
    gameSocket.on('player-left', (data) => {
      setPlayers(prevPlayers => {
        const newPlayers = { ...prevPlayers };
        delete newPlayers[data.playerId];
        return newPlayers;
      });
    });
    
    // Player defeated event
    gameSocket.on('player-defeated', (data) => {
      if (data.defeatedId === localStorage.getItem('userId')) {
        // Current player was defeated
        setPlayerHealth(0);
        
        // Show defeat screen or message
        // This would trigger your UI to show a death screen
      }
      
      // Update player state to show defeat
      setPlayers(prevPlayers => ({
        ...prevPlayers,
        [data.defeatedId]: {
          ...(prevPlayers[data.defeatedId] || {}),
          health: 0,
          defeated: true,
          defeatedBy: data.defeatedById,
          respawning: true,
          respawnTime: data.respawnTime
        }
      }));
    });
    
    // Player respawned event
    gameSocket.on('player-respawned', (data) => {
      if (data.playerId === localStorage.getItem('userId')) {
        // Current player respawned
        setPlayerHealth(data.health);
        setPlayerPosition(data.position);
      }
      
      // Update player in players list
      setPlayers(prevPlayers => ({
        ...prevPlayers,
        [data.playerId]: {
          ...(prevPlayers[data.playerId] || {}),
          position: data.position,
          health: data.health,
          defeated: false,
          respawning: false
        }
      }));
    });
    
    // Game started event
    gameSocket.on('game-started', (data) => {
      // Update current game status
      setCurrentGame(prev => prev && prev._id === data.gameId 
        ? { ...prev, status: 'in_progress', startedAt: data.startTime }
        : prev
      );
    });
    
    // Game ending event
    gameSocket.on('game-ending', (data) => {
      setCurrentGame(prev => prev && prev._id === data.gameId 
        ? { ...prev, status: 'ending', endReason: data.reason }
        : prev
      );
    });
    
    // Game ended event
    gameSocket.on('game-ended', (data) => {
      setCurrentGame(prev => prev && prev._id === data.gameId 
        ? { 
            ...prev, 
            status: 'ended', 
            winners: data.winners,
            duration: data.duration,
            stats: data.stats
          }
        : prev
      );
      
      // Disconnect from game socket after game ends
      gameSocket.disconnect();
    });
    
    // Projectile hit event
    gameSocket.on('projectile-hit', (data) => {
      if (data.hitPlayerId === localStorage.getItem('userId')) {
        // Current player was hit
        setPlayerHealth(prev => Math.max(0, prev - data.damage));
      }
      
      // Update projectiles list
      setProjectiles(prevProjectiles => {
        const newProjectiles = { ...prevProjectiles };
        delete newProjectiles[data.projectileId];
        return newProjectiles;
      });
      
      // Update hit player's health
      setPlayers(prevPlayers => ({
        ...prevPlayers,
        [data.hitPlayerId]: {
          ...(prevPlayers[data.hitPlayerId] || {}),
          health: Math.max(0, (prevPlayers[data.hitPlayerId]?.health || 100) - data.damage)
        }
      }));
    });
    
    // Action confirmed event
    gameSocket.on('action-confirmed', (data) => {
      // Handle different action types
      switch (data.actionType) {
        case 'boost':
          setPlayerBoost(true);
          setTimeout(() => setPlayerBoost(false), data.actionData.boostRemaining * 1000);
          setPlayerFuel(data.actionData.fuel);
          break;
        case 'shield':
          setPlayerShields(true);
          setTimeout(() => setPlayerShields(false), data.actionData.shieldRemaining * 1000);
          break;
        default:
          break;
      }
    });
    
    // Action rejected event
    gameSocket.on('action-rejected', (data) => {
      console.warn(`Action ${data.actionType} rejected: ${data.reason}`);
      setGameError(`Action rejected: ${data.reason}`);
    });
    
    // Error event
    gameSocket.on('error', (data) => {
      console.error('Game error:', data);
      setGameError(data.message);
    });
    
    // Clean up event listeners on unmount
    return () => {
      if (gameSocket) {
        gameSocket.off('join-success');
        gameSocket.off('game-state');
        gameSocket.off('player-moved');
        gameSocket.off('player-joined');
        gameSocket.off('player-left');
        gameSocket.off('player-defeated');
        gameSocket.off('player-respawned');
        gameSocket.off('game-started');
        gameSocket.off('game-ending');
        gameSocket.off('game-ended');
        gameSocket.off('projectile-hit');
        gameSocket.off('action-confirmed');
        gameSocket.off('action-rejected');
        gameSocket.off('error');
      }
    };
  }, [gameSocket]);
  
  // Initialize socket when context is mounted
  useEffect(() => {
    initGameSocket();
  }, [initGameSocket]);
  
  // Set up game event handlers when socket is connected
  useEffect(() => {
    if (gameSocket && isConnected) {
      return setupGameEvents();
    }
  }, [gameSocket, isConnected, setupGameEvents]);
  
  /**
   * Fetch available games from API
   */
  const fetchAvailableGames = useCallback(async () => {
    try {
      setGameLoading(true);
      setGameError(null);
      
      const token = getToken();
      if (!token) throw new Error('Not authenticated');
      
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/games`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setAvailableGames(response.data);
    } catch (error) {
      console.error('Error fetching available games:', error);
      setGameError(error.response?.data?.message || error.message);
    } finally {
      setGameLoading(false);
    }
  }, []);
  
  /**
   * Fetch game details by ID
   */
  const fetchGameById = useCallback(async (gameId) => {
    try {
      setGameLoading(true);
      setGameError(null);
      
      const token = getToken();
      if (!token) throw new Error('Not authenticated');
      
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/games/${gameId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setCurrentGame(response.data);
    } catch (error) {
      console.error(`Error fetching game ${gameId}:`, error);
      setGameError(error.response?.data?.message || error.message);
    } finally {
      setGameLoading(false);
    }
  }, []);
  
  /**
   * Create a new game
   */
  const createGame = useCallback(async (gameData) => {
    try {
      setGameLoading(true);
      setGameError(null);
      
      const token = getToken();
      if (!token) throw new Error('Not authenticated');
      
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/games`, gameData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const newGame = response.data;
      setCurrentGame(newGame);
      
      return newGame;
    } catch (error) {
      console.error('Error creating game:', error);
      setGameError(error.response?.data?.message || error.message);
      throw error;
    } finally {
      setGameLoading(false);
    }
  }, []);
  
  /**
   * Join an existing game
   */
  const joinGame = useCallback(async (gameId, options = {}) => {
    try {
      setGameLoading(true);
      setGameError(null);
      
      // Make API request to join game
      const token = getToken();
      if (!token) throw new Error('Not authenticated');
      
      await axios.post(`${process.env.REACT_APP_API_URL}/api/games/${gameId}/join`, options, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Get user ID from localStorage
      const userId = localStorage.getItem('userId');
      
      // Send socket event to join game
      if (gameSocket && isConnected) {
        gameSocket.emit('join-game', {
          gameId,
          aircraftId: options.aircraftId
        });
      } else {
        throw new Error('Game socket not connected');
      }
    } catch (error) {
      console.error(`Error joining game ${gameId}:`, error);
      setGameError(error.response?.data?.message || error.message);
      throw error;
    } finally {
      setGameLoading(false);
    }
  }, [gameSocket, isConnected]);
  
  /**
   * Leave the current game
   */
  const leaveGame = useCallback(async () => {
    try {
      if (!currentGame) return;
      
      setGameLoading(true);
      setGameError(null);
      
      const token = getToken();
      if (!token) throw new Error('Not authenticated');
      
      // Send socket event to leave game
      if (gameSocket && isConnected) {
        gameSocket.emit('leave-game', {
          gameId: currentGame._id
        });
      }
      
      // Make API request to leave game
      await axios.post(`${process.env.REACT_APP_API_URL}/api/games/${currentGame._id}/leave`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Reset game state
      setCurrentGame(null);
      setPlayers({});
      setProjectiles({});
      setPlayerHealth(100);
      setPlayerFuel(100);
      setPlayerScore(0);
      setPlayerPosition({ x: 0, y: 0, z: 0 });
      setPlayerRotation({ x: 0, y: 0, z: 0 });
      setPlayerVelocity({ x: 0, y: 0, z: 0 });
    } catch (error) {
      console.error('Error leaving game:', error);
      setGameError(error.response?.data?.message || error.message);
    } finally {
      setGameLoading(false);
    }
  }, [currentGame, gameSocket, isConnected]);
  
  /**
   * Start the current game (for game creator)
   */
  const startGame = useCallback(async () => {
    try {
      if (!currentGame) return;
      
      setGameLoading(true);
      setGameError(null);
      
      const token = getToken();
      if (!token) throw new Error('Not authenticated');
      
      await axios.post(`${process.env.REACT_APP_API_URL}/api/games/${currentGame._id}/start`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      console.error('Error starting game:', error);
      setGameError(error.response?.data?.message || error.message);
      throw error;
    } finally {
      setGameLoading(false);
    }
  }, [currentGame]);
  
  /**
   * Send player movement update
   */
  const sendMovement = useCallback((position, rotation, velocity) => {
    if (!gameSocket || !isConnected || !currentGame) return;
    
    // Update local state
    setPlayerPosition(position);
    setPlayerRotation(rotation);
    setPlayerVelocity(velocity);
    
    // Send to server
    gameSocket.emit('player-movement', {
      gameId: currentGame._id,
      position,
      rotation,
      velocity,
      timestamp: Date.now()
    });
  }, [gameSocket, isConnected, currentGame]);
  
  /**
   * Perform a game action (fire, missile, boost, shield)
   */
  const performAction = useCallback((actionType, actionData = {}) => {
    if (!gameSocket || !isConnected || !currentGame) return;
    
    gameSocket.emit('player-action', {
      gameId: currentGame._id,
      actionType,
      actionData: {
        position: playerPosition,
        ...actionData
      },
      timestamp: Date.now()
    });
  }, [gameSocket, isConnected, currentGame, playerPosition]);
  
  /**
   * Fire weapon
   */
  const fireWeapon = useCallback(() => {
    performAction('fire', {
      position: playerPosition,
      direction: getForwardVector(playerRotation)
    });
  }, [performAction, playerPosition, playerRotation]);
  
  /**
   * Launch missile
   */
  const launchMissile = useCallback((targetId) => {
    performAction('missile', {
      position: playerPosition,
      target: targetId
    });
  }, [performAction, playerPosition]);
  
  /**
   * Activate boost
   */
  const activateBoost = useCallback(() => {
    performAction('boost');
  }, [performAction]);
  
  /**
   * Activate shield
   */
  const activateShield = useCallback(() => {
    performAction('shield');
  }, [performAction]);
  
  /**
   * Get forward vector from rotation
   */
  const getForwardVector = (rotation) => {
    // Convert rotation to radians if in degrees
    const toRadians = (degrees) => degrees * (Math.PI / 180);
    
    const rx = typeof rotation.x === 'number' ? toRadians(rotation.x) : 0;
    const ry = typeof rotation.y === 'number' ? toRadians(rotation.y) : 0;
    
    // Calculate direction vector
    return {
      x: Math.sin(ry) * Math.cos(rx),
      y: -Math.sin(rx),
      z: Math.cos(ry) * Math.cos(rx)
    };
  };
  
  /**
   * Fetch game invites
   */
  const fetchInvites = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) throw new Error('Not authenticated');
      
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/games/invites`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setInvites(response.data);
    } catch (error) {
      console.error('Error fetching game invites:', error);
    }
  }, []);
  
  /**
   * Respond to game invite
   */
  const respondToInvite = useCallback(async (inviteId, accept) => {
    try {
      const token = getToken();
      if (!token) throw new Error('Not authenticated');
      
      const action = accept ? 'accept' : 'decline';
      
      await axios.post(`${process.env.REACT_APP_API_URL}/api/games/invites/${inviteId}/${action}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Refresh invites
      fetchInvites();
      
      // If accepted, fetch available games
      if (accept) {
        fetchAvailableGames();
      }
    } catch (error) {
      console.error(`Error ${accept ? 'accepting' : 'declining'} invite:`, error);
    }
  }, [fetchInvites, fetchAvailableGames]);
  
  // Set up invite polling
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    
    // Initial fetch
    fetchInvites();
    
    // Poll for new invites every 30 seconds
    const intervalId = setInterval(fetchInvites, 30000);
    
    return () => clearInterval(intervalId);
  }, [fetchInvites]);
  
  // Context value
  const value = {
    // Game state
    currentGame,
    availableGames,
    gameLoading,
    gameError,
    players,
    projectiles,
    gameSettings,
    mapInfo,
    
    // Player state
    playerPosition,
    playerRotation,
    playerVelocity,
    playerHealth,
    playerFuel,
    playerScore,
    playerShields,
    playerBoost,
    
    // Socket state
    gameSocket,
    isConnected,
    
    // Game invites
    invites,
    
    // Actions
    fetchAvailableGames,
    fetchGameById,
    createGame,
    joinGame,
    leaveGame,
    startGame,
    sendMovement,
    fireWeapon,
    launchMissile,
    activateBoost,
    activateShield,
    fetchInvites,
    respondToInvite
  };
  
  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
};

/**
 * Hook to use the game context
 */
export const useGame = () => {
  const context = useContext(GameContext);
  
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  
  return context;
};

export default GameContext;