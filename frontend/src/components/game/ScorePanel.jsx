import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useGameContext } from '../contexts/GameContext';

/**
 * In-game score panel showing player standings and match stats.
 */
const ScorePanel = ({
  isVisible = false,
  position = 'center',
  onClose,
  className = '',
}) => {
  const { gameInstance, gameState } = useGameContext();
  
  const [scoreboard, setScoreboard] = useState({
    teams: [],
    players: [],
    matchInfo: {
      timeRemaining: 0,
      matchType: '',
      mapName: '',
    },
  });
  
  // Position styling
  const positionStyles = {
    'top': 'top-5 left-1/2 -translate-x-1/2',
    'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    'bottom': 'bottom-5 left-1/2 -translate-x-1/2',
  };
  
  // Load scoreboard data
  useEffect(() => {
    if (!gameInstance || !isVisible) return;
    
    const fetchScoreboard = async () => {
      const scoreboardData = await gameInstance.getScoreboard();
      setScoreboard(scoreboardData);
    };
    
    fetchScoreboard();
    
    // Refresh scoreboard every second
    const interval = setInterval(fetchScoreboard, 1000);
    
    return () => clearInterval(interval);
  }, [gameInstance, isVisible]);
  
  // Format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Handle keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Tab' && isVisible) {
        e.preventDefault();
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVisible, onClose]);
  
  if (!isVisible) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-30">
      <div 
        className={`absolute ${positionStyles[position]} bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-lg shadow-xl overflow-hidden max-h-[90vh] ${className}`}
        style={{ width: '800px', maxWidth: '90vw' }}
      >
        {/* Header */}
        <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center">
          <div>
            <h2 className="text-white text-lg font-bold">Scoreboard</h2>
            <div className="text-slate-400 text-sm">
              {scoreboard.matchInfo.matchType} • {scoreboard.matchInfo.mapName} • Time Remaining: {formatTime(scoreboard.matchInfo.timeRemaining)}
            </div>
          </div>
          
          <button
            className="text-slate-400 hover:text-white"
            onClick={onClose}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Team scores (if team-based mode) */}
        {scoreboard.teams.length > 0 && (
          <div className="p-4 border-b border-slate-700 grid grid-cols-2 gap-4">
            {scoreboard.teams.map((team) => (
              <div 
                key={team.id}
                className={`p-3 rounded-md ${
                  team.id === gameState.playerTeam
                    ? 'bg-sky-900/30 border border-sky-700'
                    : 'bg-slate-800/50 border border-slate-700'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <div 
                      className="w-4 h-4 rounded-full mr-2"
                      style={{ backgroundColor: team.color }}
                    ></div>
                    <span className="text-white font-medium">{team.name}</span>
                  </div>
                  <div className="text-xl font-bold text-white">{team.score}</div>
                </div>
                
                <div className="grid grid-cols-3 gap-2 mt-2 text-sm text-slate-300">
                  <div>Players: {team.playerCount}</div>
                  <div>Kills: {team.kills}</div>
                  <div>Deaths: {team.deaths}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Player scores */}
        <div className="p-4 max-h-[50vh] overflow-y-auto">
          <table className="w-full">
            <thead className="text-left text-sm text-slate-400 border-b border-slate-700">
              <tr>
                <th className="pb-2 pl-2">Rank</th>
                <th className="pb-2">Player</th>
                <th className="pb-2 text-right">Score</th>
                <th className="pb-2 text-right">Kills</th>
                <th className="pb-2 text-right">Deaths</th>
                <th className="pb-2 text-right">K/D</th>
                <th className="pb-2 text-right">Ping</th>
              </tr>
            </thead>
            <tbody>
              {scoreboard.players.map((player, index) => {
                const isCurrentPlayer = player.id === gameState?.playerId;
                const team = scoreboard.teams.find(t => t.id === player.teamId);
                
                return (
                  <tr 
                    key={player.id}
                    className={`border-b border-slate-800 ${
                      isCurrentPlayer ? 'bg-sky-900/20' : index % 2 === 0 ? 'bg-slate-800/10' : ''
                    }`}
                  >
                    <td className="py-3 pl-2">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-white">
                        {index + 1}
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center">
                        {team && (
                          <div 
                            className="w-3 h-3 rounded-full mr-2"
                            style={{ backgroundColor: team.color }}
                          ></div>
                        )}
                        <span className={`font-medium ${isCurrentPlayer ? 'text-sky-400' : 'text-white'}`}>
                          {player.name}
                        </span>
                        {player.status === 'dead' && (
                          <span className="ml-2 text-xs text-red-400">DEAD</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-right text-white">{player.score.toLocaleString()}</td>
                    <td className="py-3 text-right text-green-400">{player.kills}</td>
                    <td className="py-3 text-right text-red-400">{player.deaths}</td>
                    <td className="py-3 text-right text-white">
                      {player.deaths === 0 ? player.kills : (player.kills / player.deaths).toFixed(2)}
                    </td>
                    <td className="py-3 text-right">
                      <span 
                        className={`${
                          player.ping < 50 ? 'text-green-400' :
                          player.ping < 100 ? 'text-yellow-400' :
                          'text-red-400'
                        }`}
                      >
                        {player.ping} ms
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Footer */}
        <div className="bg-slate-800/50 p-3 text-center text-slate-400 text-sm">
          Press TAB to close this window
        </div>
      </div>
    </div>
  );
};

ScorePanel.propTypes = {
  isVisible: PropTypes.bool,
  position: PropTypes.oneOf(['top', 'center', 'bottom']),
  onClose: PropTypes.func.isRequired,
  className: PropTypes.string,
};

export default ScorePanel;