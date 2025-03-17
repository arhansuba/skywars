/**
 * World Generator
 * 
 * Procedurally generates terrain, environment features, and game elements
 * for the multiplayer plane game. Includes terrain generation, object placement,
 * mission area generation, and environment settings.
 * 
 * @module worldGenerator
 */

const THREE = require('three');
const SimplexNoise = require('simplex-noise');
const { v4: uuidv4 } = require('uuid');
const { OBJECT_TYPES } = require('./collisionSystem');

/**
 * Available environment types
 * @enum {string}
 */
const ENVIRONMENT_TYPES = {
  MOUNTAINS: 'mountains',
  DESERT: 'desert',
  OCEAN: 'ocean',
  ARCTIC: 'arctic',
  CANYON: 'canyon',
  ISLANDS: 'islands',
  FOREST: 'forest'
};

/**
 * Available mission types
 * @enum {string}
 */
const MISSION_TYPES = {
  DOGFIGHT: 'dogfight',
  RACE: 'race',
  CAPTURE: 'capture',
  ESCORT: 'escort',
  BOMBING: 'bombing',
  RECON: 'recon',
  TRAINING: 'training'
};

/**
 * World Generator class that handles procedural generation of the game world
 */
class WorldGenerator {
  /**
   * Create a new world generator
   * @param {Object} options - World generation options
   */
  constructor(options = {}) {
    // Default options
    this.options = Object.assign({
      worldSize: 10000,             // World size in meters
      chunkSize: 500,               // Size of terrain chunks in meters
      maxHeight: 2000,              // Maximum terrain height
      waterLevel: 0,                // Water level height
      seed: Math.random() * 10000,  // Random seed for generation
      environment: 'mountains',     // Default environment type
      objectDensity: 1.0,           // Density multiplier for objects
      missionDensity: 1.0,          // Density multiplier for mission elements
    }, options);
    
    // Create noise generators with seed
    this.seed = this.options.seed;
    this.simplex = new SimplexNoise(this.seed.toString());
    this.simplex2 = new SimplexNoise((this.seed + 1000).toString());
    this.simplex3 = new SimplexNoise((this.seed + 2000).toString());
    
    // Storage for generated world data
    this.terrainChunks = new Map();
    this.objects = new Map();
    this.missions = new Map();
    
    // Environment settings
    this.environment = {
      type: this.options.environment,
      time: 12, // Noon
      weather: 'clear',
      fogDensity: 0,
      windDirection: new THREE.Vector3(1, 0, 0),
      windSpeed: 0
    };
    
    // Cache for optimization
    this._chunkCache = {};
  }
  
  /**
   * Set environment settings
   * @param {Object} settings - Environment settings
   */
  setEnvironment(settings) {
    Object.assign(this.environment, settings);
  }
  
  /**
   * Generate a new world with the current settings
   * @returns {Object} Generated world data
   */
  generateWorld() {
    // Clear existing data
    this.terrainChunks.clear();
    this.objects.clear();
    this.missions.clear();
    this._chunkCache = {};
    
    // Set up environment parameters based on type
    this._setupEnvironmentParameters();
    
    // Generate initial center chunks
    this._generateInitialChunks();
    
    // Generate environment objects
    this._generateEnvironmentObjects();
    
    // If missions are requested, generate those
    this._generateMissions();
    
    // Return the generated world data
    return this.getWorldData();
  }
  
  /**
   * Set up environment parameters based on type
   * @private
   */
  _setupEnvironmentParameters() {
    switch (this.environment.type) {
      case ENVIRONMENT_TYPES.MOUNTAINS:
        this.environment.terrainScale = 1.0;
        this.environment.terrainRoughness = 1.0;
        this.environment.peakiness = 1.5;
        this.environment.waterLevel = -100; // Below most terrain
        this.environment.fogDensity = 0.00003;
        this.environment.windSpeed = 5 + Math.random() * 10;
        this.environment.ambientColor = 0xabd5ff;
        this.environment.skyColor = 0x4b9bff;
        break;
      
      case ENVIRONMENT_TYPES.DESERT:
        this.environment.terrainScale = 0.6;
        this.environment.terrainRoughness = 0.4;
        this.environment.peakiness = 0.3;
        this.environment.waterLevel = -1000; // No water
        this.environment.fogDensity = 0.00006;
        this.environment.windSpeed = 3 + Math.random() * 15;
        this.environment.ambientColor = 0xffebc5;
        this.environment.skyColor = 0xf0e6d8;
        break;
      
      case ENVIRONMENT_TYPES.OCEAN:
        this.environment.terrainScale = 0.3;
        this.environment.terrainRoughness = 0.2;
        this.environment.peakiness = 0.3;
        this.environment.waterLevel = 0; // Sea level
        this.environment.fogDensity = 0.00001;
        this.environment.windSpeed = 8 + Math.random() * 20;
        this.environment.ambientColor = 0xabfffd;
        this.environment.skyColor = 0x80d0ff;
        break;
      
      case ENVIRONMENT_TYPES.ARCTIC:
        this.environment.terrainScale = 0.8;
        this.environment.terrainRoughness = 0.6;
        this.environment.peakiness = 1.2;
        this.environment.waterLevel = -20;
        this.environment.fogDensity = 0.00007;
        this.environment.windSpeed = 10 + Math.random() * 25;
        this.environment.ambientColor = 0xe3f4ff;
        this.environment.skyColor = 0xd6eeff;
        break;
      
      case ENVIRONMENT_TYPES.CANYON:
        this.environment.terrainScale = 1.2;
        this.environment.terrainRoughness = 1.2;
        this.environment.peakiness = 0.7;
        this.environment.erosion = 1.5;
        this.environment.waterLevel = -80;
        this.environment.fogDensity = 0.00004;
        this.environment.windSpeed = 5 + Math.random() * 10;
        this.environment.ambientColor = 0xffdebd;
        this.environment.skyColor = 0xff9e63;
        break;
      
      case ENVIRONMENT_TYPES.ISLANDS:
        this.environment.terrainScale = 0.5;
        this.environment.terrainRoughness = 0.7;
        this.environment.peakiness = 1.0;
        this.environment.waterLevel = 0; // Sea level
        this.environment.fogDensity = 0.00002;
        this.environment.windSpeed = 5 + Math.random() * 15;
        this.environment.ambientColor = 0xc4f9ff;
        this.environment.skyColor = 0x62c2ff;
        break;
        
      case ENVIRONMENT_TYPES.FOREST:
        this.environment.terrainScale = 0.7;
        this.environment.terrainRoughness = 0.5;
        this.environment.peakiness = 0.6;
        this.environment.waterLevel = -50;
        this.environment.fogDensity = 0.00007;
        this.environment.windSpeed = 4 + Math.random() * 8;
        this.environment.ambientColor = 0xb5ffab;
        this.environment.skyColor = 0x75d672;
        break;
      
      default:
        // Default parameters for custom environments
        this.environment.terrainScale = 1.0;
        this.environment.terrainRoughness = 0.8;
        this.environment.peakiness = 1.0;
        this.environment.waterLevel = 0;
        this.environment.fogDensity = 0.00003;
        this.environment.windSpeed = 5 + Math.random() * 15;
        this.environment.ambientColor = 0xffffff;
        this.environment.skyColor = 0x87ceeb;
    }
    
    // Set wind direction (random but consistent)
    const windAngle = this.simplex.noise2D(0, 0) * Math.PI * 2;
    this.environment.windDirection.set(
      Math.cos(windAngle),
      0,
      Math.sin(windAngle)
    ).normalize();
  }
  
