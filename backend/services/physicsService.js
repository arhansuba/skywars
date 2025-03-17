/**
 * Physics Service for SkyWars
 * 
 * Provides physics calculations, movement validation, and collision
 * detection for the multiplayer plane game.
 */

const logger = require('../utils/logger');
const gameService = require('./gameService');

// Physics constants
const PHYSICS_CONSTANTS = {
  GRAVITY: 9.81, // m/s²
  AIR_DENSITY: 1.225, // kg/m³
  MAX_SPEED: {
    FIGHTER: 350, // m/s
    BOMBER: 250,  // m/s
    INTERCEPTOR: 400, // m/s
    SCOUT: 300,   // m/s
    DEFAULT: 300  // m/s
  },
  MAX_ACCELERATION: {
    FIGHTER: 50,     // m/s²
    BOMBER: 30,      // m/s²
    INTERCEPTOR: 60, // m/s²
    SCOUT: 40,       // m/s²
    DEFAULT: 40      // m/s²
  },
  TURN_RATE: {
    FIGHTER: 1.5,     // rad/s
    BOMBER: 0.8,      // rad/s
    INTERCEPTOR: 2.0, // rad/s
    SCOUT: 1.8,       // rad/s
    DEFAULT: 1.5      // rad/s
  },
  LIFT_COEFFICIENT: 0.15,
  DRAG_COEFFICIENT: 0.05,
  BOOST_MULTIPLIER: 1.5,
  COLLISION_DAMAGE_MULTIPLIER: 0.2, // Damage as percentage of relative speed
  PROJECTILE_SPEED: 500, // m/s
  MISSILE_SPEED: 300,    // m/s
  PROJECTILE_LIFETIME: 3000, // ms
  MISSILE_LIFETIME: 10000,   // ms
};

// Aircraft specifications
const AIRCRAFT_SPECS = {
  FIGHTER: {
    mass: 10000,  // kg
    hitbox: {     // hitbox dimensions in meters
      length: 15,
      width: 10,
      height: 3
    },
    maxHealth: 100,
    maxFuel: 100,
    fuelConsumption: 0.05, // per second
    weaponCooldown: 200,   // ms
    missileCooldown: 3000, // ms
  },
  BOMBER: {
    mass: 20000,  // kg
    hitbox: {
      length: 25,
      width: 30,
      height: 5
    },
    maxHealth: 150,
    maxFuel: 150,
    fuelConsumption: 0.08,
    weaponCooldown: 300,
    missileCooldown: 5000,
  },
  INTERCEPTOR: {
    mass: 8000,   // kg
    hitbox: {
      length: 12,
      width: 8,
      height: 2.5
    },
    maxHealth: 80,
    maxFuel: 80,
    fuelConsumption: 0.07,
    weaponCooldown: 150,
    missileCooldown: 4000,
  },
  SCOUT: {
    mass: 6000,   // kg
    hitbox: {
      length: 10,
      width: 7,
      height: 2
    },
    maxHealth: 70,
    maxFuel: 120,
    fuelConsumption: 0.04,
    weaponCooldown: 250,
    missileCooldown: 6000,
  },
  DEFAULT: {
    mass: 10000,
    hitbox: {
      length: 15,
      width: 10,
      height: 3
    },
    maxHealth: 100,
    maxFuel: 100,
    fuelConsumption: 0.05,
    weaponCooldown: 200,
    missileCooldown: 3000,
  }
};

/**
 * Validate player movement
 * @param {Object} currentPosition - Current position {x, y, z}
 * @param {Object} newPosition - New position {x, y, z}
 * @param {Object} velocity - Velocity vector {x, y, z}
 * @param {number} lastUpdateTime - Last update timestamp
 * @param {number} currentTime - Current timestamp
 * @returns {Object} Validated position and velocity
 */
