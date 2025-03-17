import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import * as THREE from 'three';
import { Game } from '../game/core/Game';
import { Renderer } from '../game/rendering/Renderer';
import { Camera } from '../game/rendering/Camera';
import { Effects } from '../game/rendering/Effects';
import { NetworkManager } from '../game/networking/NetworkManager';
import { GameSettings } from '../game/core/GameSettings';
import LoadingSpinner from '../ui/LoadingSpinner';
import { useGameContext } from '../contexts/GameContext';

/**
 * Main game canvas component that initializes the 3D game rendering
 * and connects to game logic.
 */
const GameCanvas = ({
  sessionId,
  onGameReady,
  onGameError,
  initialAircraftId,
  spectatingPlayerId = null,
}) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const gameInstanceRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const effectsRef = useRef(null);
  const networkRef = useRef(null);
  
  const { setGameInstance, gameState, setGameState } = useGameContext();
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadingProgress, setLoadingProgress] = React.useState(0);
  const [loadingStage, setLoadingStage] = React.useState('Initializing...');
  const [error, setError] = React.useState(null);
  
  // Initialize game engine, renderer, and network
  useEffect(() => {
    let animationFrameId;
    let game;
    let renderer;
    let camera;
    let effects;
    let network;
    let clock;
    
    const initGame = async () => {
      try {
        setLoadingStage('Setting up renderer...');
        setLoadingProgress(10);
        
        // Initialize renderer
        renderer = new Renderer(containerRef.current);
        rendererRef.current = renderer;
        
        setLoadingStage('Setting up camera...');
        setLoadingProgress(20);
        
        // Initialize camera
        camera = new Camera(containerRef.current);
        cameraRef.current = camera;
        
        setLoadingStage('Initializing game engine...');
        setLoadingProgress(30);
        
        // Initialize game instance
        game = new Game({
          renderer,
          camera,
          onProgress: (progress, stage) => {
            setLoadingProgress(30 + progress * 0.3);
            if (stage) setLoadingStage(stage);
          },
        });
        gameInstanceRef.current = game;
        setGameInstance(game);
        
        // Register event listeners
        game.on('stateChanged', (newState) => {
          setGameState(newState);
        });
        
        // Initialize post-processing effects
        setLoadingStage('Setting up visual effects...');
        setLoadingProgress(60);
        effects = new Effects(renderer, game.scene, camera);
        effectsRef.current = effects;
        
        // Initialize network manager
        setLoadingStage('Connecting to server...');
        setLoadingProgress(70);
        network = new NetworkManager(game);
        networkRef.current = network;
        
        // Connect to server
        await network.connect();
        
        // Join game session if provided
        if (sessionId) {
          setLoadingStage('Joining game session...');
          setLoadingProgress(80);
          const joined = await game.joinSession(sessionId);
          if (!joined) {
            throw new Error('Failed to join game session');
          }
        }
        
        // Spawn aircraft if provided
        if (initialAircraftId && !spectatingPlayerId) {
          setLoadingStage('Preparing aircraft...');
          setLoadingProgress(90);
          await game.spawnAircraft(initialAircraftId);
        }
        
        // Set up spectator mode if requested
        if (spectatingPlayerId) {
          setLoadingStage('Entering spectator mode...');
          setLoadingProgress(90);
          await game.spectatePlayer(spectatingPlayerId);
        }
        
        // Initialize game clock
        clock = new THREE.Clock();
        
        // Start render loop
        const renderLoop = () => {
          const deltaTime = clock.getDelta();
          
          // Update game state
          game.update(deltaTime);
          
          // Update camera
          camera.update(deltaTime, game.getActiveAircraft());
          
          // Update network synchronization
          network.synchronizer.update(deltaTime, {
            time: clock.getElapsedTime(),
            serverTime: network.getServerTime(),
          });
          
          // Update visual effects
          effects.update(deltaTime, {
            environment: game.getEnvironmentState(),
          });
          
          // Render the scene
          renderer.render(game.scene, camera.getCamera(), deltaTime);
          
          // Continue animation loop
          animationFrameId = requestAnimationFrame(renderLoop);
        };
        
        // Game initialization complete
        setLoadingStage('Ready for takeoff!');
        setLoadingProgress(100);
        
        // Set a short delay to show "Ready" message
        setTimeout(() => {
          setIsLoading(false);
          renderLoop();
          
          // Notify parent component that game is ready
          if (onGameReady) {
            onGameReady(game);
          }
        }, 500);
        
      } catch (err) {
        console.error('Game initialization error:', err);
        setError(err.message || 'Failed to initialize game');
        
        // Notify parent component of error
        if (onGameError) {
          onGameError(err);
        }
      }
    };
    
    initGame();
    
    // Clean up on unmount
    return () => {
      cancelAnimationFrame(animationFrameId);
      
      if (game) {
        game.dispose();
      }
      
      if (renderer) {
        renderer.dispose();
      }
      
      if (camera) {
        camera.dispose();
      }
      
      if (effects) {
        effects.dispose();
      }
      
      if (network) {
        network.disconnect();
        network.dispose();
      }
    };
  }, [sessionId, initialAircraftId, spectatingPlayerId, onGameReady, onGameError, setGameInstance, setGameState]);
  
  // Handle container resize
  useEffect(() => {
    const handleResize = () => {
      if (rendererRef.current && cameraRef.current) {
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        
        rendererRef.current.resize(width, height);
        cameraRef.current.onResize();
        
        if (effectsRef.current) {
          effectsRef.current.resize(width, height, rendererRef.current.pixelRatio);
        }
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  // Handle keyboard and mouse input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameInstanceRef.current) {
        gameInstanceRef.current.handleKeyDown(e);
      }
    };
    
    const handleKeyUp = (e) => {
      if (gameInstanceRef.current) {
        gameInstanceRef.current.handleKeyUp(e);
      }
    };
    
    const handleMouseMove = (e) => {
      if (gameInstanceRef.current) {
        gameInstanceRef.current.handleMouseMove(e);
      }
    };
    
    const handleMouseDown = (e) => {
      if (gameInstanceRef.current) {
        gameInstanceRef.current.handleMouseDown(e);
      }
    };
    
    const handleMouseUp = (e) => {
      if (gameInstanceRef.current) {
        gameInstanceRef.current.handleMouseUp(e);
      }
    };
    
    const handleContextMenu = (e) => {
      // Prevent context menu on right-click if we're in game
      if (gameInstanceRef.current && !isLoading) {
        e.preventDefault();
      }
    };
    
    // Only attach event listeners when game is loaded
    if (!isLoading && !error) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      containerRef.current.addEventListener('mousemove', handleMouseMove);
      containerRef.current.addEventListener('mousedown', handleMouseDown);
      containerRef.current.addEventListener('mouseup', handleMouseUp);
      containerRef.current.addEventListener('contextmenu', handleContextMenu);
    }
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (containerRef.current) {
        containerRef.current.removeEventListener('mousemove', handleMouseMove);
        containerRef.current.removeEventListener('mousedown', handleMouseDown);
        containerRef.current.removeEventListener('mouseup', handleMouseUp);
        containerRef.current.removeEventListener('contextmenu', handleContextMenu);
      }
    };
  }, [isLoading, error]);
  
  // Handle window focus/blur events
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (gameInstanceRef.current) {
        if (document.hidden) {
          gameInstanceRef.current.onBlur();
        } else {
          gameInstanceRef.current.onFocus();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
  
  // Change camera view mode
  const changeCameraMode = (mode) => {
    if (cameraRef.current) {
      cameraRef.current.setMode(mode);
    }
  };
  
  // Assign changeCameraMode to gameContext for use by other components
  useEffect(() => {
    if (gameInstanceRef.current) {
      gameInstanceRef.current.changeCameraMode = changeCameraMode;
    }
  }, []);
  
  // Render error state
  if (error) {
    return (
      <div 
        ref={containerRef}
        className="relative w-full h-full bg-slate-900 flex flex-col items-center justify-center"
      >
        <div className="text-red-500 text-xl font-bold mb-4">{error}</div>
        <button 
          className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }
  
  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
    >
      {/* Canvas will be appended here by Three.js */}
      
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
          <LoadingSpinner size="xl" label={loadingStage} />
          <div className="mt-8 w-64 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-500 transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
          <div className="mt-2 text-slate-400">
            {loadingProgress.toFixed(0)}%
          </div>
        </div>
      )}
    </div>
  );
};

GameCanvas.propTypes = {
  sessionId: PropTypes.string,
  onGameReady: PropTypes.func,
  onGameError: PropTypes.func,
  initialAircraftId: PropTypes.string,
  spectatingPlayerId: PropTypes.string,
};

export default GameCanvas;