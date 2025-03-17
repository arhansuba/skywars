import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useGameContext } from '../contexts/GameContext';

/**
 * In-game weapon selector wheel component.
 */
const WeaponSelector = ({
  onSelect,
  onClose,
  className = '',
}) => {
  const { gameInstance, gameState } = useGameContext();
  
  const [weapons, setWeapons] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  // Load available weapons
  useEffect(() => {
    if (!gameInstance) return;
    
    const aircraftWeapons = gameInstance.getAvailableWeapons();
    setWeapons(aircraftWeapons);
    
    // Set initial selection to current weapon
    const currentWeapon = gameState.currentWeapon;
    if (currentWeapon) {
      const index = aircraftWeapons.findIndex(w => w.id === currentWeapon.id);
      if (index >= 0) {
        setSelectedIndex(index);
      }
    }
  }, [gameInstance, gameState.currentWeapon]);
  
  // Track mouse movement
  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
      
      // Calculate wheel section from mouse position
      if (weapons.length > 0) {
        const rect = document.getElementById('weapon-wheel')?.getBoundingClientRect();
        if (!rect) return;
        
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Calculate angle from center to mouse
        const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
        const degrees = (angle * 180 / Math.PI + 360) % 360;
        
        // Determine selected weapon based on angle
        const sectionSize = 360 / weapons.length;
        const section = Math.floor(degrees / sectionSize);
        
        setSelectedIndex(section);
      }
    };
    
    const handleMouseUp = () => {
      // Select weapon on mouse up
      if (onSelect && weapons[selectedIndex]) {
        onSelect(weapons[selectedIndex]);
      }
      
      // Close selector
      if (onClose) {
        onClose();
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [weapons, selectedIndex, onSelect, onClose]);
  
  // No weapons available
  if (weapons.length === 0) {
    return null;
  }
  
  // Calculate positions for weapon segments
  const segments = weapons.map((weapon, index) => {
    const sectionSize = 360 / weapons.length;
    const angle = (index * sectionSize + sectionSize / 2) * Math.PI / 180;
    const isSelected = index === selectedIndex;
    
    // Calculate position for weapon icon
    const radius = isSelected ? 120 : 100;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    
    return {
      weapon,
      angle,
      x,
      y,
      isSelected,
    };
  });
  
  return (
    <div 
      className={`fixed inset-0 flex items-center justify-center z-40 cursor-none ${className}`}
    >
      {/* Darkened background */}
      <div className="absolute inset-0 bg-black/60" />
      
      {/* Weapon wheel */}
      <div 
        id="weapon-wheel"
        className="relative w-80 h-80 rounded-full"
      >
        {/* Weapon segments */}
        <svg className="absolute inset-0 w-full h-full" viewBox="-200 -200 400 400">
          {/* Background segments */}
          {weapons.map((weapon, index) => {
            const sectionSize = 360 / weapons.length;
            const startAngle = index * sectionSize;
            const endAngle = (index + 1) * sectionSize;
            
            // Calculate SVG arc path
            const startRad = (startAngle - 90) * Math.PI / 180;
            const endRad = (endAngle - 90) * Math.PI / 180;
            
            const startX = Math.cos(startRad) * 180;
            const startY = Math.sin(startRad) * 180;
            const endX = Math.cos(endRad) * 180;
            const endY = Math.sin(endRad) * 180;
            
            const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
            
            const pathData = [
              `M 0 0`,
              `L ${startX} ${startY}`,
              `A 180 180 0 ${largeArcFlag} 1 ${endX} ${endY}`,
              'Z'
            ].join(' ');
            
            const isSelected = index === selectedIndex;
            
            return (
              <path
                key={weapon.id}
                d={pathData}
                fill={isSelected ? 'rgba(14, 165, 233, 0.3)' : 'rgba(30, 41, 59, 0.5)'}
                stroke={isSelected ? 'rgba(14, 165, 233, 0.8)' : 'rgba(100, 116, 139, 0.5)'}
                strokeWidth="2"
                className="transition-all duration-150"
              />
            );
          })}
        </svg>
        
        {/* Center circle */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-slate-800/80 border-2 border-slate-700 flex items-center justify-center">
          {weapons[selectedIndex] && (
            <div className="text-center">
              <img 
                src={weapons[selectedIndex].icon} 
                alt={weapons[selectedIndex].name}
                className="w-10 h-10 mx-auto"
              />
              <div className="text-white font-medium text-sm mt-1">
                {weapons[selectedIndex].name}
              </div>
            </div>
          )}
        </div>
        
        {/* Weapon icons */}
        {segments.map((segment) => (
          <div
            key={segment.weapon.id}
            className={`absolute transition-all duration-150 ${
              segment.isSelected ? 'scale-125' : 'scale-100'
            }`}
            style={{
              top: '50%',
              left: '50%',
              transform: `translate(-50%, -50%) translate(${segment.x}px, ${segment.y}px)`,
            }}
          >
            <div 
              className={`flex flex-col items-center ${
                segment.isSelected ? 'opacity-100' : 'opacity-70'
              }`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                segment.isSelected ? 'bg-sky-900/80' : 'bg-slate-800/80'
              }`}>
                <img 
                  src={segment.weapon.icon} 
                  alt={segment.weapon.name}
                  className="w-8 h-8"
                />
              </div>
              
              {segment.isSelected && (
                <div className="text-white text-xs font-medium mt-1 bg-slate-900/80 px-2 py-0.5 rounded whitespace-nowrap">
                  {segment.weapon.name}
                  {segment.weapon.ammo !== undefined && (
                    <span className="ml-1 text-sky-400">
                      {segment.weapon.ammo}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {/* Custom cursor */}
        <div 
          className="fixed w-4 h-4 pointer-events-none"
          style={{
            top: mousePosition.y,
            left: mousePosition.x,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="7" fill="none" stroke="white" strokeWidth="2" />
            <circle cx="8" cy="8" r="1" fill="white" />
          </svg>
        </div>
      </div>
      
      {/* Instructions */}
      <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 text-white text-sm bg-slate-900/80 px-4 py-2 rounded-full">
        Release mouse button to select weapon
      </div>
    </div>
  );
};

WeaponSelector.propTypes = {
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  className: PropTypes.string,
};

export default WeaponSelector;