const validateMovement = (currentPosition, newPosition, velocity, lastUpdateTime, currentTime) => {
  try {
    // Calculate time delta in seconds
    const deltaTime = (currentTime - lastUpdateTime) / 1000;
    
    // Skip validation for very small time differences
    if (deltaTime < 0.001) {
      return {
        position: newPosition,
        velocity: velocity,
        valid: true
      };
    }
    
    // Calculate maximum movement distance based on velocity and time
    const maxSpeed = PHYSICS_CONSTANTS.MAX_SPEED.DEFAULT; // Use default or adjust based on aircraft type
    const maxDistance = maxSpeed * deltaTime;
    
    // Calculate actual distance moved
    const distance = calculateDistance(currentPosition, newPosition);
    
    // If movement exceeds maximum possible distance, reject or adjust
    if (distance > maxDistance * 1.2) { // Allow 20% buffer for network jitter
      logger.debug(`Movement exceeded maximum distance: ${distance.toFixed(2)}m > ${maxDistance.toFixed(2)}m`);
      
      // Calculate adjusted position (this is a simplification)
      const direction = {
        x: newPosition.x - currentPosition.x,
        y: newPosition.y - currentPosition.y,
        z: newPosition.z - currentPosition.z
      };
      
      // Normalize direction vector
      const dirLength = Math.sqrt(
        direction.x * direction.x +
        direction.y * direction.y +
        direction.z * direction.z
      );
      
      if (dirLength > 0) {
        direction.x /= dirLength;
        direction.y /= dirLength;
        direction.z /= dirLength;
      }
      
      // Calculate adjusted position
      const adjustedPosition = {
        x: currentPosition.x + direction.x * maxDistance,
        y: currentPosition.y + direction.y * maxDistance,
        z: currentPosition.z + direction.z * maxDistance
      };
      
      return {
        position: adjustedPosition,
        velocity: velocity, // Keep the requested velocity
        valid: false
      };
    }
    
    // Validate velocity (check for unrealistic acceleration)
    const maxAcceleration = PHYSICS_CONSTANTS.MAX_ACCELERATION.DEFAULT * deltaTime;
    
    // Check acceleration by comparing velocities (if previous velocity is available)
    // This is a simplification; real aircraft physics would be more complex
    
    // Additional checks can be added here, like terrain collision
    
    return {
      position: newPosition,
      velocity: velocity,
      valid: true
    };
  } catch (error) {
    logger.error(`Error validating movement: ${error.message}`);
    // If validation fails, return the current position as a fallback
    return {
      position: currentPosition,
      velocity: velocity,
      valid: false
    };
  }
};

/**
 * Calculate distance between two points
 * @param {Object} pointA - First point {x, y, z}
 * @param {Object} pointB - Second point {x, y, z}
 * @returns {number} Distance in meters
 */
const calculateDistance = (pointA, pointB) => {
  return Math.sqrt(
    Math.pow(pointB.x - pointA.x, 2) +
    Math.pow(pointB.y - pointA.y, 2) +
    Math.pow(pointB.z - pointA.z, 2)
  );
};

/**
 * Detect collisions for a player
 * @param {string} gameId - Game ID
 * @param {string} playerId - Player ID
 * @param {Object} position - Player position {x, y, z}
 * @param {Object} gameState - Current game state
 * @returns {Array} Array of collision objects
 */
const detectCollisions = (gameId, playerId, position, gameState) => {
  if (!gameState) return [];
  
  const collisions = [];
  
  try {
    // Get player state
    const playerState = gameState.players.get(playerId);
    if (!playerState) return [];
    
    // Get player aircraft type
    const aircraftType = playerState.aircraft || 'DEFAULT';
    
    // Get aircraft hitbox dimensions
    const aircraft = AIRCRAFT_SPECS[aircraftType.toUpperCase()] || AIRCRAFT_SPECS.DEFAULT;
    const hitbox = aircraft.hitbox;
    
    // 1. Check for terrain collisions
    if (gameState.mapConfig) {
      const terrainCollision = detectTerrainCollision(position, hitbox, gameState.mapConfig);
      if (terrainCollision) {
        collisions.push(terrainCollision);
      }
    }
    
    // 2. Check for boundary collisions
    if (gameState.mapConfig && gameState.mapConfig.boundaries) {
      const boundaryCollision = detectBoundaryCollision(position, gameState.mapConfig.boundaries);
      if (boundaryCollision) {
        collisions.push(boundaryCollision);
      }
    }
    
    // 3. Check for collisions with other players
    gameState.players.forEach((otherPlayerState, otherPlayerId) => {
      // Skip self
      if (otherPlayerId === playerId) return;
      
      // Get other player's aircraft type and hitbox
      const otherAircraftType = otherPlayerState.aircraft || 'DEFAULT';
      const otherAircraft = AIRCRAFT_SPECS[otherAircraftType.toUpperCase()] || AIRCRAFT_SPECS.DEFAULT;
      const otherHitbox = otherAircraft.hitbox;
      
      // Check for collision
      const playerCollision = detectPlayerCollision(
        position, hitbox,
        otherPlayerState.position, otherHitbox,
        playerState.velocity, otherPlayerState.velocity,
        otherPlayerId
      );
      
      if (playerCollision) {
        collisions.push(playerCollision);
      }
    });
    
    // 4. Check for collisions with projectiles
    gameState.projectiles.forEach((projectile, projectileId) => {
      // Skip own projectiles
      if (projectile.ownerId === playerId) return;
      
      // Check for collision
      const projectileCollision = detectProjectileCollision(
        position, hitbox,
        projectile.position, projectileId,
        projectile.type || 'bullet'
      );
      
      if (projectileCollision) {
        collisions.push(projectileCollision);
      }
    });
    
    return collisions;
  } catch (error) {
    logger.error(`Error detecting collisions: ${error.message}`);
    return [];
  }
};