  /**
   * Generate initial terrain chunks around center of world
   * @private
   */
  _generateInitialChunks() {
    // Generate a grid of chunks around the center
    const centerRadius = 3; // Number of chunks in each direction from center
    const chunkSize = this.options.chunkSize;
    
    for (let x = -centerRadius; x <= centerRadius; x++) {
      for (let z = -centerRadius; z <= centerRadius; z++) {
        // Generate a terrain chunk
        const chunkX = x * chunkSize;
        const chunkZ = z * chunkSize;
        
        this._generateTerrainChunk(chunkX, chunkZ);
      }
    }
  }
  
  /**
   * Generate a single terrain chunk at the given coordinates
   * @param {number} x - X coordinate of chunk
   * @param {number} z - Z coordinate of chunk
   * @returns {Object} Generated terrain chunk
   * @private
   */
  _generateTerrainChunk(x, z) {
    const chunkSize = this.options.chunkSize;
    const resolution = 64; // Heightfield resolution within a chunk
    
    // Check if chunk already exists
    const chunkId = `${x},${z}`;
    
    if (this.terrainChunks.has(chunkId)) {
      return this.terrainChunks.get(chunkId);
    }
    
    // Calculate bounds for this chunk
    const bounds = new THREE.Box3(
      new THREE.Vector3(x, -this.options.maxHeight, z),
      new THREE.Vector3(x + chunkSize, this.options.maxHeight, z + chunkSize)
    );
    
    // Create heightfield
    const heightfield = [];
    const cellSize = chunkSize / resolution;
    
    for (let i = 0; i < resolution; i++) {
      heightfield[i] = [];
      
      for (let j = 0; j < resolution; j++) {
        // World coordinates for this heightfield point
        const worldX = x + i * cellSize;
        const worldZ = z + j * cellSize;
        
        // Generate height value
        heightfield[i][j] = this._getHeightAt(worldX, worldZ);
      }
    }
    
    // Generate terrain chunk metadata
    const chunk = {
      id: chunkId,
      position: { x, y: 0, z },
      bounds,
      heightfield,
      heightfieldScale: { x: cellSize, z: cellSize },
      type: OBJECT_TYPES.TERRAIN,
      features: this._generateChunkFeatures(x, z, heightfield)
    };
    
    // Store the chunk
    this.terrainChunks.set(chunkId, chunk);
    
    return chunk;
  }
  
  /**
   * Generate features for a terrain chunk (special terrain features, points of interest)
   * @param {number} x - X coordinate of chunk
   * @param {number} z - Z coordinate of chunk
   * @param {Array} heightfield - Heightfield data
   * @returns {Array} Generated features
   * @private
   */
  _generateChunkFeatures(x, z, heightfield) {
    const features = [];
    const chunkSize = this.options.chunkSize;
    const noise = this.simplex.noise2D(x / 10000, z / 10000); // Large scale noise
    
    // Different features based on environment
    switch (this.environment.type) {
      case ENVIRONMENT_TYPES.MOUNTAINS:
        // Add mountain peaks
        if (noise > 0.5) {
          const peakX = x + chunkSize * (0.3 + 0.4 * this.simplex2.noise2D(x / 5000, z / 5000));
          const peakZ = z + chunkSize * (0.3 + 0.4 * this.simplex3.noise2D(x / 5000, z / 5000));
          const peakHeight = this._getHeightAt(peakX, peakZ);
          
          // Only add if it's high enough
          if (peakHeight > this.options.maxHeight * 0.7) {
            features.push({
              type: 'mountain_peak',
              position: { x: peakX, y: peakHeight, z: peakZ },
              height: peakHeight,
              radius: 200 + 100 * this.simplex.noise2D(peakX / 1000, peakZ / 1000)
            });
          }
        }
        break;
        
      case ENVIRONMENT_TYPES.DESERT:
        // Add desert oasis
        if (noise > 0.7) {
          const oasisX = x + chunkSize * (0.3 + 0.4 * this.simplex2.noise2D(x / 5000, z / 5000));
          const oasisZ = z + chunkSize * (0.3 + 0.4 * this.simplex3.noise2D(x / 5000, z / 5000));
          const oasisHeight = this._getHeightAt(oasisX, oasisZ);
          
          features.push({
            type: 'oasis',
            position: { x: oasisX, y: oasisHeight, z: oasisZ },
            radius: 50 + 30 * this.simplex.noise2D(oasisX / 1000, oasisZ / 1000)
          });
        }
        break;
        
      case ENVIRONMENT_TYPES.OCEAN:
        // Add islands
        if (noise > 0.6) {
          const islandX = x + chunkSize * (0.3 + 0.4 * this.simplex2.noise2D(x / 5000, z / 5000));
          const islandZ = z + chunkSize * (0.3 + 0.4 * this.simplex3.noise2D(x / 5000, z / 5000));
          const islandHeight = this._getHeightAt(islandX, islandZ);
          
          if (islandHeight > this.environment.waterLevel + 5) {
            features.push({
              type: 'island',
              position: { x: islandX, y: islandHeight, z: islandZ },
              radius: 100 + 50 * this.simplex.noise2D(islandX / 1000, islandZ / 1000)
            });
          }
        }
        break;
      
      // Add more environment-specific features for other types
    }
    
    return features;
  }
  
