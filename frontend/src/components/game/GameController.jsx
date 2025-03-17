import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useGameContext } from '../contexts/GameContext';
import HUD from '../ui/HUD';
import Minimap from './Minimap';
import ChatOverlay from './ChatOverlay';
import ScorePanel from './ScorePanel';
import MatchSummary from './MatchSummary';

/**
 * Main controller component for in-game UI and state management.
 */
const GameController = ({
  onExit,
  onGameOver,
  className = '',
}) => {
  const { gameInstance, gameState } = useGameContext();
  
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [matchSummary, setMatchSummary] = useState(null);
  const [messages, setMessages] = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [hudData, setHudData] = useState({
    altitude: 0,
    speed: 0,
    health: 100,
    fuel: 100,
    heading: 0,
    score: 0,
    kills: 0,
    weaponStatus: { type: 'Guns', ammo: '∞' },
  });
  const [squadron, setSquadron] = useState(null);
  
  // Subscribe to game events
  useEffect(() => {
    if (!gameInstance) return;
    
    // Handle HUD updates
    const handleHudUpdate = (data) => {
      setHudData(data);
    };
    
    // Handle chat messages
    const handleChatMessage = (message) => {
      setMessages((prev) => [...prev, message]);
      
      // Remove messages after timeout
      setTimeout(() => {
        setMessages((prev) => prev.filter((m) => m !== message));
      }, 10000);
    };
    
    // Handle objectives update
    const handleObjectivesUpdate = (objectives) => {
      setObjectives(objectives);
    };
    
    // Handle match end
    const handleMatchEnd = (summary) => {
      setMatchSummary(summary);
      
      // Notify parent component
      if (onGameOver) {
        onGameOver(summary);
      }
    };
    
    // Handle squadron update
    const handleSquadronUpdate = (squadronData) => {
      setSquadron(squadronData);
    };
    
    // Register event listeners
    gameInstance.on('hud:update', handleHudUpdate);
    gameInstance.on('chat:message', handleChatMessage);
    gameInstance.on('objectives:update', handleObjectivesUpdate);
    gameInstance.on('match:end', handleMatchEnd);
    gameInstance.on('squadron:update', handleSquadronUpdate);
    
    // Cleanup
    return () => {
      gameInstance.off('hud:update', handleHudUpdate);
      gameInstance.off('chat:message', handleChatMessage);
      gameInstance.off('objectives:update', handleObjectivesUpdate);
      gameInstance.off('match:end', handleMatchEnd);
      gameInstance.off('squadron:update', handleSquadronUpdate);
    };
  }, [gameInstance, onGameOver]);
  
  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // TAB - Scoreboard
      if (e.key === 'Tab') {
        e.preventDefault();
        setShowScoreboard((prev) => !prev);
      }
      
      // M - Minimap zoom
      if (e.key === 'm') {
        // TODO: Implement minimap zoom
      }
      
      // V - Change camera view
      if (e.key === 'v' && gameInstance) {
        // Cycle through camera modes
        const modes = [
          'chase',
          'cockpit',
          'orbital',
          'cinematic',
        ];
        
        const currentMode = gameState.cameraMode || 'chase';
        const currentIndex = modes.indexOf(currentMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        
        gameInstance.changeCameraMode(modes[nextIndex]);
      }
    };
    
    const handleKeyUp = (e) => {
      // TAB release - Hide scoreboard
      if (e.key === 'Tab') {
        e.preventDefault();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameInstance, gameState.cameraMode]);
  
  // Handle objective click in HUD
  const handleObjectiveClick = (objective) => {
    if (gameInstance) {
      gameInstance.setWaypoint(objective.id);
    }
  };
  
  // Handle weapon change
  const handleWeaponChange = (weapon) => {
    if (gameInstance) {
      gameInstance.switchWeapon(weapon);
    }
  };
  
  // Handle play again
  const handlePlayAgain = () => {
    setMatchSummary(null);
    
    if (gameInstance) {
      gameInstance.restartMatch();
    }
  };
  
  return (
    <div className={`w-full h-full ${className}`}>
      {/* HUD */}
      <HUD
        altitude={hudData.altitude}
        speed={hudData.speed}
        health={hudData.health}
        fuel={hudData.fuel}
        heading={hudData.heading}
        score={hudData.score}
        kills={hudData.kills}
        messages={messages}
        weaponStatus={hudData.weaponStatus}
        objectives={objectives}
        squadron={squadron}
        onObjectiveClick={handleObjectiveClick}
        onWeaponChange={handleWeaponChange}
      />
      
      {/* Minimap */}
      <div className="absolute bottom-4 right-4 z-10">
        <Minimap
          size={200}
          showLabels={true}
          showTerrain={true}
        />
      </div>
      
      {/* Chat overlay */}
      <ChatOverlay
        position="bottom-left"
        initiallyOpen={false}
      />
      
      {/* Scoreboard */}
      <ScorePanel
        isVisible={showScoreboard}
        position="center"
        onClose={() => setShowScoreboard(false)}
      />
      
      {/* Match summary */}
      {matchSummary && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <MatchSummary
            matchData={matchSummary}
            onExit={onExit}
            onPlayAgain={handlePlayAgain}
          />
        </div>
      )}
    </div>
  );
};

GameController.propTypes = {
  onExit: PropTypes.func.isRequired,
  onGameOver: PropTypes.func,
  className: PropTypes.string,
};

export default GameController;