/**
 * Detect terrain collision
 * @param {Object} position - Player position {x, y, z}
 * @param {Object} hitbox - Hitbox dimensions {length, width, height}
 * @param {Object} mapConfig - Map configuration
 * @returns {Object|null} Collision object or null
 */
const detectTerrainCollision = (position, hitbox, mapConfig) => {
  // This is a simplified terrain collision check
  // In a real game, you'd use more sophisticated terrain detection
  
  // Check if below terrain height
  if (position.y <= 0) {
    return {
      type: 'terrain',
      position: { x: position.x, y: 0, z: position.z },
      normal: { x: 0, y: 1, z: 0 },
      terrainType: 'ground',
      severity: 1.0 // Maximum severity
    };
  }
  
  // Check for terrain features (simplified example)
  if (mapConfig.terrain === 'mountains') {
    // Simple mountain detection algorithm
    // This is just an example; in a real game, you'd use a heightmap or more complex terrain system
    
    // Generate a simple mountain height based on x,z position (using a sine wave)
    const mountainHeight = 
      Math.max(0, 200 * Math.sin(position.x / 500) * Math.sin(position.z / 500));
    
    if (position.y <= mountainHeight) {
      return {
        type: 'terrain',
        position: { x: position.x, y: mountainHeight, z: position.z },
        normal: { x: 0, y: 1, z: 0 }, // Simplified normal
        terrainType: 'mountain',
        severity: Math.min(1.0, (mountainHeight - position.y + 10) / 50)
      };
    }
  }
  
  // No terrain collision
  return null;
};

/**
 * Detect boundary collision
 * @param {Object} position - Player position {x, y, z}
 * @param {Object} boundaries - Map boundaries {minX, maxX, minY, maxY, minZ, maxZ}
 * @returns {Object|null} Collision object or null
 */
const detectBoundaryCollision = (position, boundaries) => {
  // Check if outside map boundaries
  if (position.x < boundaries.minX || position.x > boundaries.maxX ||
      position.y < boundaries.minY || position.y > boundaries.maxY ||
      position.z < boundaries.minZ || position.z > boundaries.maxZ) {
    
    // Determine which boundary was hit
    let normal = { x: 0, y: 0, z: 0 };
    let collisionPoint = { ...position };
    
    if (position.x < boundaries.minX) {
      normal.x = 1;
      collisionPoint.x = boundaries.minX;
    } else if (position.x > boundaries.maxX) {
      normal.x = -1;
      collisionPoint.x = boundaries.maxX;
    }
    
    if (position.y < boundaries.minY) {
      normal.y = 1;
      collisionPoint.y = boundaries.minY;
    } else if (position.y > boundaries.maxY) {
      normal.y = -1;
      collisionPoint.y = boundaries.maxY;
    }
    
    if (position.z < boundaries.minZ) {
      normal.z = 1;
      collisionPoint.z = boundaries.minZ;
    } else if (position.z > boundaries.maxZ) {
      normal.z = -1;
      collisionPoint.z = boundaries.maxZ;
    }
    
    return {
      type: 'boundary',
      position: collisionPoint,
      normal,
      boundaryName: 'map_edge',
      // Calculate severity based on distance outside boundary
      severity: 0.5 // Medium severity
    };
  }
  
  // No boundary collision
  return null;
};