  /**
   * Calculate height at a specific world position
   * @param {number} x - X coordinate
   * @param {number} z - Z coordinate
   * @returns {number} Terrain height at position
   * @private
   */
  _getHeightAt(x, z) {
    // Cache key to avoid recalculating the same points
    const cacheKey = `${Math.floor(x)},${Math.floor(z)}`;
    if (this._chunkCache[cacheKey] !== undefined) {
      return this._chunkCache[cacheKey];
    }
    
    // Scale coordinates based on environment settings
    const scale = this.environment.terrainScale || 1.0;
    const roughness = this.environment.terrainRoughness || 1.0;
    const peakiness = this.environment.peakiness || 1.0;
    
    // Multi-octave noise for natural-looking terrain
    let value = 0;
    let amplitude = 1.0;
    let frequency = scale / 1000; // Base frequency
    
    // Start with largest features
    value += amplitude * this.simplex.noise2D(x * frequency, z * frequency);
    
    // Add medium features
    amplitude *= 0.5 * roughness;
    frequency *= 2;
    value += amplitude * this.simplex.noise2D(x * frequency, z * frequency);
    
    // Add smaller details
    amplitude *= 0.5 * roughness;
    frequency *= 2;
    value += amplitude * this.simplex.noise2D(x * frequency, z * frequency);
    
    // Add fine details
    amplitude *= 0.5 * roughness;
    frequency *= 2;
    value += amplitude * this.simplex.noise2D(x * frequency, z * frequency);
    
    // Normalize to -1 to 1 range
    value /= (1.0 + 0.5 + 0.25 + 0.125);
    
    // Apply non-linear transformations for interesting terrain
    switch (this.environment.type) {
      case ENVIRONMENT_TYPES.MOUNTAINS:
        // More peaks and valleys
        value = Math.pow(Math.abs(value), 0.8) * Math.sign(value);
        break;
        
      case ENVIRONMENT_TYPES.DESERT:
        // Smoother with occasional dunes
        if (value > 0.2) {
          value = 0.2 + (value - 0.2) * 0.5;
        }
        // Add some ripples
        value += 0.05 * this.simplex2.noise2D(x * 0.05, z * 0.05);
        break;
        
      case ENVIRONMENT_TYPES.OCEAN:
        // Mostly below water with some islands
        if (value > 0.3) {
          value = 0.3 + (value - 0.3) * 2; // Islands rise more sharply
        } else {
          value = value * 0.3; // Most is underwater
        }
        break;
        
      case ENVIRONMENT_TYPES.CANYON:
        // Create deep canyons
        if (value < 0.1) {
          value = value - 0.6; // Make canyons deeper
        }
        // Add erosion patterns
        const erosion = this.environment.erosion || 1.0;
        value -= Math.abs(this.simplex3.noise2D(x * 0.001, z * 0.001)) * 0.4 * erosion;
        break;
        
      case ENVIRONMENT_TYPES.ISLANDS:
        // Sharper distinction between water and land
        if (value > 0.1) {
          value = 0.1 + (value - 0.1) * 1.5;
        } else {
          value = value * 0.3;
        }
        break;
        
      case ENVIRONMENT_TYPES.FOREST:
        // Rolling hills
        value = value * 0.7;
        // Add some small bumps for forest floor
        value += 0.03 * this.simplex2.noise2D(x * 0.1, z * 0.1);
        break;
    }
    
    // Scale to desired height range
    let height = value * this.options.maxHeight * peakiness;
    
    // Store in cache
    this._chunkCache[cacheKey] = height;
    
    return height;
  }
  
  /**
   * Generate environment objects based on terrain
   * @private
   */
  _generateEnvironmentObjects() {
    // Number of objects to generate is based on world size and density
    const objectCount = Math.floor(
      this.options.worldSize * this.options.worldSize / 1000000 * 
      this.options.objectDensity * 
      this._getEnvironmentObjectDensity()
    );
    
    for (let i = 0; i < objectCount; i++) {
      // Get a random position within world bounds
      const halfSize = this.options.worldSize / 2;
      const x = (this.simplex.noise2D(i * 0.1, 0) * 0.5 + 0.5) * this.options.worldSize - halfSize;
      const z = (this.simplex.noise2D(0, i * 0.1) * 0.5 + 0.5) * this.options.worldSize - halfSize;
      
      // Get height at this position
      const y = this._getHeightAt(x, z);
      
      // Only place objects above water
      if (y <= this.environment.waterLevel) continue;
      
      // Generate an appropriate object based on environment and height
      const object = this._generateEnvironmentObject(x, y, z);
      
      if (object) {
        this.objects.set(object.id, object);
      }
    }
  }
  
