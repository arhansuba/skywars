import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * Heads-Up Display component for in-game information.
 */
const HUD = ({
  altitude = 0,
  speed = 0,
  health = 100,
  fuel = 100,
  heading = 0,
  score = 0,
  kills = 0,
  messages = [],
  weaponStatus = { type: 'Guns', ammo: '∞' },
  objectives = [],
  radarData = [],
  squadron = null,
  onObjectiveClick,
  onWeaponChange,
}) => {
  const [visibleMessages, setVisibleMessages] = useState([]);
  
  // Handle new messages
  useEffect(() => {
    if (messages.length > 0) {
      // Add new messages to visible messages
      setVisibleMessages(prev => [...prev, ...messages]);
      
      // Remove messages after 5 seconds
      const timeoutId = setTimeout(() => {
        setVisibleMessages(prev => prev.slice(messages.length));
      }, 5000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [messages]);
  
  // Calculate health and fuel indicators
  const healthColor = health > 70 ? 'bg-green-500' : health > 30 ? 'bg-yellow-500' : 'bg-red-500';
  const fuelColor = fuel > 50 ? 'bg-sky-500' : fuel > 20 ? 'bg-yellow-500' : 'bg-red-500';
  
  return (
    <div className="fixed inset-0 pointer-events-none z-20 font-mono">
      {/* Top Bar - Vitals */}
      <div className="absolute top-0 left-0 right-0 flex justify-between px-6 py-2 bg-slate-900/50 backdrop-blur-sm">
        {/* Left side - Player status */}
        <div className="flex items-center space-x-6">
          <div className="flex flex-col">
            <span className="text-xs text-slate-400">HEALTH</span>
            <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full ${healthColor}`} style={{ width: `${health}%` }}></div>
            </div>
          </div>
          
          <div className="flex flex-col">
            <span className="text-xs text-slate-400">FUEL</span>
            <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full ${fuelColor}`} style={{ width: `${fuel}%` }}></div>
            </div>
          </div>
          
          <div className="flex flex-col">
            <span className="text-xs text-slate-400">WEAPON</span>
            <div className="flex items-center space-x-2">
              <span className="text-white text-sm">{weaponStatus.type}</span>
              <span className="text-sky-400 text-sm">{weaponStatus.ammo}</span>
            </div>
          </div>
        </div>
        
        {/* Right side - Score */}
        <div className="flex items-center space-x-6">
          <div className="flex flex-col items-end">
            <span className="text-xs text-slate-400">SCORE</span>
            <span className="text-white text-lg">{score.toLocaleString()}</span>
          </div>
          
          <div className="flex flex-col items-end">
            <span className="text-xs text-slate-400">KILLS</span>
            <span className="text-white text-lg">{kills}</span>
          </div>
        </div>
      </div>
      
      {/* Left Bar - Flight data */}
      <div className="absolute top-16 left-0 bg-slate-900/50 backdrop-blur-sm p-4 rounded-tr-lg rounded-br-lg">
        <div className="flex flex-col space-y-3">
          <div>
            <span className="text-xs text-slate-400">ALTITUDE</span>
            <div className="text-white text-xl">{altitude.toLocaleString()} ft</div>
          </div>
          
          <div>
            <span className="text-xs text-slate-400">SPEED</span>
            <div className="text-white text-xl">{speed.toLocaleString()} kts</div>
          </div>
          
          <div>
            <span className="text-xs text-slate-400">HEADING</span>
            <div className="text-white text-xl">{heading.toFixed(0)}°</div>
          </div>
        </div>
      </div>
      
      {/* Right Bar - Objectives */}
      <div className="absolute top-16 right-0 bg-slate-900/50 backdrop-blur-sm p-4 rounded-tl-lg rounded-bl-lg max-w-xs">
        <div className="flex flex-col space-y-1">
          <span className="text-xs text-slate-400 mb-1">OBJECTIVES</span>
          
          {objectives.map((objective, index) => (
            <div 
              key={index}
              className={`flex items-center space-x-2 ${objective.active ? 'cursor-pointer pointer-events-auto' : ''}`}
              onClick={() => objective.active && onObjectiveClick(objective)}
            >
              <div className={`w-2 h-2 rounded-full ${objective.completed ? 'bg-green-500' : objective.active ? 'bg-sky-500' : 'bg-slate-500'}`}></div>
              <span className={`text-sm ${objective.completed ? 'text-green-400 line-through' : objective.active ? 'text-white' : 'text-slate-400'}`}>
                {objective.text}
              </span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Squadron Info */}
      {squadron && (
        <div className="absolute bottom-4 right-4 bg-slate-900/50 backdrop-blur-sm p-3 rounded-lg">
          <div className="flex flex-col">
            <span className="text-xs text-slate-400">SQUADRON</span>
            <span className="text-white text-sm">{squadron.name}</span>
            
            <div className="mt-2 space-y-1">
              {squadron.members.map((member, index) => (
                <div key={index} className="flex items-center space-x-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${member.online ? 'bg-green-500' : 'bg-slate-500'}`}></div>
                  <span className={`text-xs ${member.isPlayer ? 'text-sky-400' : 'text-white'}`}>
                    {member.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Messages Feed */}
      <div className="absolute bottom-4 left-4 w-1/3 max-h-1/3 overflow-hidden">
        <div className="flex flex-col space-y-1">
          {visibleMessages.map((message, index) => (
            <div 
              key={index} 
              className={`p-1.5 rounded animate-fadeIn ${
                message.type === 'system' ? 'bg-slate-900/70 text-sky-400' :
                message.type === 'alert' ? 'bg-red-900/70 text-white' :
                message.type === 'squad' ? 'bg-green-900/70 text-white' :
                'bg-slate-900/50 text-white'
              }`}
            >
              {message.sender && (
                <span className="font-bold mr-1">{message.sender}:</span>
              )}
              {message.text}
            </div>
          ))}
        </div>
      </div>
      
      {/* Center indicators (only show temporarily) */}
      {/* This would be implemented with animations for damage, lock-on warnings, etc. */}
    </div>
  );
};

HUD.propTypes = {
  altitude: PropTypes.number,
  speed: PropTypes.number,
  health: PropTypes.number,
  fuel: PropTypes.number,
  heading: PropTypes.number,
  score: PropTypes.number,
  kills: PropTypes.number,
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      text: PropTypes.string.isRequired,
      type: PropTypes.oneOf(['system', 'chat', 'alert', 'squad']),
      sender: PropTypes.string,
    })
  ),
  weaponStatus: PropTypes.shape({
    type: PropTypes.string,
    ammo: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }),
  objectives: PropTypes.arrayOf(
    PropTypes.shape({
      text: PropTypes.string.isRequired,
      completed: PropTypes.bool,
      active: PropTypes.bool,
    })
  ),
  radarData: PropTypes.array,
  squadron: PropTypes.object,
  onObjectiveClick: PropTypes.func,
  onWeaponChange: PropTypes.func,
};

export default HUD;