/**
 * Detect collision between two players
 * @param {Object} positionA - First player position {x, y, z}
 * @param {Object} hitboxA - First player hitbox {length, width, height}
 * @param {Object} positionB - Second player position {x, y, z}
 * @param {Object} hitboxB - Second player hitbox {length, width, height}
 * @param {Object} velocityA - First player velocity {x, y, z}
 * @param {Object} velocityB - Second player velocity {x, y, z}
 * @param {string} otherPlayerId - Other player ID
 * @returns {Object|null} Collision object or null
 */
const detectPlayerCollision = (positionA, hitboxA, positionB, hitboxB, velocityA, velocityB, otherPlayerId) => {
  // Calculate rectangular bounding box for each aircraft
  // This is a simplified collision check using axis-aligned bounding boxes (AABB)
  
  // Calculate half-dimensions
  const halfLengthA = hitboxA.length / 2;
  const halfWidthA = hitboxA.width / 2;
  const halfHeightA = hitboxA.height / 2;
  
  const halfLengthB = hitboxB.length / 2;
  const halfWidthB = hitboxB.width / 2;
  const halfHeightB = hitboxB.height / 2;
  
  // Check for overlap in all three axes
  const overlapX = Math.abs(positionA.x - positionB.x) < (halfLengthA + halfLengthB);
  const overlapY = Math.abs(positionA.y - positionB.y) < (halfHeightA + halfHeightB);
  const overlapZ = Math.abs(positionA.z - positionB.z) < (halfWidthA + halfWidthB);
  
  // If overlapping in all axes, there's a collision
  if (overlapX && overlapY && overlapZ) {
    // Calculate relative velocity
    const relativeVelocity = {
      x: velocityA.x - velocityB.x,
      y: velocityA.y - velocityB.y,
      z: velocityA.z - velocityB.z
    };
    
    // Calculate relative speed (magnitude of relative velocity)
    const relativeSpeed = Math.sqrt(
      relativeVelocity.x * relativeVelocity.x +
      relativeVelocity.y * relativeVelocity.y +
      relativeVelocity.z * relativeVelocity.z
    );
    
    // Calculate collision normal (direction from A to B)
    const direction = {
      x: positionB.x - positionA.x,
      y: positionB.y - positionA.y,
      z: positionB.z - positionA.z
    };
    
    // Normalize direction
    const distance = Math.sqrt(
      direction.x * direction.x +
      direction.y * direction.y +
      direction.z * direction.z
    );
    
    const normal = {
      x: direction.x / distance,
      y: direction.y / distance,
      z: direction.z / distance
    };
    
    // Calculate collision point (average of the two positions)
    const collisionPoint = {
      x: (positionA.x + positionB.x) / 2,
      y: (positionA.y + positionB.y) / 2,
      z: (positionA.z + positionB.z) / 2
    };
    
    return {
      type: 'player',
      position: collisionPoint,
      normal,
      otherPlayerId,
      relativeSpeed,
      // Calculate severity based on relative speed
      severity: Math.min(1.0, relativeSpeed / 200) // Normalize to 0-1 range
    };
  }
  
  // No collision
  return null;
};

/**
 * Detect collision with a projectile
 * @param {Object} position - Player position {x, y, z}
 * @param {Object} hitbox - Player hitbox {length, width, height}
 * @param {Object} projectilePosition - Projectile position {x, y, z}
 * @param {string} projectileId - Projectile ID
 * @param {string} projectileType - Projectile type ('bullet', 'missile', etc.)
 * @returns {Object|null} Collision object or null
 */
const detectProjectileCollision = (position, hitbox, projectilePosition, projectileId, projectileType) => {
  // Calculate distance from projectile to player center
  const distance = calculateDistance(position, projectilePosition);
  
  // Calculate collision radius (simplified as half the smallest dimension)
  const collisionRadius = Math.min(hitbox.length, hitbox.width, hitbox.height) / 2;
  
  // For missiles, use a larger hit radius
  const projectileRadius = projectileType === 'missile' ? 2 : 0.5; // meters
  
  // Check if distance is less than sum of radii
  if (distance < collisionRadius + projectileRadius) {
    // Calculate direction from projectile to player
    const direction = {
      x: position.x - projectilePosition.x,
      y: position.y - projectilePosition.y,
      z: position.z - projectilePosition.z
    };
    
    // Normalize direction
    const normal = {
      x: direction.x / distance,
      y: direction.y / distance,
      z: direction.z / distance
    };
    
    return {
      type: 'projectile',
      position: projectilePosition,
      normal,
      projectileId,
      projectileType,
      // Always high severity for projectiles
      severity: 0.8
    };
  }
  
  // No collision
  return null;
};