  /**
   * Get the appropriate object density multiplier for the environment
   * @returns {number} Density multiplier
   * @private
   */
  _getEnvironmentObjectDensity() {
    switch (this.environment.type) {
      case ENVIRONMENT_TYPES.FOREST:
        return 3.0; // Dense trees
      case ENVIRONMENT_TYPES.DESERT:
        return 0.5; // Sparse objects
      case ENVIRONMENT_TYPES.MOUNTAINS:
        return 0.7; // Some objects on mountains
      case ENVIRONMENT_TYPES.OCEAN:
        return 0.3; // Very few objects
      case ENVIRONMENT_TYPES.CANYON:
        return 0.8; // Medium density
      case ENVIRONMENT_TYPES.ISLANDS:
        return 1.2; // Island vegetation
      case ENVIRONMENT_TYPES.ARCTIC:
        return 0.4; // Sparse objects
      default:
        return 1.0;
    }
  }
  
  /**
   * Generate an appropriate environment object for the given position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate (height)
   * @param {number} z - Z coordinate
   * @returns {Object} Generated object data
   * @private
   */
  _generateEnvironmentObject(x, y, z) {
    const objectId = uuidv4();
    
    // Different objects based on environment
    let objectType;
    let objectSize;
    let objectRotation;
    
    // Randomize rotation
    const rotationY = Math.random() * Math.PI * 2;
    
    // Use noise to determine object type with some randomness
    const objectNoise = this.simplex2.noise2D(x / 100, z / 100);
    
    switch (this.environment.type) {
      case ENVIRONMENT_TYPES.FOREST:
        if (objectNoise > 0.3) {
          objectType = 'tree';
          objectSize = { x: 15, y: 30 + Math.random() * 20, z: 15 };
        } else if (objectNoise > 0) {
          objectType = 'bush';
          objectSize = { x: 5, y: 3, z: 5 };
        } else {
          objectType = 'rock';
          objectSize = { x: 3, y: 2, z: 3 };
        }
        break;
        
      case ENVIRONMENT_TYPES.DESERT:
        if (objectNoise > 0.7) {
          objectType = 'cactus';
          objectSize = { x: 5, y: 10 + Math.random() * 5, z: 5 };
        } else if (objectNoise > 0.4) {
          objectType = 'rock';
          objectSize = { x: 5, y: 3, z: 5 };
        } else {
          objectType = 'tumbleweed';
          objectSize = { x: 2, y: 2, z: 2 };
        }
        break;
        
      case ENVIRONMENT_TYPES.MOUNTAINS:
        if (y > this.options.maxHeight * 0.7) {
          objectType = 'snow_peak';
          objectSize = { x: 20, y: 10, z: 20 };
        } else if (y > this.options.maxHeight * 0.4) {
          objectType = 'rock';
          objectSize = { x: 8, y: 5, z: 8 };
        } else {
          objectType = 'pine_tree';
          objectSize = { x: 10, y: 25, z: 10 };
        }
        break;
        
      case ENVIRONMENT_TYPES.OCEAN:
        if (y > this.environment.waterLevel + 5) {
          if (objectNoise > 0.5) {
            objectType = 'palm_tree';
            objectSize = { x: 5, y: 15, z: 5 };
          } else {
            objectType = 'bush';
            objectSize = { x: 3, y: 2, z: 3 };
          }
        } else {
          return null; // Don't place objects underwater
        }
        break;
        
      case ENVIRONMENT_TYPES.CANYON:
        if (y > this.options.maxHeight * 0.3) {
          objectType = 'mesa_rock';
          objectSize = { x: 15, y: 10, z: 15 };
        } else {
          objectType = 'cactus';
          objectSize = { x: 3, y: 8, z: 3 };
        }
        break;
        
      case ENVIRONMENT_TYPES.ISLANDS:
        if (y > this.environment.waterLevel + 5) {
          if (objectNoise > 0.4) {
            objectType = 'palm_tree';
            objectSize = { x: 5, y: 15, z: 5 };
          } else {
            objectType = 'tropical_bush';
            objectSize = { x: 4, y: 2, z: 4 };
          }
        } else {
          return null; // Don't place objects underwater
        }
        break;
        
      case ENVIRONMENT_TYPES.ARCTIC:
        if (objectNoise > 0.7) {
          objectType = 'ice_spike';
          objectSize = { x: 5, y: 10, z: 5 };
        } else if (objectNoise > 0.4) {
          objectType = 'snow_mound';
          objectSize = { x: 10, y: 3, z: 10 };
        } else {
          objectType = 'ice_rock';
          objectSize = { x: 5, y: 3, z: 5 };
        }
        break;
        
      default:
        objectType = 'generic_object';
        objectSize = { x: 5, y: 5, z: 5 };
    }
    
    // Create object
    const object = {
      id: objectId,
      type: OBJECT_TYPES.STATIC_OBJECT,
      objectType: objectType,
      position: { x, y, z },
      rotation: { x: 0, y: rotationY, z: 0 },
      dimensions: objectSize,
      bounds: new THREE.Box3(
        new THREE.Vector3(x - objectSize.x/2, y, z - objectSize.z/2),
        new THREE.Vector3(x + objectSize.x/2, y + objectSize.y, z + objectSize.z/2)
      )
    };
    
    return object;
  }
  
  /**
   * Generate missions and mission areas
   * @private
   */
  _generateMissions() {
    // Number of missions to generate
    const missionCount = Math.floor(
      this.options.worldSize / 2000 * this.options.missionDensity
    );
    
    for (let i = 0; i < missionCount; i++) {
      // Mission position (more likely to be interesting places)
      let missionX, missionZ, missionY;
      
      // Try to find an interesting location for the mission
      if (Math.random() < 0.7 && this.terrainChunks.size > 0) {
        // Pick a terrain chunk with features
        const chunks = Array.from(this.terrainChunks.values())
          .filter(chunk => chunk.features && chunk.features.length > 0);
        
        if (chunks.length > 0) {
          // Pick a random chunk with features
          const chunk = chunks[Math.floor(Math.random() * chunks.length)];
          
          // Pick a random feature from the chunk
          const feature = chunk.features[Math.floor(Math.random() * chunk.features.length)];
          
          missionX = feature.position.x;
          missionZ = feature.position.z;
          missionY = feature.position.y;
        } else {
          // No interesting features, pick a random location
          const halfSize = this.options.worldSize / 2;
          missionX = (Math.random() * 2 - 1) * halfSize;
          missionZ = (Math.random() * 2 - 1) * halfSize;
          missionY = this._getHeightAt(missionX, missionZ);
        }
      } else {
        // Random location
        const halfSize = this.options.worldSize / 2;
        missionX = (Math.random() * 2 - 1) * halfSize;
        missionZ = (Math.random() * 2 - 1) * halfSize;
        missionY = this._getHeightAt(missionX, missionZ);
      }
      
      // Skip if underwater
      if (missionY <= this.environment.waterLevel) continue;
      
      // Generate a mission
      const mission = this._generateMission(missionX, missionY, missionZ);
      
      if (mission) {
        this.missions.set(mission.id, mission);
      }
    }
  }
  
