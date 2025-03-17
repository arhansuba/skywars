import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useGameContext } from '../contexts/GameContext';

/**
 * Minimap/Radar component for displaying aircraft positions.
 */
const Minimap = ({
  size = 200,
  scale = 1,
  range = 5000, // In game units
  showTerrain = true,
  showLabels = true,
  className = '',
}) => {
  const canvasRef = useRef(null);
  const { gameInstance, gameState } = useGameContext();
  const animationFrameRef = useRef(null);
  
  // Set up canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Set actual canvas size (for high DPI displays)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    
    // Scale all drawing operations
    ctx.scale(dpr, dpr);
    
    // Set canvas size through CSS
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    
    // Define render function
    const renderMinimap = () => {
      if (!gameInstance) return;
      
      // Clear canvas
      ctx.fillStyle = 'rgba(0, 20, 40, 0.7)';
      ctx.fillRect(0, 0, size, size);
      
      // Draw radar sweep effect
      drawRadarSweep(ctx);
      
      // Draw grid
      drawGrid(ctx);
      
      // Draw terrain if enabled
      if (showTerrain) {
        drawTerrain(ctx);
      }
      
      // Draw center position (player aircraft)
      const playerAircraft = gameInstance.getActiveAircraft();
      
      // Get entities from game state
      const entities = gameState?.entities || [];
      
      if (playerAircraft) {
        // Center map on player
        const playerPos = playerAircraft.position.clone();
        
        // Draw all entities
        entities.forEach(entity => {
          if (entity.type === 'aircraft') {
            drawAircraft(ctx, entity, playerPos);
          } else if (entity.type === 'missile') {
            drawMissile(ctx, entity, playerPos);
          } else if (entity.type === 'explosion') {
            drawExplosion(ctx, entity, playerPos);
          }
        });
        
        // Draw player aircraft in the center
        drawPlayerAircraft(ctx);
      } else {
        // No player aircraft, use fixed center position
        const centerPos = { x: 0, y: 0, z: 0 };
        
        // Draw all entities
        entities.forEach(entity => {
          if (entity.type === 'aircraft') {
            drawAircraft(ctx, entity, centerPos);
          } else if (entity.type === 'missile') {
            drawMissile(ctx, entity, centerPos);
          } else if (entity.type === 'explosion') {
            drawExplosion(ctx, entity, centerPos);
          }
        });
      }
      
      // Draw range rings
      drawRangeRings(ctx);
      
      // Draw cardinal directions
      drawDirections(ctx);
      
      // Continue animation
      animationFrameRef.current = requestAnimationFrame(renderMinimap);
    };
    
    // Draw radar sweep
    const drawRadarSweep = (ctx) => {
      const center = size / 2;
      const radius = size / 2 - 4;
      const sweep = (Date.now() / 2000) % (Math.PI * 2);
      
      ctx.save();
      ctx.translate(center, center);
      
      // Draw sweep line
      ctx.strokeStyle = 'rgba(32, 196, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(sweep) * radius, Math.sin(sweep) * radius);
      ctx.stroke();
      
      // Draw sweep gradient
      const gradient = ctx.createConicalGradient(0, 0, sweep);
      gradient.addColorStop(0, 'rgba(32, 196, 255, 0)');
      gradient.addColorStop(0.03, 'rgba(32, 196, 255, 0.1)');
      gradient.addColorStop(0.1, 'rgba(32, 196, 255, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, sweep - Math.PI / 8, sweep);
      ctx.lineTo(0, 0);
      ctx.fill();
      
      ctx.restore();
    };
    
    // Draw grid
    const drawGrid = (ctx) => {
      const center = size / 2;
      const gridSize = size / 10;
      
      ctx.strokeStyle = 'rgba(32, 196, 255, 0.2)';
      ctx.lineWidth = 1;
      
      // Draw vertical grid lines
      for (let x = 0; x < size; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size);
        ctx.stroke();
      }
      
      // Draw horizontal grid lines
      for (let y = 0; y < size; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
    };
    
    // Draw terrain
    const drawTerrain = (ctx) => {
      if (!gameInstance || !gameState) return;
      
      const terrain = gameState.terrain;
      if (!terrain) return;
      
      const center = size / 2;
      const player = gameInstance.getActiveAircraft();
      const playerPos = player ? player.position.clone() : { x: 0, y: 0, z: 0 };
      
      // Draw terrain features
      terrain.features.forEach(feature => {
        // Calculate screen position
        const dx = feature.x - playerPos.x;
        const dz = feature.z - playerPos.z;
        
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance > range) return; // Skip if out of range
        
        const screenX = center + (dx / range) * center;
        const screenY = center + (dz / range) * center;
        
        // Draw feature based on type
        if (feature.type === 'mountain') {
          ctx.fillStyle = 'rgba(120, 140, 160, 0.6)';
          ctx.beginPath();
          ctx.arc(screenX, screenY, 5 * scale, 0, Math.PI * 2);
          ctx.fill();
        } else if (feature.type === 'base') {
          ctx.fillStyle = 'rgba(0, 255, 0, 0.6)';
          ctx.beginPath();
          ctx.rect(screenX - 4, screenY - 4, 8, 8);
          ctx.fill();
        } else if (feature.type === 'objective') {
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(screenX, screenY, 6 * scale, 0, Math.PI * 2);
          ctx.stroke();
        }
        
        // Draw label if enabled
        if (showLabels && feature.name) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(feature.name, screenX, screenY + 15);
        }
      });
    };
    
    // Draw player aircraft in center
    const drawPlayerAircraft = (ctx) => {
      const center = size / 2;
      
      // Draw player aircraft triangle
      ctx.save();
      ctx.translate(center, center);
      
      // Rotate based on aircraft heading
      const aircraft = gameInstance.getActiveAircraft();
      const heading = aircraft?.rotation?.y || 0;
      ctx.rotate(heading);
      
      // Draw aircraft triangle
      ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';
      ctx.beginPath();
      ctx.moveTo(0, -6 * scale);
      ctx.lineTo(4 * scale, 6 * scale);
      ctx.lineTo(-4 * scale, 6 * scale);
      ctx.closePath();
      ctx.fill();
      
      // Draw circle around player
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 8 * scale, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.restore();
    };
    
    // Draw other aircraft
    const drawAircraft = (ctx, entity, playerPos) => {
      if (!entity.position) return;
      
      const center = size / 2;
      
      // Calculate screen position
      const dx = entity.position.x - playerPos.x;
      const dz = entity.position.z - playerPos.z;
      
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance > range) return; // Skip if out of range
      
      const screenX = center + (dx / range) * center;
      const screenY = center + (dz / range) * center;
      
      // Determine color based on IFF (Identification Friend or Foe)
      let color = 'rgba(255, 0, 0, 0.9)'; // Enemy default
      if (entity.team === gameState.playerTeam) {
        color = 'rgba(0, 255, 255, 0.9)'; // Friendly
      }
      
      // Draw aircraft icon
      ctx.save();
      ctx.translate(screenX, screenY);
      
      // Rotate based on aircraft heading
      if (entity.rotation) {
        ctx.rotate(entity.rotation.y || 0);
      }
      
      // Draw aircraft triangle
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -5 * scale);
      ctx.lineTo(3 * scale, 5 * scale);
      ctx.lineTo(-3 * scale, 5 * scale);
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
      
      // Draw label if enabled
      if (showLabels && entity.name) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(entity.name, screenX, screenY + 12);
        
        // Draw altitude
        if (entity.position.y) {
          const altitude = Math.round(entity.position.y) + 'ft';
          ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
          ctx.font = '8px monospace';
          ctx.fillText(altitude, screenX, screenY + 20);
        }
      }
    };
    
    // Draw missiles
    const drawMissile = (ctx, entity, playerPos) => {
      if (!entity.position) return;
      
      const center = size / 2;
      
      // Calculate screen position
      const dx = entity.position.x - playerPos.x;
      const dz = entity.position.z - playerPos.z;
      
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance > range) return; // Skip if out of range
      
      const screenX = center + (dx / range) * center;
      const screenY = center + (dz / range) * center;
      
      // Draw missile icon
      ctx.fillStyle = 'rgba(255, 255, 0, 0.9)';
      ctx.beginPath();
      ctx.arc(screenX, screenY, 2 * scale, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw missile trail
      if (entity.trail && entity.trail.length > 0) {
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        const firstPoint = entity.trail[0];
        const firstDx = firstPoint.x - playerPos.x;
        const firstDz = firstPoint.z - playerPos.z;
        const firstScreenX = center + (firstDx / range) * center;
        const firstScreenY = center + (firstDz / range) * center;
        
        ctx.moveTo(firstScreenX, firstScreenY);
        
        for (let i = 1; i < entity.trail.length; i++) {
          const point = entity.trail[i];
          const pointDx = point.x - playerPos.x;
          const pointDz = point.z - playerPos.z;
          const pointScreenX = center + (pointDx / range) * center;
          const pointScreenY = center + (pointDz / range) * center;
          
          ctx.lineTo(pointScreenX, pointScreenY);
        }
        
        ctx.lineTo(screenX, screenY);
        ctx.stroke();
      }
    };
    
    // Draw explosions
    const drawExplosion = (ctx, entity, playerPos) => {
      if (!entity.position) return;
      
      const center = size / 2;
      
      // Calculate screen position
      const dx = entity.position.x - playerPos.x;
      const dz = entity.position.z - playerPos.z;
      
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance > range) return; // Skip if out of range
      
      const screenX = center + (dx / range) * center;
      const screenY = center + (dz / range) * center;
      
      // Calculate explosion size based on age
      const maxSize = 12 * scale;
      const age = entity.age || 0; // 0-1 normalized age
      const size = maxSize * Math.min(age, 0.7);
      
      // Draw explosion
      const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, size);
      gradient.addColorStop(0, 'rgba(255, 200, 50, 0.8)');
      gradient.addColorStop(0.5, 'rgba(255, 100, 50, 0.5)');
      gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
      ctx.fill();
    };
    
    // Draw range rings
    const drawRangeRings = (ctx) => {
      const center = size / 2;
      
      ctx.strokeStyle = 'rgba(32, 196, 255, 0.3)';
      ctx.lineWidth = 1;
      
      // Draw outer ring (full range)
      ctx.beginPath();
      ctx.arc(center, center, center - 4, 0, Math.PI * 2);
      ctx.stroke();
      
      // Draw middle ring (half range)
      ctx.strokeStyle = 'rgba(32, 196, 255, 0.2)';
      ctx.beginPath();
      ctx.arc(center, center, (center - 4) / 2, 0, Math.PI * 2);
      ctx.stroke();
      
      // Draw inner ring (quarter range)
      ctx.strokeStyle = 'rgba(32, 196, 255, 0.1)';
      ctx.beginPath();
      ctx.arc(center, center, (center - 4) / 4, 0, Math.PI * 2);
      ctx.stroke();
    };
    
    // Draw cardinal directions
    const drawDirections = (ctx) => {
      const center = size / 2;
      const radius = center - 15;
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // North
      ctx.fillText('N', center, center - radius);
      
      // East
      ctx.fillText('E', center + radius, center);
      
      // South
      ctx.fillText('S', center, center + radius);
      
      // West
      ctx.fillText('W', center - radius, center);
    };
    
    // Start rendering
    renderMinimap();
    
    // Clean up
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameInstance, gameState, size, scale, range, showTerrain, showLabels]);
  
  return (
    <div 
      className={`relative rounded-full overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
      />
      
      {/* Overlay elements */}
      <div className="absolute inset-0 pointer-events-none border border-sky-800/50 rounded-full"></div>
    </div>
  );
};

Minimap.propTypes = {
  size: PropTypes.number,
  scale: PropTypes.number,
  range: PropTypes.number,
  showTerrain: PropTypes.bool,
  showLabels: PropTypes.bool,
  className: PropTypes.string,
};

export default Minimap;