/**
 * Calculate realistic aircraft movement
 * @param {Object} position - Current position {x, y, z}
 * @param {Object} rotation - Current rotation {x, y, z}
 * @param {Object} velocity - Current velocity {x, y, z}
 * @param {Object} controls - Control inputs {throttle, yaw, pitch, roll}
 * @param {string} aircraftType - Aircraft type
 * @param {number} deltaTime - Time step in seconds
 * @returns {Object} Updated position, rotation, and velocity
 */
const calculateAircraftMovement = (position, rotation, velocity, controls, aircraftType, deltaTime) => {
  try {
    // Get aircraft specifications
    const aircraft = AIRCRAFT_SPECS[aircraftType.toUpperCase()] || AIRCRAFT_SPECS.DEFAULT;
    const mass = aircraft.mass;
    
    // Get movement constraints
    const maxSpeed = PHYSICS_CONSTANTS.MAX_SPEED[aircraftType.toUpperCase()] || PHYSICS_CONSTANTS.MAX_SPEED.DEFAULT;
    const maxAcceleration = PHYSICS_CONSTANTS.MAX_ACCELERATION[aircraftType.toUpperCase()] || PHYSICS_CONSTANTS.MAX_ACCELERATION.DEFAULT;
    const turnRate = PHYSICS_CONSTANTS.TURN_RATE[aircraftType.toUpperCase()] || PHYSICS_CONSTANTS.TURN_RATE.DEFAULT;
    
    // Apply boost if active
    const boostMultiplier = controls.boost ? PHYSICS_CONSTANTS.BOOST_MULTIPLIER : 1.0;
    
    // Update rotation based on control inputs
    let newRotation = { ...rotation };
    
    // Apply yaw (rotation around y-axis)
    newRotation.y += controls.yaw * turnRate * deltaTime;
    
    // Apply pitch (rotation around x-axis)
    newRotation.x += controls.pitch * turnRate * deltaTime;
    
    // Apply roll (rotation around z-axis)
    newRotation.z += controls.roll * turnRate * deltaTime;
    
    // Normalize rotation angles to prevent overflow
    newRotation.x = normalizeAngle(newRotation.x);
    newRotation.y = normalizeAngle(newRotation.y);
    newRotation.z = normalizeAngle(newRotation.z);
    
    // Calculate forward direction vector based on rotation
    const forwardVector = calculateForwardVector(newRotation);
    
    // Calculate acceleration from throttle
    const throttleAcceleration = controls.throttle * maxAcceleration * boostMultiplier;
    
    // Apply acceleration in forward direction
    const acceleration = {
      x: forwardVector.x * throttleAcceleration,
      y: forwardVector.y * throttleAcceleration,
      z: forwardVector.z * throttleAcceleration
    };
    
    // Apply gravity (simplified)
    acceleration.y -= PHYSICS_CONSTANTS.GRAVITY;
    
    // Calculate lift (simplified)
    const speed = Math.sqrt(
      velocity.x * velocity.x +
      velocity.y * velocity.y +
      velocity.z * velocity.z
    );
    
    // Lift is perpendicular to velocity and stronger at higher speeds
    if (speed > 0) {
      const liftForce = 0.5 * PHYSICS_CONSTANTS.AIR_DENSITY * speed * speed * 
                        PHYSICS_CONSTANTS.LIFT_COEFFICIENT * Math.abs(Math.cos(newRotation.x));
      
      const liftAcceleration = liftForce / mass;
      
      // Apply lift in up direction (simplified)
      acceleration.y += liftAcceleration;
    }
    
    // Calculate drag (simplified)
    if (speed > 0) {
      const dragForce = 0.5 * PHYSICS_CONSTANTS.AIR_DENSITY * speed * speed * 
                       PHYSICS_CONSTANTS.DRAG_COEFFICIENT;
      
      const dragAcceleration = dragForce / mass;
      
      // Apply drag opposite to velocity direction
      acceleration.x -= (velocity.x / speed) * dragAcceleration;
      acceleration.y -= (velocity.y / speed) * dragAcceleration;
      acceleration.z -= (velocity.z / speed) * dragAcceleration;
    }
    
    // Update velocity
    let newVelocity = {
      x: velocity.x + acceleration.x * deltaTime,
      y: velocity.y + acceleration.y * deltaTime,
      z: velocity.z + acceleration.z * deltaTime
    };
    
    // Clamp velocity to maximum speed
    const newSpeed = Math.sqrt(
      newVelocity.x * newVelocity.x +
      newVelocity.y * newVelocity.y +
      newVelocity.z * newVelocity.z
    );
    
    if (newSpeed > maxSpeed * boostMultiplier) {
      const scale = (maxSpeed * boostMultiplier) / newSpeed;
      newVelocity.x *= scale;
      newVelocity.y *= scale;
      newVelocity.z *= scale;
    }
    
    // Update position
    const newPosition = {
      x: position.x + newVelocity.x * deltaTime,
      y: position.y + newVelocity.y * deltaTime,
      z: position.z + newVelocity.z * deltaTime
    };
    
    return {
      position: newPosition,
      rotation: newRotation,
      velocity: newVelocity
    };
  } catch (error) {
    logger.error(`Error calculating aircraft movement: ${error.message}`);
    // Return unchanged values as fallback
    return { position, rotation, velocity };
  }
};