  /**
   * Generate a mission at the given position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate (height)
   * @param {number} z - Z coordinate
   * @returns {Object} Generated mission data
   * @private
   */
  _generateMission(x, y, z) {
    const missionId = uuidv4();
    
    // Pick a mission type (weighted by environment)
    let missionType = this._pickMissionTypeForEnvironment();
    
    // Mission settings
    let radius = 300 + Math.random() * 700; // Mission area radius
    let difficulty = 1 + Math.floor(Math.random() * 3); // 1-3
    let rewards = this._generateMissionRewards(missionType, difficulty);
    
    // Generate objectives based on mission type
    let objectives = [];
    
    switch (missionType) {
      case MISSION_TYPES.DOGFIGHT:
        // Enemy aircraft objectives
        const enemyCount = difficulty * 2;
        for (let i = 0; i < enemyCount; i++) {
          // Spread enemies around the mission area
          const angle = (i / enemyCount) * Math.PI * 2;
          const distance = radius * 0.5 * Math.random();
          
          const enemyX = x + Math.cos(angle) * distance;
          const enemyZ = z + Math.sin(angle) * distance;
          const enemyY = Math.max(y + 200 + Math.random() * 300, this._getHeightAt(enemyX, enemyZ) + 200);
          
          objectives.push({
            type: 'enemy',
            position: { x: enemyX, y: enemyY, z: enemyZ },
            difficulty: 1 + Math.floor(Math.random() * difficulty),
            completed: false
          });
        }
        break;
        
      case MISSION_TYPES.RACE:
        // Checkpoint race
        const checkpointCount = 5 + difficulty * 2;
        let lastX = x, lastY = y + 100, lastZ = z;
        
        for (let i = 0; i < checkpointCount; i++) {
          // Create a path of checkpoints
          const angle = (i / checkpointCount) * Math.PI * 2;
          
          // Different paths based on difficulty
          let nextX, nextY, nextZ;
          
          if (difficulty === 1) {
            // Easy path - wide circle with gentle altitude changes
            nextX = x + Math.cos(angle) * radius * 0.8;
            nextZ = z + Math.sin(angle) * radius * 0.8;
            nextY = Math.max(y + 100 + Math.sin(angle) * 50, this._getHeightAt(nextX, nextZ) + 100);
          } else if (difficulty === 2) {
            // Medium path - figure 8 pattern
            const t = angle / (Math.PI * 2);
            nextX = x + Math.sin(t * Math.PI * 2) * radius * 0.7;
            nextZ = z + Math.sin(t * Math.PI * 4) * radius * 0.5;
            nextY = Math.max(y + 100 + Math.sin(t * Math.PI * 6) * 100, this._getHeightAt(nextX, nextZ) + 100);
          } else {
            // Hard path - complex pattern with altitude changes
            const t = angle / (Math.PI * 2);
            nextX = x + (Math.sin(t * Math.PI * 2) + Math.cos(t * Math.PI * 6) * 0.3) * radius * 0.7;
            nextZ = z + (Math.cos(t * Math.PI * 2) + Math.sin(t * Math.PI * 6) * 0.3) * radius * 0.7;
            nextY = Math.max(y + 100 + Math.sin(t * Math.PI * 8) * 150, this._getHeightAt(nextX, nextZ) + 100);
          }
          
          objectives.push({
            type: 'checkpoint',
            position: { x: nextX, y: nextY, z: nextZ },
            radius: 50, // Checkpoint size
            order: i,
            completed: false
          });
          
          lastX = nextX;
          lastY = nextY;
          lastZ = nextZ;
        }
        break;
        
      case MISSION_TYPES.CAPTURE:
        // Capture points
        const capturePoints = 3 + difficulty;
        
        for (let i = 0; i < capturePoints; i++) {
          // Spread capture points around the mission area
          const angle = (i / capturePoints) * Math.PI * 2;
          const distance = radius * 0.7 * Math.random();
          
          const pointX = x + Math.cos(angle) * distance;
          const pointZ = z + Math.sin(angle) * distance;
          const pointY = Math.max(y + 50, this._getHeightAt(pointX, pointZ) + 50);
          
          objectives.push({
            type: 'capture_point',
            position: { x: pointX, y: pointY, z: pointZ },
            radius: 70, // Capture zone size
            captureTime: 10 * difficulty, // Seconds to capture
            progress: 0,
            completed: false
          });
        }
        break;
        
      case MISSION_TYPES.ESCORT:
        // Escort mission
        // Create path for escort target
        const pathPoints = 5 + difficulty;
        let path = [];
        
        for (let i = 0; i < pathPoints; i++) {
          const t = i / pathPoints;
          const pathX = x + (Math.cos(t * Math.PI * 2) * radius * 0.8);
          const pathZ = z + (Math.sin(t * Math.PI * 2) * radius * 0.8);
          const pathY = Math.max(y + 150, this._getHeightAt(pathX, pathZ) + 150);
          
          path.push({ x: pathX, y: pathY, z: pathZ });
        }
        
        // Add escort target
        objectives.push({
          type: 'escort_target',
          position: { x, y: y + 150, z },
          path: path,
          speed: 30 + 10 * difficulty, // Speed in m/s
          health: 100,
          completed: false
        });
        
        // Add enemies that attack the target
        const escortEnemies = difficulty * 3;
        for (let i = 0; i < escortEnemies; i++) {
          const spawnPoint = i % pathPoints;
          const enemyPos = path[spawnPoint];
          
          // Offset enemy position
          const enemyX = enemyPos.x + (Math.random() - 0.5) * 200;
          const enemyZ = enemyPos.z + (Math.random() - 0.5) * 200;
          const enemyY = enemyPos.y + (Math.random() - 0.5) * 100;
          
          objectives.push({
            type: 'enemy',
            position: { x: enemyX, y: enemyY, z: enemyZ },
            targetType: 'escort_target',
            difficulty: 1 + Math.floor(Math.random() * difficulty),
            completed: false
          });
        }
        break;
        
      case MISSION_TYPES.BOMBING:
        // Bombing targets
        const targetCount = difficulty * 2;
        
        for (let i = 0; i < targetCount; i++) {
          // Spread targets around the mission area
          const angle = (i / targetCount) * Math.PI * 2;
          const distance = (0.2 + 0.6 * Math.random()) * radius;
          
          const targetX = x + Math.cos(angle) * distance;
          const targetZ = z + Math.sin(angle) * distance;
          const targetY = this._getHeightAt(targetX, targetZ);
          
          objectives.push({
            type: 'bombing_target',
            position: { x: targetX, y: targetY, z: targetZ },
            radius: 30, // Target size
            health: 100,
            completed: false
          });
        }
        
        // Add defensive enemies
        const defenderCount = difficulty;
        for (let i = 0; i < defenderCount; i++) {
          const angle = (i / defenderCount) * Math.PI * 2;
          const distance = radius * 0.3;
          
          const enemyX = x + Math.cos(angle) * distance;
          const enemyZ = z + Math.sin(angle) * distance;
          const enemyY = Math.max(y + 100 + Math.random() * 200, this._getHeightAt(enemyX, enemyZ) + 100);
          
          objectives.push({
            type: 'enemy',
            position: { x: enemyX, y: enemyY, z: enemyZ },
            difficulty: 1 + Math.floor(Math.random() * difficulty),
            completed: false
          });
        }
        break;
        
      case MISSION_TYPES.RECON:
        // Recon targets to photograph
        const reconTargets = 4 + difficulty;
        
        for (let i = 0; i < reconTargets; i++) {
          // Spread recon targets around the mission area
          const angle = (i / reconTargets) * Math.PI * 2;
          const distance = (0.2 + 0.7 * Math.random()) * radius;
          
          const targetX = x + Math.cos(angle) * distance;
          const targetZ = z + Math.sin(angle) * distance;
          const targetY = this._getHeightAt(targetX, targetZ);
          
          objectives.push({
            type: 'recon_target',
            position: { x: targetX, y: targetY, z: targetZ },
            radius: 40, // Target size
            minAltitude: targetY + 50, // Must be above this height
            maxAltitude: targetY + 200, // Must be below this height
            completed: false
          });
        }
        break;
        
      case MISSION_TYPES.TRAINING:
        // Training mission with various objectives
        
        // Add flying through rings
        const ringCount = 5 + difficulty * 2;
        for (let i = 0; i < ringCount; i++) {
          const t = i / ringCount;
          const angle = t * Math.PI * 2;
          
          const ringX = x + Math.cos(angle) * radius * 0.6;
          const ringZ = z + Math.sin(angle) * radius * 0.6;
          const ringY = Math.max(y + 100 + Math.sin(angle * 3) * 100, this._getHeightAt(ringX, ringZ) + 100);
          
          objectives.push({
            type: 'ring',
            position: { x: ringX, y: ringY, z: ringZ },
            rotation: { x: Math.random() * 0.5, y: Math.random() * Math.PI * 2, z: Math.random() * 0.5 },
            radius: 50 - difficulty * 5, // Smaller rings with higher difficulty
            order: i,
            completed: false
          });
        }
        
        // Add landing zone if appropriate for environment
        if (this.environment.type !== ENVIRONMENT_TYPES.OCEAN) {
          // Find a flat area
          let landingX = x, landingZ = z;
          let flatness = 1000; // Start with a high value
          
          // Try several spots to find the flattest
          for (let i = 0; i < 10; i++) {
            const testX = x + (Math.random() - 0.5) * radius;
            const testZ = z + (Math.random() - 0.5) * radius;
            
            // Check height differences in a small area
            const centerHeight = this._getHeightAt(testX, testZ);
            const h1 = Math.abs(this._getHeightAt(testX + 10, testZ) - centerHeight);
            const h2 = Math.abs(this._getHeightAt(testX - 10, testZ) - centerHeight);
            const h3 = Math.abs(this._getHeightAt(testX, testZ + 10) - centerHeight);
            const h4 = Math.abs(this._getHeightAt(testX, testZ - 10) - centerHeight);
            
            const testFlatness = h1 + h2 + h3 + h4;
            
            if (testFlatness < flatness) {
              flatness = testFlatness;
              landingX = testX;
              landingZ = testZ;
            }
          }
          
          const landingY = this._getHeightAt(landingX, landingZ);
          
          // Only add landing zone if it's flat enough
          if (flatness < 10) {
            objectives.push({
              type: 'landing_zone',
              position: { x: landingX, y: landingY, z: landingZ },
              radius: 30,
              maxSpeed: 10, // Maximum landing speed in m/s
              maxAngle: 0.2, // Maximum landing angle in radians
              completed: false
            });
          }
        }
        break;
    }
    
    // Create mission
    const mission = {
      id: missionId,
      type: missionType,
      name: this._generateMissionName(missionType),
      position: { x, y, z },
      radius: radius,
      difficulty: difficulty,
      objectives: objectives,
      rewards: rewards,
      completed: false,
      description: this._generateMissionDescription(missionType, difficulty)
    };
    
    return mission;
  }
  