/**
 * Calculate forward vector from rotation
 * @param {Object} rotation - Rotation angles {x, y, z} in radians
 * @returns {Object} Forward vector {x, y, z}
 */
const calculateForwardVector = (rotation) => {
  // Convert Euler angles to forward vector
  // Note: This is a simplified calculation
  
  // Yaw rotation (around y-axis)
  const sinYaw = Math.sin(rotation.y);
  const cosYaw = Math.cos(rotation.y);
  
  // Pitch rotation (around x-axis)
  const sinPitch = Math.sin(rotation.x);
  const cosPitch = Math.cos(rotation.x);
  
  // Calculate forward vector
  return {
    x: sinYaw * cosPitch,
    y: -sinPitch,      // Negative because pitch up means looking down
    z: cosYaw * cosPitch
  };
};

/**
 * Normalize angle to range [0, 2π]
 * @param {number} angle - Angle in radians
 * @returns {number} Normalized angle
 */
const normalizeAngle = (angle) => {
  const TWO_PI = 2 * Math.PI;
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
};

/**
 * Update projectile positions
 * @param {string} gameId - Game ID
 * @param {number} deltaTime - Time step in seconds
 * @returns {Promise<Object>} Updates with new positions and removed projectiles
 */
const updateProjectiles = async (gameId, deltaTime) => {
  try {
    // Get game state
    const gameState = await gameService.getGameState(gameId);
    if (!gameState) {
      return { removed: [] };
    }
    
    const updates = {};
    const removedProjectiles = [];
    
    // Update each projectile
    gameState.projectiles.forEach((projectile, projectileId) => {
      // Calculate age of projectile
      const age = Date.now() - projectile.createdAt;
      
      // Check if lifetime exceeded
      const lifetime = projectile.type === 'missile' ? 
        PHYSICS_CONSTANTS.MISSILE_LIFETIME : 
        PHYSICS_CONSTANTS.PROJECTILE_LIFETIME;
      
      if (age > lifetime) {
        removedProjectiles.push(projectileId);
        return;
      }
      
      // Get speed based on projectile type
      const speed = projectile.type === 'missile' ? 
        PHYSICS_CONSTANTS.MISSILE_SPEED : 
        PHYSICS_CONSTANTS.PROJECTILE_SPEED;
      
      // For bullets, simple linear movement
      if (projectile.type !== 'missile') {
        // Calculate movement based on direction and speed
        const newPosition = {
          x: projectile.position.x + projectile.direction.x * speed * deltaTime,
          y: projectile.position.y + projectile.direction.y * speed * deltaTime,
          z: projectile.position.z + projectile.direction.z * speed * deltaTime
        };
        
        // Update projectile position
        updates[projectileId] = {
          position: newPosition
        };
      } else {
        // For missiles, homing behavior if target is specified
        let newPosition;
        
        if (projectile.targetId && gameState.players[projectile.targetId]) {
          const targetPosition = gameState.players[projectile.targetId].position;
          
          // Calculate direction to target
          const direction = {
            x: targetPosition.x - projectile.position.x,
            y: targetPosition.y - projectile.position.y,
            z: targetPosition.z - projectile.position.z
          };
          
          // Normalize direction
          const distance = Math.sqrt(
            direction.x * direction.x +
            direction.y * direction.y +
            direction.z * direction.z
          );
          
          if (distance > 0) {
            direction.x /= distance;
            direction.y /= distance;
            direction.z /= distance;
          }
          
          // Interpolate between current direction and target direction (homing)
          const turnRate = 0.05; // Adjust for missile agility
          
          const newDirection = {
            x: projectile.direction.x * (1 - turnRate) + direction.x * turnRate,
            y: projectile.direction.y * (1 - turnRate) + direction.y * turnRate,
            z: projectile.direction.z * (1 - turnRate) + direction.z * turnRate
          };
          
          // Normalize new direction
          const newDirLength = Math.sqrt(
            newDirection.x * newDirection.x +
            newDirection.y * newDirection.y +
            newDirection.z * newDirection.z
          );
          
          if (newDirLength > 0) {
            newDirection.x /= newDirLength;
            newDirection.y /= newDirLength;
            newDirection.z /= newDirLength;
          }
          
          // Calculate new position
          newPosition = {
            x: projectile.position.x + newDirection.x * speed * deltaTime,
            y: projectile.position.y + newDirection.y * speed * deltaTime,
            z: projectile.position.z + newDirection.z * speed * deltaTime
          };
          
          // Update projectile
          updates[projectileId] = {
            position: newPosition,
            direction: newDirection
          };
        } else {
          // No target or target not found, move in straight line
          newPosition = {
            x: projectile.position.x + projectile.direction.x * speed * deltaTime,
            y: projectile.position.y + projectile.direction.y * speed * deltaTime,
            z: projectile.position.z + projectile.direction.z * speed * deltaTime
          };
          
          // Update projectile position
          updates[projectileId] = {
            position: newPosition
          };
        }
      }
      
      // Check for map boundary collision
      if (gameState.mapConfig && gameState.mapConfig.boundaries) {
        const boundaries = gameState.mapConfig.boundaries;
        const newPos = updates[projectileId].position;
        
        // If outside boundaries, remove projectile
        if (newPos.x < boundaries.minX || newPos.x > boundaries.maxX ||
            newPos.y < boundaries.minY || newPos.y > boundaries.maxY ||
            newPos.z < boundaries.minZ || newPos.z > boundaries.maxZ) {
          
          removedProjectiles.push(projectileId);
          delete updates[projectileId];
        }
      }
    });
    
    return {
      updates,
      removed: removedProjectiles
    };
  } catch (error) {
    logger.error(`Error updating projectiles: ${error.message}`);
    return { updates: {}, removed: [] };
  }
};