  /**
   * Pick a mission type based on the current environment
   * @returns {string} Mission type
   * @private
   */
  _pickMissionTypeForEnvironment() {
    // Different missions are more likely in different environments
    const weights = {};
    
    // Default weights
    weights[MISSION_TYPES.DOGFIGHT] = 1;
    weights[MISSION_TYPES.RACE] = 1;
    weights[MISSION_TYPES.CAPTURE] = 1;
    weights[MISSION_TYPES.ESCORT] = 1;
    weights[MISSION_TYPES.BOMBING] = 1;
    weights[MISSION_TYPES.RECON] = 1;
    weights[MISSION_TYPES.TRAINING] = 1;
    
    // Adjust based on environment
    switch (this.environment.type) {
      case ENVIRONMENT_TYPES.MOUNTAINS:
        weights[MISSION_TYPES.RACE] *= 1.5;
        weights[MISSION_TYPES.RECON] *= 1.3;
        break;
        
      case ENVIRONMENT_TYPES.DESERT:
        weights[MISSION_TYPES.BOMBING] *= 1.5;
        weights[MISSION_TYPES.DOGFIGHT] *= 1.3;
        break;
        
      case ENVIRONMENT_TYPES.OCEAN:
        weights[MISSION_TYPES.DOGFIGHT] *= 1.5;
        weights[MISSION_TYPES.ESCORT] *= 1.3;
        weights[MISSION_TYPES.TRAINING] *= 0.7; // Fewer training missions over ocean
        break;
        
      case ENVIRONMENT_TYPES.CANYON:
        weights[MISSION_TYPES.RACE] *= 2.0;
        weights[MISSION_TYPES.BOMBING] *= 0.7;
        break;
        
      case ENVIRONMENT_TYPES.ISLANDS:
        weights[MISSION_TYPES.CAPTURE] *= 1.5;
        weights[MISSION_TYPES.BOMBING] *= 1.3;
        break;
        
      case ENVIRONMENT_TYPES.FOREST:
        weights[MISSION_TYPES.RECON] *= 1.5;
        weights[MISSION_TYPES.ESCORT] *= 1.3;
        break;
        
      case ENVIRONMENT_TYPES.ARCTIC:
        weights[MISSION_TYPES.DOGFIGHT] *= 1.3;
        weights[MISSION_TYPES.RACE] *= 1.3;
        break;
    }
    
    // Convert weights to probability ranges
    const missionTypes = Object.keys(weights);
    const totalWeight = missionTypes.reduce((sum, type) => sum + weights[type], 0);
    const probabilities = [];
    
    let cumulativeProbability = 0;
    for (const type of missionTypes) {
      const probability = weights[type] / totalWeight;
      cumulativeProbability += probability;
      probabilities.push({ type, probability: cumulativeProbability });
    }
    
    // Pick a random mission type based on weights
    const random = Math.random();
    for (const entry of probabilities) {
      if (random <= entry.probability) {
        return entry.type;
      }
    }
    
    // Fallback
    return MISSION_TYPES.DOGFIGHT;
  }
  