/**
 * Apply damage from collision
 * @param {Object} collision - Collision data
 * @param {Object} playerState - Player state
 * @returns {Object} Updated player state with damage applied
 */
const applyCollisionDamage = (collision, playerState) => {
  // Make copy of player state
  const updatedState = { ...playerState };
  
  // Calculate damage based on collision type
  let damage = 0;
  
  switch (collision.type) {
    case 'terrain':
      // Terrain damage based on severity
      damage = 25 * collision.severity;
      break;
      
    case 'boundary':
      // Boundary damage (less severe)
      damage = 10 * collision.severity;
      break;
      
    case 'player':
      // Player collision damage based on relative speed
      damage = collision.relativeSpeed * PHYSICS_CONSTANTS.COLLISION_DAMAGE_MULTIPLIER;
      break;
      
    case 'projectile':
      // Different damage based on projectile type
      if (collision.projectileType === 'missile') {
        damage = 30; // Missiles do more damage
      } else {
        damage = 10; // Default bullet damage
      }
      break;
      
    default:
      damage = 0;
  }
  
  // Reduce damage if shield is active
  if (updatedState.shieldActive) {
    damage *= 0.2; // 80% damage reduction
  }
  
  // Apply damage
  updatedState.health = Math.max(0, updatedState.health - damage);
  
  return updatedState;
};

/**
 * Get aircraft specifications by type
 * @param {string} aircraftType - Aircraft type
 * @returns {Object} Aircraft specifications
 */
const getAircraftSpecs = (aircraftType) => {
  const type = aircraftType.toUpperCase();
  return AIRCRAFT_SPECS[type] || AIRCRAFT_SPECS.DEFAULT;
};

module.exports = {
  validateMovement,
  detectCollisions,
  calculateAircraftMovement,
  updateProjectiles,
  applyCollisionDamage,
  getAircraftSpecs,
  PHYSICS_CONSTANTS,
  AIRCRAFT_SPECS
};