  /**
   * Generate rewards for a mission
   * @param {string} missionType - Type of mission
   * @param {number} difficulty - Difficulty level (1-3)
   * @returns {Object} Reward data
   * @private
   */
  _generateMissionRewards(missionType, difficulty) {
    // Base token rewards by mission type
    const baseRewards = {
      [MISSION_TYPES.DOGFIGHT]: 20,
      [MISSION_TYPES.RACE]: 15,
      [MISSION_TYPES.CAPTURE]: 25,
      [MISSION_TYPES.ESCORT]: 30,
      [MISSION_TYPES.BOMBING]: 25,
      [MISSION_TYPES.RECON]: 20,
      [MISSION_TYPES.TRAINING]: 10
    };
    
    // Calculate token reward
    const baseReward = baseRewards[missionType] || 20;
    const tokens = Math.round(baseReward * difficulty * (0.9 + Math.random() * 0.2));
    
    // Add bonus rewards based on difficulty
    const bonusRewards = [];
    if (difficulty >= 2) {
      bonusRewards.push({
        type: 'item',
        item: this._getRandomRewardItem(missionType, difficulty)
      });
    }
    
    if (difficulty >= 3) {
      // Add special achievement for completing hardest missions
      bonusRewards.push({
        type: 'achievement',
        achievement: `${missionType}_master`
      });
    }
    
    return {
      tokens,
      bonusRewards,
      experience: Math.round(tokens * 1.5) // XP is slightly higher than tokens
    };
  }
  
  /**
   * Get a random reward item appropriate for mission type and difficulty
   * @param {string} missionType - Type of mission
   * @param {number} difficulty - Difficulty level
   * @returns {string} Item identifier
   * @private
   */
  _getRandomRewardItem(missionType, difficulty) {
    // Different mission types give different rewards
    const items = [];
    
    switch (missionType) {
      case MISSION_TYPES.DOGFIGHT:
        items.push('missile_upgrade', 'gun_upgrade', 'armor_plating');
        break;
        
      case MISSION_TYPES.RACE:
        items.push('engine_boost', 'fuel_efficiency', 'lightweight_frame');
        break;
        
      case MISSION_TYPES.CAPTURE:
        items.push('radar_upgrade', 'stealth_coating', 'ecm_jammer');
        break;
        
      case MISSION_TYPES.ESCORT:
        items.push('shield_generator', 'missile_defense', 'repair_kit');
        break;
        
      case MISSION_TYPES.BOMBING:
        items.push('bomb_upgrade', 'targeting_computer', 'payload_expansion');
        break;
        
      case MISSION_TYPES.RECON:
        items.push('camera_upgrade', 'stealth_coating', 'sensor_array');
        break;
        
      case MISSION_TYPES.TRAINING:
        items.push('training_manual', 'flight_log', 'skill_point');
        break;
        
      default:
        items.push('mystery_box', 'supply_crate', 'token_bonus');
    }
    
    // Add rare items for higher difficulties
    if (difficulty >= 3) {
      items.push('experimental_tech', 'prototype_weapon', 'special_paint');
    }
    
    // Pick a random item
    return items[Math.floor(Math.random() * items.length)];
  }
  
  /**
   * Generate a mission name
   * @param {string} missionType - Type of mission
   * @returns {string} Mission name
   * @private
   */
  _generateMissionName(missionType) {
    const prefixes = [
      'Operation', 'Mission', 'Objective', 'Task',
      'Assignment', 'Sortie', 'Engagement', 'Directive'
    ];
    
    const typeWords = {
      [MISSION_TYPES.DOGFIGHT]: ['Dogfight', 'Intercept', 'Aerial Combat', 'Skirmish', 'Air Superiority'],
      [MISSION_TYPES.RACE]: ['Race', 'Time Trial', 'Course Run', 'Speed Dash', 'Circuit'],
      [MISSION_TYPES.CAPTURE]: ['Capture', 'Secure', 'Control', 'Domination', 'Acquisition'],
      [MISSION_TYPES.ESCORT]: ['Escort', 'Protection', 'Guard Duty', 'VIP Defense', 'Convoy'],
      [MISSION_TYPES.BOMBING]: ['Bombing', 'Strike', 'Demolition', 'Target Practice', 'Payload Delivery'],
      [MISSION_TYPES.RECON]: ['Recon', 'Scout', 'Surveillance', 'Intelligence', 'Observation'],
      [MISSION_TYPES.TRAINING]: ['Training', 'Practice', 'Exercise', 'Drill', 'Tutorial']
    };
    
    const suffixes = [
      'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo',
      'Eagle', 'Falcon', 'Hawk', 'Owl', 'Phoenix',
      'Thunder', 'Lightning', 'Storm', 'Tempest', 'Hurricane'
    ];
    
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const typeWord = typeWords[missionType][Math.floor(Math.random() * typeWords[missionType].length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    
    return `${prefix} ${typeWord} ${suffix}`;
  }
  
  /**
   * Generate a description for the mission
   * @param {string} missionType - Type of mission
   * @param {number} difficulty - Difficulty level
   * @returns {string} Mission description
   * @private
   */
  _generateMissionDescription(missionType, difficulty) {
    // Basic descriptions based on mission type and difficulty
    const descriptions = {
      [MISSION_TYPES.DOGFIGHT]: [
        'Engage and eliminate enemy aircraft in the area.',
        'Hostile aircraft have been spotted. Take them down.',
        'Clear the skies of enemy fighters to secure air superiority.'
      ],
      [MISSION_TYPES.RACE]: [
        'Navigate through checkpoints as quickly as possible.',
        'Test your flying skills on this challenging course.',
        'Race the clock through a series of waypoints.'
      ],
      [MISSION_TYPES.CAPTURE]: [
        'Capture and hold strategic points in the area.',
        'Fly low over the marked zones to capture them.',
        'Secure all marked territories to complete the mission.'
      ],
      [MISSION_TYPES.ESCORT]: [
        'Protect the VIP aircraft as it follows its route.',
        'Defend the transport from enemy attackers.',
        'Ensure the escorted aircraft reaches its destination safely.'
      ],
      [MISSION_TYPES.BOMBING]: [
        'Destroy the marked ground targets with precision.',
        'Deliver your payload to eliminate enemy installations.',
        'Bomb the designated targets while avoiding defenses.'
      ],
      [MISSION_TYPES.RECON]: [
        'Photograph the marked locations from a safe altitude.',
        'Gather intelligence on the targets without being detected.',
        'Flyby the objective areas to collect surveillance data.'
      ],
      [MISSION_TYPES.TRAINING]: [
        'Complete the training course to hone your flight skills.',
        'Practice essential maneuvers through the training rings.',
        'Demonstrate your piloting abilities in this exercise.'
      ]
    };
    
    // Pick a random description
    const baseDesc = descriptions[missionType][Math.floor(Math.random() * descriptions[missionType].length)];
    
    // Add difficulty modifier
    let difficultyDesc = '';
    if (difficulty === 1) {
      difficultyDesc = ' This is a beginner-friendly mission.';
    } else if (difficulty === 2) {
      difficultyDesc = ' Expect moderate resistance.';
    } else if (difficulty === 3) {
      difficultyDesc = ' Be prepared for a significant challenge.';
    }
    
    return baseDesc + difficultyDesc;
  }
  
  /**
   * Get complete world data
   * @returns {Object} World data including terrain, objects, and missions
   */
  getWorldData() {
    return {
      seed: this.seed,
      environment: this.environment,
      terrain: Array.from(this.terrainChunks.values()),
      objects: Array.from(this.objects.values()),
      missions: Array.from(this.missions.values()),
      worldSize: this.options.worldSize,
      waterLevel: this.environment.waterLevel
    };
  }
  
  /**
   * Get terrain data for a specific area
   * @param {number} x - Center X coordinate
   * @param {number} z - Center Z coordinate
   * @param {number} radius - Radius around center to get
   * @returns {Array} Array of terrain chunks in the area
   */
  getTerrainArea(x, z, radius) {
    const chunks = [];
    const chunkSize = this.options.chunkSize;
    
    // Calculate chunk coordinates
    const minChunkX = Math.floor((x - radius) / chunkSize) * chunkSize;
    const maxChunkX = Math.floor((x + radius) / chunkSize) * chunkSize;
    const minChunkZ = Math.floor((z - radius) / chunkSize) * chunkSize;
    const maxChunkZ = Math.floor((z + radius) / chunkSize) * chunkSize;
    
    // Generate or retrieve chunks in the area
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += chunkSize) {
      for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ += chunkSize) {
        const chunk = this._generateTerrainChunk(chunkX, chunkZ);
        chunks.push(chunk);
      }
    }
    
    return chunks;
  }
  
  /**
   * Get height at a specific world position
   * @param {number} x - X coordinate
   * @param {number} z - Z coordinate
   * @returns {number} Terrain height at position
   */
  getHeightAt(x, z) {
    return this._getHeightAt(x, z);
  }
}

module.exports = {
  WorldGenerator,
  ENVIRONMENT_TYPES,
  MISSION_TYPES
};