/**
 * Player State Management
 * 
 * Manages player data, state transitions, and persistence.
 * Handles synchronization between server and client states.
 * 
 * @module playerState
 */

const EventEmitter = require('events');
const THREE = require('three');
const { v4: uuidv4 } = require('uuid');
const { OBJECT_TYPES } = require('./collisionSystem');

/**
 * Player state constants
 * @enum {string}
 */
const PLAYER_STATES = {
  SPAWNING: 'spawning',
  ACTIVE: 'active',
  RESPAWNING: 'respawning',
  SPECTATING: 'spectating',
  DISCONNECTED: 'disconnected'
};

/**
 * Player action types
 * @enum {string}
 */
const PLAYER_ACTIONS = {
  SHOOT: 'shoot',
  DEPLOY_COUNTERMEASURES: 'deploy_countermeasures',
  USE_ABILITY: 'use_ability',
  TOGGLE_LANDING_GEAR: 'toggle_landing_gear',
  TOGGLE_AFTERBURNER: 'toggle_afterburner'
};

/**
 * Manages the state of a single player
 */
class PlayerState extends EventEmitter {
  /**
   * Create a new player state
   * @param {Object} config - Player configuration
   */
  constructor(config = {}) {
    super();
    
    // Core player identity
    this.id = config.id || uuidv4();
    this.userId = config.userId || null;
    this.username = config.username || `Player-${this.id.substr(0, 4)}`;
    this.teamId = config.teamId || null;
    
    // Player aircraft setup
    this.aircraftType = config.aircraftType || 'fighter';
    this.skin = config.skin || 'default';
    
    // Connection info
    this.socketId = config.socketId || null;
    this.sessionId = config.sessionId || null;
    this.connectionStatus = config.connectionStatus || 'connected';
    this.ping = 0;
    this.lastActivity = Date.now();
    
    // Position and physics state (using THREE.js for vector math)
    this.position = new THREE.Vector3(
      config.position?.x || 0,
      config.position?.y || 1000,
      config.position?.z || 0
    );
    this.rotation = new THREE.Euler(
      config.rotation?.x || 0,
      config.rotation?.y || 0,
      config.rotation?.z || 0,
      'YXZ'
    );
    this.velocity = new THREE.Vector3(
      config.velocity?.x || 0,
      config.velocity?.y || 0,
      config.velocity?.z || 0
    );
    this.angularVelocity = new THREE.Vector3(0, 0, 0);
    this.acceleration = new THREE.Vector3(0, 0, 0);
    
    // Control inputs (normalized -1 to 1)
    this.controls = {
      throttle: config.controls?.throttle || 0,
      pitch: config.controls?.pitch || 0,
      roll: config.controls?.roll || 0,
      yaw: config.controls?.yaw || 0,
      flaps: config.controls?.flaps || 0,
      airbrake: config.controls?.airbrake || 0,
      landingGear: config.controls?.landingGear || false,
      afterburner: config.controls?.afterburner || false
    };
    
    // Game state
    this.state = PLAYER_STATES.SPAWNING;
    this.health = config.health || 100;
    this.fuel = config.fuel || 100;
    this.ammo = config.ammo || 100;
    this.missiles = config.missiles || 4;
    this.countermeasures = config.countermeasures || 2;
    this.score = config.score || 0;
    this.kills = config.kills || 0;
    this.deaths = config.deaths || 0;
    this.isAlive = true;
    this.isInvulnerable = false;
    this.isLanded = false;
    this.respawnTime = config.respawnTime || 5000; // ms
    
    // Collision and physics info
    this.dimensions = this._getAircraftDimensions();
    this.bounds = new THREE.Box3(
      new THREE.Vector3(
        this.position.x - this.dimensions.x/2,
        this.position.y - this.dimensions.y/2,
        this.position.z - this.dimensions.z/2
      ),
      new THREE.Vector3(
        this.position.x + this.dimensions.x/2,
        this.position.y + this.dimensions.y/2,
        this.position.z + this.dimensions.z/2
      )
    );
    this.type = OBJECT_TYPES.AIRCRAFT;
    
    // Cooldowns and timers
    this.cooldowns = {
      primaryWeapon: 0,
      secondaryWeapon: 0,
      countermeasures: 0,
      abilities: {}
    };
    
    // Flight data
    this.flightData = {
      altitude: this.position.y,
      airspeed: 0,
      verticalSpeed: 0,
      heading: 0,
      angleOfAttack: 0,
      stalled: false,
      g: 1
    };
    
    // Token and rewards
    this.walletAddress = config.walletAddress || null;
    this.tokensEarned = 0;
    this.lastRewardTime = 0;
    
    // Loadout and abilities
    this.loadout = config.loadout || {
      primaryWeapon: 'cannon',
      secondaryWeapon: 'missile',
      specialAbility: null,
      upgrades: []
    };
    
    // Achievements and missions
    this.achievements = new Set();
    this.activeMissions = new Map();
    this.completedMissions = new Set();
    
    // Last update time for delta calculations
    this.lastUpdateTime = Date.now();
    
    // Meta-state tracking for changes
    this._changedProperties = new Set();
    this._changedPosition = false;
    this._changedHealth = false;
    this._changedState = false;
    
    // History tracking for replays and sync
    this.stateHistory = [];
    this.historyMaxLength = 60; // 1 second at 60 fps
  }
  
  /**
   * Get aircraft dimensions based on type
   * @returns {Object} Aircraft dimensions
   * @private
   */
  _getAircraftDimensions() {
    switch (this.aircraftType) {
      case 'fighter':
        return { x: 12, y: 3, z: 15 };
      case 'bomber':
        return { x: 25, y: 6, z: 30 };
      case 'light':
        return { x: 10, y: 2.5, z: 12 };
      default:
        return { x: 15, y: 4, z: 20 };
    }
  }
  
  /**
   * Update player state
   * @param {number} deltaTime - Time in seconds since last update
   * @param {Object} options - Update options
   */
  update(deltaTime, options = {}) {
    // Record current time for update
    const now = Date.now();
    const timeDelta = now - this.lastUpdateTime;
    this.lastUpdateTime = now;
    
    // Skip updates if player is not active
    if (this.state !== PLAYER_STATES.ACTIVE && this.state !== PLAYER_STATES.SPAWNING) {
      return;
    }
    
    // Clear change tracking
    this._changedProperties.clear();
    this._changedPosition = false;
    this._changedHealth = false;
    this._changedState = false;
    
    // Update respawn state if needed
    if (this.state === PLAYER_STATES.RESPAWNING) {
      if (now - this.deathTime >= this.respawnTime) {
        this.state = PLAYER_STATES.ACTIVE;
        this.isAlive = true;
        this.health = 100;
        this.fuel = 100;
        this._changedState = true;
        this._changedProperties.add('state');
        this._changedProperties.add('health');
        this._changedProperties.add('fuel');
        
        // Event for respawn
        this.emit('respawn', { position: this.position.clone() });
      }
      return;
    }
    
    // If just spawned, transition to active
    if (this.state === PLAYER_STATES.SPAWNING) {
      this.state = PLAYER_STATES.ACTIVE;
      this._changedState = true;
      this._changedProperties.add('state');
      
      // Event for spawn complete
      this.emit('spawnComplete', { position: this.position.clone() });
    }
    
    // Update position and bounds if provided (from physics engine)
    if (options.position) {
      this.position.copy(options.position);
      this._changedPosition = true;
      this._changedProperties.add('position');
    }
    
    if (options.rotation) {
      this.rotation.copy(options.rotation);
      this._changedPosition = true;
      this._changedProperties.add('rotation');
    }
    
    if (options.velocity) {
      this.velocity.copy(options.velocity);
      this._changedPosition = true;
      this._changedProperties.add('velocity');
    }
    
    // Update flight data if provided
    if (options.flightData) {
      Object.assign(this.flightData, options.flightData);
      this._changedProperties.add('flightData');
    }
    
    // Update bounds based on new position
    this.bounds.setFromCenterAndSize(
      this.position.clone(),
      new THREE.Vector3(this.dimensions.x, this.dimensions.y, this.dimensions.z)
    );
    
    // Update cooldowns
    this._updateCooldowns(deltaTime);
    
    // Consume fuel based on throttle and afterburner
    this._updateFuel(deltaTime);
    
    // Check for landing state
    this._updateLandingState(options);
    
    // Add to state history for sync and replay
    this._updateStateHistory();
  }
  
  /**
   * Update weapon and ability cooldowns
   * @param {number} deltaTime - Time in seconds since last update
   * @private
   */
  _updateCooldowns(deltaTime) {
    // Update weapon cooldowns
    if (this.cooldowns.primaryWeapon > 0) {
      this.cooldowns.primaryWeapon = Math.max(0, this.cooldowns.primaryWeapon - deltaTime);
    }
    
    if (this.cooldowns.secondaryWeapon > 0) {
      this.cooldowns.secondaryWeapon = Math.max(0, this.cooldowns.secondaryWeapon - deltaTime);
    }
    
    if (this.cooldowns.countermeasures > 0) {
      this.cooldowns.countermeasures = Math.max(0, this.cooldowns.countermeasures - deltaTime);
    }
    
    // Update ability cooldowns
    for (const ability in this.cooldowns.abilities) {
      if (this.cooldowns.abilities[ability] > 0) {
        this.cooldowns.abilities[ability] = Math.max(0, this.cooldowns.abilities[ability] - deltaTime);
      }
    }
  }
  
  /**
   * Update fuel consumption
   * @param {number} deltaTime - Time in seconds since last update
   * @private
   */
  _updateFuel(deltaTime) {
    // Base fuel consumption based on throttle
    const baseConsumption = 0.3 * this.controls.throttle * deltaTime;
    
    // Additional consumption for afterburner
    const afterburnerConsumption = this.controls.afterburner ? 1.5 * deltaTime : 0;
    
    // Total consumption
    const fuelConsumption = baseConsumption + afterburnerConsumption;
    
    // Update fuel
    if (this.fuel > 0) {
      this.fuel = Math.max(0, this.fuel - fuelConsumption);
      
      // Notify if fuel state changed significantly
      if (this.fuel < 20 && Math.floor(this.fuel) !== Math.floor(this.fuel + fuelConsumption)) {
        this._changedProperties.add('fuel');
        
        // Low fuel event
        if (this.fuel < 10) {
          this.emit('lowFuel', { fuel: this.fuel });
        }
      }
    } else if (this.fuel <= 0 && this.controls.throttle > 0) {
      // Engine stalls when out of fuel
      this.controls.throttle = 0;
      this._changedProperties.add('controls');
      
      // Out of fuel event
      this.emit('outOfFuel');
    }
  }
  
  /**
   * Update landing state
   * @param {Object} options - Update options
   * @private
   */
  _updateLandingState(options) {
    // Only check landing if we have terrain height information
    if (options.terrainHeight !== undefined) {
      const landingGearDeployed = this.controls.landingGear;
      const altitude = this.position.y - options.terrainHeight;
      const verticalSpeed = this.velocity.y;
      const speed = this.velocity.length();
      
      // Check if aircraft is near ground
      if (altitude < 5 && landingGearDeployed) {
        // Landing/touchdown conditions
        if (!this.isLanded && altitude < 0.5 && Math.abs(verticalSpeed) < 3 && speed < 30) {
          this.isLanded = true;
          this._changedProperties.add('isLanded');
          
          // Landing event
          this.emit('landed', {
            position: this.position.clone(),
            velocity: this.velocity.length(),
            verticalSpeed
          });
        }
        // Taking off
        else if (this.isLanded && (speed > 40 || altitude > 3)) {
          this.isLanded = false;
          this._changedProperties.add('isLanded');
          
          // Takeoff event
          this.emit('takeoff', {
            position: this.position.clone(),
            velocity: this.velocity.length()
          });
        }
      }
      // If not near ground, not landed
      else if (this.isLanded && altitude > 5) {
        this.isLanded = false;
        this._changedProperties.add('isLanded');
      }
    }
  }
  
  /**
   * Update state history for replay and sync
   * @private
   */
  _updateStateHistory() {
    // Don't record history for inactive players
    if (this.state !== PLAYER_STATES.ACTIVE) return;
    
    // Create state snapshot
    const stateSnapshot = {
      timestamp: Date.now(),
      position: this.position.clone(),
      rotation: new THREE.Euler().copy(this.rotation),
      velocity: this.velocity.clone(),
      health: this.health,
      controls: { ...this.controls }
    };
    
    // Add to history
    this.stateHistory.push(stateSnapshot);
    
    // Trim history if too long
    if (this.stateHistory.length > this.historyMaxLength) {
      this.stateHistory.shift();
    }
  }
  
  /**
   * Apply damage to the player
   * @param {number} amount - Amount of damage to apply
   * @param {Object} source - Source of the damage
   * @returns {Object} Damage result
   */
  applyDamage(amount, source = {}) {
    // Check for invulnerability
    if (this.isInvulnerable || !this.isAlive) {
      return { damage: 0, health: this.health, wasKilled: false };
    }
    
    // Apply damage reduction based on upgrades or abilities
    let damageReduction = 0;
    if (this.loadout.upgrades.includes('armor_plating')) {
      damageReduction += 0.2; // 20% damage reduction
    }
    
    // Calculate final damage
    const finalDamage = amount * (1 - damageReduction);
    
    // Apply damage
    const oldHealth = this.health;
    this.health = Math.max(0, this.health - finalDamage);
    this._changedHealth = true;
    this._changedProperties.add('health');
    
    // Check for death
    const wasKilled = oldHealth > 0 && this.health <= 0;
    if (wasKilled) {
      this._processPlayerDeath(source);
    }
    
    // Damage event
    this.emit('damaged', {
      damage: finalDamage,
      health: this.health,
      wasKilled,
      source
    });
    
    return {
      damage: finalDamage,
      health: this.health,
      wasKilled
    };
  }
  
  /**
   * Process player death
   * @param {Object} source - Source of the killing damage
   * @private
   */
  _processPlayerDeath(source) {
    this.isAlive = false;
    this.state = PLAYER_STATES.RESPAWNING;
    this.deathTime = Date.now();
    this.deaths++;
    
    this._changedState = true;
    this._changedProperties.add('state');
    this._changedProperties.add('deaths');
    
    // Death event
    this.emit('death', {
      position: this.position.clone(),
      source
    });
  }
  
  /**
   * Apply a primary weapon action
   * @returns {Object|null} Action result or null if action couldn't be performed
   */
  firePrimaryWeapon() {
    // Check if weapon can be fired
    if (!this.isAlive || this.cooldowns.primaryWeapon > 0 || this.ammo <= 0) {
      return null;
    }
    
    // Calculate weapon origin and direction
    const origin = this.position.clone();
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyEuler(this.rotation);
    
    // Move origin forward from aircraft center
    origin.add(forward.clone().multiplyScalar(this.dimensions.z / 2));
    
    // Calculate projectile velocity based on aircraft velocity + weapon velocity
    const projectileSpeed = 300; // m/s
    const direction = forward.clone().normalize();
    const velocity = this.velocity.clone().add(
      direction.clone().multiplyScalar(projectileSpeed)
    );
    
    // Weapon specifics based on type
    let weaponData;
    switch (this.loadout.primaryWeapon) {
      case 'cannon':
        weaponData = {
          type: 'projectile',
          damage: 15,
          radius: 1,
          lifetime: 2, // seconds
          cooldown: 0.1
        };
        break;
      case 'machinegun':
        weaponData = {
          type: 'projectile',
          damage: 5,
          radius: 0.5,
          lifetime: 1.5,
          cooldown: 0.05
        };
        break;
      case 'laser':
        weaponData = {
          type: 'beam',
          damage: 30,
          range: 1000,
          width: 2,
          cooldown: 0.3
        };
        break;
      default:
        weaponData = {
          type: 'projectile',
          damage: 10,
          radius: 1,
          lifetime: 2,
          cooldown: 0.15
        };
    }
    
    // Apply cooldown
    this.cooldowns.primaryWeapon = weaponData.cooldown;
    
    // Consume ammo
    this.ammo--;
    this._changedProperties.add('ammo');
    
    // Create result including projectile data
    const result = {
      playerId: this.id,
      weaponType: this.loadout.primaryWeapon,
      origin,
      velocity,
      direction,
      ...weaponData
    };
    
    // Weapon fired event
    this.emit('weaponFired', {
      weapon: this.loadout.primaryWeapon,
      type: 'primary',
      ...result
    });
    
    return result;
  }
  
  /**
   * Apply a secondary weapon action
   * @param {Object} target - Optional target information
   * @returns {Object|null} Action result or null if action couldn't be performed
   */
  fireSecondaryWeapon(target = null) {
    // Check if weapon can be fired
    if (!this.isAlive || this.cooldowns.secondaryWeapon > 0 || this.missiles <= 0) {
      return null;
    }
    
    // Calculate weapon origin and direction
    const origin = this.position.clone();
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyEuler(this.rotation);
    
    // Move origin forward from aircraft center
    origin.add(forward.clone().multiplyScalar(this.dimensions.z / 2));
    
    // Calculate initial velocity based on aircraft velocity + initial speed
    const initialSpeed = 100; // m/s
    const direction = forward.clone().normalize();
    const velocity = this.velocity.clone().add(
      direction.clone().multiplyScalar(initialSpeed)
    );
    
    // Weapon specifics based on type
    let weaponData;
    switch (this.loadout.secondaryWeapon) {
      case 'missile':
        weaponData = {
          type: 'missile',
          damage: 75,
          blastRadius: 10,
          speed: 250,
          acceleration: 50,
          maxSpeed: 350,
          turnRate: 2.0,
          lifetime: 10,
          cooldown: 1.5
        };
        break;
      case 'rocket':
        weaponData = {
          type: 'rocket',
          damage: 60,
          blastRadius: 8,
          speed: 300,
          acceleration: 20,
          maxSpeed: 300,
          turnRate: 0.1, // Less tracking than missile
          lifetime: 5,
          cooldown: 1.0
        };
        break;
      case 'bomb':
        weaponData = {
          type: 'bomb',
          damage: 120,
          blastRadius: 20,
          speed: 0, // Drops with gravity
          lifetime: 30,
          cooldown: 2.0
        };
        break;
      default:
        weaponData = {
          type: 'missile',
          damage: 50,
          blastRadius: 5,
          speed: 200,
          acceleration: 30,
          maxSpeed: 300,
          turnRate: 1.5,
          lifetime: 8,
          cooldown: 2.0
        };
    }
    
    // Apply cooldown
    this.cooldowns.secondaryWeapon = weaponData.cooldown;
    
    // Consume missile
    this.missiles--;
    this._changedProperties.add('missiles');
    
    // Create result including weapon data
    const result = {
      playerId: this.id,
      weaponType: this.loadout.secondaryWeapon,
      origin,
      velocity,
      direction,
      target,
      ...weaponData
    };
    
    // Weapon fired event
    this.emit('weaponFired', {
      weapon: this.loadout.secondaryWeapon,
      type: 'secondary',
      ...result
    });
    
    return result;
  }
  
  /**
   * Deploy countermeasures (flares, chaff, etc.)
   * @returns {Object|null} Action result or null if action couldn't be performed
   */
  deployCountermeasures() {
    // Check if countermeasures can be deployed
    if (!this.isAlive || this.cooldowns.countermeasures > 0 || this.countermeasures <= 0) {
      return null;
    }
    
    // Calculate deployment position (slightly behind the aircraft)
    const origin = this.position.clone();
    const backward = new THREE.Vector3(0, 0, 1);
    backward.applyEuler(this.rotation);
    
    // Move origin behind aircraft
    origin.add(backward.clone().multiplyScalar(this.dimensions.z / 2));
    
    // Countermeasure data
    const countermeasureData = {
      type: 'flare',
      duration: 4, // seconds
      effectRadius: 20,
      cooldown: 5
    };
    
    // Apply cooldown
    this.cooldowns.countermeasures = countermeasureData.cooldown;
    
    // Consume countermeasure
    this.countermeasures--;
    this._changedProperties.add('countermeasures');
    
    // Create result
    const result = {
      playerId: this.id,
      origin,
      velocity: this.velocity.clone().add(backward.multiplyScalar(10)),
      ...countermeasureData
    };
    
    // Countermeasure deployed event
    this.emit('countermeasureDeployed', result);
    
    return result;
  }
  
  /**
   * Use a special ability
   * @param {string} abilityName - Name of the ability to use
   * @returns {Object|null} Action result or null if action couldn't be performed
   */
  useAbility(abilityName) {
    // Check if ability exists and is not on cooldown
    if (!this.isAlive || !this.loadout.specialAbility || 
        (this.cooldowns.abilities[abilityName] || 0) > 0) {
      return null;
    }
    
    // Ability specifications
    const abilities = {
      'afterburner': {
        duration: 5,
        cooldown: 15,
        effect: () => {
          this.controls.afterburner = true;
          
          // Set timer to turn off afterburner
          setTimeout(() => {
            this.controls.afterburner = false;
            this._changedProperties.add('controls');
          }, 5000);
          
          return { type: 'self_buff', stat: 'speed', multiplier: 1.5 };
        }
      },
      'repair': {
        duration: 0,
        cooldown: 45,
        effect: () => {
          const oldHealth = this.health;
          this.health = Math.min(100, this.health + 30);
          
          if (this.health !== oldHealth) {
            this._changedHealth = true;
            this._changedProperties.add('health');
          }
          
          return { type: 'heal', amount: this.health - oldHealth };
        }
      },
      'cloak': {
        duration: 8,
        cooldown: 60,
        effect: () => {
          // Apply cloaking effect
          this.isInvulnerable = true;
          
          // Set timer to remove effect
          setTimeout(() => {
            this.isInvulnerable = false;
          }, 8000);
          
          return { type: 'cloak', duration: 8 };
        }
      }
    };
    
    // Check if ability exists
    if (!abilities[abilityName]) {
      return null;
    }
    
    const ability = abilities[abilityName];
    
    // Apply ability effect
    const abilityResult = ability.effect();
    
    // Apply cooldown
    this.cooldowns.abilities[abilityName] = ability.cooldown;
    
    // Create result
    const result = {
      playerId: this.id,
      abilityName,
      cooldown: ability.cooldown,
      duration: ability.duration,
      ...abilityResult
    };
    
    // Ability used event
    this.emit('abilityUsed', {
      ability: abilityName,
      ...result
    });
    
    return result;
  }
  
  /**
   * Add score and process rewards
   * @param {number} amount - Amount of score to add
   * @param {string} reason - Reason for the score
   */
  addScore(amount, reason = 'generic') {
    // Add score
    this.score += amount;
    this._changedProperties.add('score');
    
    // Different token rewards based on reason
    let tokenMultiplier = 0.1; // 10% of score as tokens by default
    
    switch (reason) {
      case 'kill':
        tokenMultiplier = 0.2; // 20% for kills
        break;
      case 'objective':
        tokenMultiplier = 0.3; // 30% for completing objectives
        break;
      case 'mission':
        tokenMultiplier = 0.5; // 50% for completing missions
        break;
      case 'achievement':
        tokenMultiplier = 1.0; // 100% for achievements
        break;
    }
    
    // Calculate token reward
    // Only award if player has a wallet and enough time has passed
    const now = Date.now();
    const minRewardInterval = 5000; // 5 seconds minimum between rewards
    
    if (this.walletAddress && now - this.lastRewardTime > minRewardInterval) {
      const tokenReward = Math.max(1, Math.floor(amount * tokenMultiplier));
      this.tokensEarned += tokenReward;
      this.lastRewardTime = now;
      
      // Token earned event
      this.emit('tokensEarned', {
        amount: tokenReward,
        reason,
        total: this.tokensEarned,
        walletAddress: this.walletAddress
      });
    }
    
    // Score event
    this.emit('scoreAdded', {
      amount,
      reason,
      total: this.score
    });
  }
  
  /**
   * Process a kill (when this player defeats another player)
   * @param {Object} victim - Player that was defeated
   */
  processKill(victim) {
    // Update stats
    this.kills++;
    this._changedProperties.add('kills');
    
    // Add score based on victim's recent performance
    const baseKillScore = 100;
    let bonusScore = 0;
    
    // Bonus for killing players with high scores
    if (victim.score > this.score) {
      bonusScore += (victim.score - this.score) * 0.1; // 10% of the difference
    }
    
    // Bonus for killing players on killstreaks
    if (victim.kills > victim.deaths) {
      bonusScore += (victim.kills - victim.deaths) * 10;
    }
    
    // Cap bonus score
    bonusScore = Math.min(bonusScore, 500);
    
    // Add score
    this.addScore(baseKillScore + bonusScore, 'kill');
    
    // Kill event
    this.emit('kill', {
      victimId: victim.id,
      victimName: victim.username,
      score: baseKillScore + bonusScore,
      position: this.position.clone()
    });
    
    // Check for killstreak achievements
    this._checkKillstreakAchievements();
  }
  
  /**
   * Check for killstreak achievements
   * @private
   */
  _checkKillstreakAchievements() {
    // Calculate killstreak (kills since last death)
    const deaths = Math.max(1, this.deaths);
    const killstreak = this.kills / deaths;
    
    // Achievement thresholds
    const thresholds = [
      { streak: 3, achievement: 'killstreak_3', reward: 5 },
      { streak: 5, achievement: 'killstreak_5', reward: 10 },
      { streak: 10, achievement: 'killstreak_10', reward: 25 },
      { streak: 20, achievement: 'killstreak_20', reward: 50 }
    ];
    
    // Check each threshold
    for (const { streak, achievement, reward } of thresholds) {
      if (killstreak >= streak && !this.achievements.has(achievement)) {
        // Award achievement
        this.achievements.add(achievement);
        
        // Add score
        this.addScore(reward * 10, 'achievement');
        
        // Achievement event
        this.emit('achievementUnlocked', {
          achievement,
          score: reward * 10,
          tokenReward: reward
        });
      }
    }
  }
  
  /**
   * Process mission updates
   * @param {Object} mission - Mission data
   * @param {Array} completedObjectives - Array of completed objective IDs
   */
  updateMission(mission, completedObjectives = []) {
    // Get mission from active missions or add it
    if (!this.activeMissions.has(mission.id)) {
      // Clone mission and initialize progress
      const playerMission = {
        ...mission,
        progress: 0,
        completedObjectives: new Set()
      };
      
      this.activeMissions.set(mission.id, playerMission);
    }
    
    const playerMission = this.activeMissions.get(mission.id);
    
    // Process newly completed objectives
    let newCompletions = 0;
    for (const objectiveId of completedObjectives) {
      if (!playerMission.completedObjectives.has(objectiveId)) {
        playerMission.completedObjectives.add(objectiveId);
        newCompletions++;
      }
    }
    
    // Update mission progress
    if (mission.objectives && mission.objectives.length > 0) {
      const totalObjectives = mission.objectives.length;
      const completedCount = playerMission.completedObjectives.size;
      
      playerMission.progress = (completedCount / totalObjectives) * 100;
    }
    
    // Add score for new objective completions
    if (newCompletions > 0) {
      const objectiveScore = 50 * newCompletions;
      this.addScore(objectiveScore, 'objective');
      
      // Objective completed event
      this.emit('objectiveCompleted', {
        missionId: mission.id,
        count: newCompletions,
        progress: playerMission.progress,
        score: objectiveScore
      });
    }
    
    // Check for mission completion
    if (playerMission.progress >= 100 && !this.completedMissions.has(mission.id)) {
      this._completeMission(mission);
    }
  }
  
  /**
   * Process mission completion
   * @param {Object} mission - Mission data
   * @private
   */
  _completeMission(mission) {
    // Mark mission as complete
    this.completedMissions.add(mission.id);
    
    // Calculate rewards
    const completionScore = 200 * (mission.difficulty || 1);
    this.addScore(completionScore, 'mission');
    
    // Award tokens
    const tokenReward = mission.rewards?.tokens || (20 * (mission.difficulty || 1));
    
    // Mission completed event
    this.emit('missionCompleted', {
      missionId: mission.id,
      missionName: mission.name,
      score: completionScore,
      tokenReward
    });
    
    // Check for achievement
    if (this.completedMissions.size >= 5 && !this.achievements.has('mission_expert')) {
      this.achievements.add('mission_expert');
      
      // Achievement event
      this.emit('achievementUnlocked', {
        achievement: 'mission_expert',
        score: 300,
        tokenReward: 30
      });
      
      this.addScore(300, 'achievement');
    }
  }
  
  /**
   * Refuel the aircraft
   * @param {number} amount - Amount to refuel (0-100)
   */
  refuel(amount) {
    if (!this.isAlive) return;
    
    const oldFuel = this.fuel;
    this.fuel = Math.min(100, this.fuel + amount);
    
    if (this.fuel !== oldFuel) {
      this._changedProperties.add('fuel');
      
      // Refuel event
      this.emit('refueled', {
        amount: this.fuel - oldFuel,
        total: this.fuel
      });
    }
  }
  
  /**
   * Rearm the aircraft
   * @param {number} ammo - Amount of ammo to add
   * @param {number} missiles - Amount of missiles to add
   * @param {number} countermeasures - Amount of countermeasures to add
   */
  rearm(ammo = 0, missiles = 0, countermeasures = 0) {
    if (!this.isAlive) return;
    
    const updates = {};
    
    if (ammo > 0) {
      const oldAmmo = this.ammo;
      this.ammo = Math.min(100, this.ammo + ammo);
      
      if (this.ammo !== oldAmmo) {
        updates.ammo = this.ammo - oldAmmo;
        this._changedProperties.add('ammo');
      }
    }
    
    if (missiles > 0) {
      const oldMissiles = this.missiles;
      this.missiles = Math.min(10, this.missiles + missiles);
      
      if (this.missiles !== oldMissiles) {
        updates.missiles = this.missiles - oldMissiles;
        this._changedProperties.add('missiles');
      }
    }
    
    if (countermeasures > 0) {
      const oldCountermeasures = this.countermeasures;
      this.countermeasures = Math.min(10, this.countermeasures + countermeasures);
      
      if (this.countermeasures !== oldCountermeasures) {
        updates.countermeasures = this.countermeasures - oldCountermeasures;
        this._changedProperties.add('countermeasures');
      }
    }
    
    // If anything changed, emit rearm event
    if (Object.keys(updates).length > 0) {
      this.emit('rearmed', updates);
    }
  }
  
  /**
   * Repair the aircraft
   * @param {number} amount - Amount to repair (0-100)
   */
  repair(amount) {
    if (!this.isAlive) return;
    
    const oldHealth = this.health;
    this.health = Math.min(100, this.health + amount);
    
    if (this.health !== oldHealth) {
      this._changedHealth = true;
      this._changedProperties.add('health');
      
      // Repair event
      this.emit('repaired', {
        amount: this.health - oldHealth,
        total: this.health
      });
    }
  }
  
  /**
   * Set player controls
   * @param {Object} controls - Control inputs
   */
  setControls(controls) {
    // Only update if player is alive
    if (!this.isAlive) return;
    
    // Update existing controls
    let changed = false;
    
    for (const control in controls) {
      if (this.controls[control] !== controls[control]) {
        this.controls[control] = controls[control];
        changed = true;
      }
    }
    
    if (changed) {
      this._changedProperties.add('controls');
      
      // Controls changed event
      this.emit('controlsChanged', { ...this.controls });
    }
  }
  
  /**
   * Spawn player at a specific position
   * @param {Object} position - Spawn position
   * @param {Object} options - Spawn options
   */
  spawn(position, options = {}) {
    // Set position
    this.position.set(position.x, position.y, position.z);
    this._changedPosition = true;
    this._changedProperties.add('position');
    
    // Reset rotation
    if (options.rotation) {
      this.rotation.copy(options.rotation);
    } else {
      this.rotation.set(0, 0, 0);
    }
    this._changedProperties.add('rotation');
    
    // Reset velocity
    this.velocity.set(0, 0, 0);
    this._changedProperties.add('velocity');
    
    // Reset state
    this.state = PLAYER_STATES.SPAWNING;
    this.isAlive = true;
    this.isInvulnerable = true; // Brief invulnerability on spawn
    this._changedState = true;
    this._changedProperties.add('state');
    
    // Reset health and resources
    this.health = 100;
    this.fuel = 100;
    this.ammo = 100;
    this.missiles = 4;
    this.countermeasures = 2;
    this._changedHealth = true;
    this._changedProperties.add('health');
    this._changedProperties.add('fuel');
    this._changedProperties.add('ammo');
    this._changedProperties.add('missiles');
    this._changedProperties.add('countermeasures');
    
    // Reset cooldowns
    this.cooldowns.primaryWeapon = 0;
    this.cooldowns.secondaryWeapon = 0;
    this.cooldowns.countermeasures = 0;
    this.cooldowns.abilities = {};
    
    // Update bounds
    this.bounds.setFromCenterAndSize(
      this.position.clone(),
      new THREE.Vector3(this.dimensions.x, this.dimensions.y, this.dimensions.z)
    );
    
    // Start spawn invulnerability timer
    const invulnerabilityDuration = options.invulnerabilityDuration || 3000; // 3 seconds
    setTimeout(() => {
      this.isInvulnerable = false;
    }, invulnerabilityDuration);
    
    // Spawn event
    this.emit('spawn', {
      position: this.position.clone(),
      rotation: this.rotation.clone()
    });
  }
  
  /**
   * Get serialized state for network transmission (full state)
   * @returns {Object} Serialized state
   */
  serialize() {
    return {
      id: this.id,
      userId: this.userId,
      username: this.username,
      teamId: this.teamId,
      aircraftType: this.aircraftType,
      skin: this.skin,
      state: this.state,
      position: {
        x: this.position.x,
        y: this.position.y,
        z: this.position.z
      },
      rotation: {
        x: this.rotation.x,
        y: this.rotation.y,
        z: this.rotation.z
      },
      velocity: {
        x: this.velocity.x,
        y: this.velocity.y,
        z: this.velocity.z
      },
      controls: { ...this.controls },
      health: this.health,
      fuel: this.fuel,
      ammo: this.ammo,
      missiles: this.missiles,
      countermeasures: this.countermeasures,
      score: this.score,
      kills: this.kills,
      deaths: this.deaths,
      isAlive: this.isAlive,
      isLanded: this.isLanded
    };
  }
  
  /**
   * Get delta state for network transmission (only changed properties)
   * @returns {Object} Delta state
   */
  serializeDelta() {
    if (this._changedProperties.size === 0) {
      return null;
    }
    
    const delta = {
      id: this.id,
      t: Date.now() // timestamp
    };
    
    // Add changed properties
    for (const prop of this._changedProperties) {
      switch (prop) {
        case 'position':
          delta.p = {
            x: this.position.x,
            y: this.position.y,
            z: this.position.z
          };
          break;
        case 'rotation':
          delta.r = {
            x: this.rotation.x,
            y: this.rotation.y,
            z: this.rotation.z
          };
          break;
        case 'velocity':
          delta.v = {
            x: this.velocity.x,
            y: this.velocity.y,
            z: this.velocity.z
          };
          break;
        case 'health':
          delta.h = this.health;
          break;
        case 'fuel':
          delta.f = this.fuel;
          break;
        case 'state':
          delta.s = this.state;
          break;
        case 'controls':
          delta.c = { ...this.controls };
          break;
        case 'ammo':
          delta.a = this.ammo;
          break;
        case 'missiles':
          delta.m = this.missiles;
          break;
        case 'countermeasures':
          delta.cm = this.countermeasures;
          break;
        case 'score':
          delta.sc = this.score;
          break;
        case 'kills':
          delta.k = this.kills;
          break;
        case 'deaths':
          delta.d = this.deaths;
          break;
        case 'isLanded':
          delta.il = this.isLanded;
          break;
        case 'flightData':
          delta.fd = { ...this.flightData };
          break;
      }
    }
    
    return delta;
  }
  
  /**
   * Apply a state update from network
   * @param {Object} state - State update
   */
  applyState(state) {
    // Apply position if provided
    if (state.p || state.position) {
      const pos = state.p || state.position;
      this.position.set(pos.x, pos.y, pos.z);
      this._changedPosition = true;
      this._changedProperties.add('position');
    }
    
    // Apply rotation if provided
    if (state.r || state.rotation) {
      const rot = state.r || state.rotation;
      this.rotation.set(rot.x, rot.y, rot.z);
      this._changedPosition = true;
      this._changedProperties.add('rotation');
    }
    
    // Apply velocity if provided
    if (state.v || state.velocity) {
      const vel = state.v || state.velocity;
      this.velocity.set(vel.x, vel.y, vel.z);
      this._changedPosition = true;
      this._changedProperties.add('velocity');
    }
    
    // Apply health if provided
    if (state.h !== undefined || state.health !== undefined) {
      const health = state.h !== undefined ? state.h : state.health;
      this.health = health;
      this._changedHealth = true;
      this._changedProperties.add('health');
    }
    
    // Apply fuel if provided
    if (state.f !== undefined || state.fuel !== undefined) {
      const fuel = state.f !== undefined ? state.f : state.fuel;
      this.fuel = fuel;
      this._changedProperties.add('fuel');
    }
    
    // Apply state if provided
    if (state.s !== undefined || state.state !== undefined) {
      const playerState = state.s !== undefined ? state.s : state.state;
      this.state = playerState;
      this._changedState = true;
      this._changedProperties.add('state');
    }
    
    // Apply controls if provided
    if (state.c || state.controls) {
      const controls = state.c || state.controls;
      Object.assign(this.controls, controls);
      this._changedProperties.add('controls');
    }
    
    // Apply ammo if provided
    if (state.a !== undefined || state.ammo !== undefined) {
      const ammo = state.a !== undefined ? state.a : state.ammo;
      this.ammo = ammo;
      this._changedProperties.add('ammo');
    }
    
    // Apply missiles if provided
    if (state.m !== undefined || state.missiles !== undefined) {
      const missiles = state.m !== undefined ? state.m : state.missiles;
      this.missiles = missiles;
      this._changedProperties.add('missiles');
    }
    
    // Apply countermeasures if provided
    if (state.cm !== undefined || state.countermeasures !== undefined) {
      const cm = state.cm !== undefined ? state.cm : state.countermeasures;
      this.countermeasures = cm;
      this._changedProperties.add('countermeasures');
    }
    
    // Apply score if provided
    if (state.sc !== undefined || state.score !== undefined) {
      const score = state.sc !== undefined ? state.sc : state.score;
      this.score = score;
      this._changedProperties.add('score');
    }
    
    // Apply kills if provided
    if (state.k !== undefined || state.kills !== undefined) {
      const kills = state.k !== undefined ? state.k : state.kills;
      this.kills = kills;
      this._changedProperties.add('kills');
    }
    
    // Apply deaths if provided
    if (state.d !== undefined || state.deaths !== undefined) {
      const deaths = state.d !== undefined ? state.d : state.deaths;
      this.deaths = deaths;
      this._changedProperties.add('deaths');
    }
    
    // Apply landed state if provided
    if (state.il !== undefined || state.isLanded !== undefined) {
      const isLanded = state.il !== undefined ? state.il : state.isLanded;
      this.isLanded = isLanded;
      this._changedProperties.add('isLanded');
    }
    
    // Apply flight data if provided
    if (state.fd || state.flightData) {
      const fd = state.fd || state.flightData;
      Object.assign(this.flightData, fd);
      this._changedProperties.add('flightData');
    }
    
    // Update bounds
    this.bounds.setFromCenterAndSize(
      this.position.clone(),
      new THREE.Vector3(this.dimensions.x, this.dimensions.y, this.dimensions.z)
    );
  }
}

/**
 * Manages the state of all players in a session
 */
class PlayerManager {
  /**
   * Create a new player manager
   */
  constructor() {
    this.players = new Map();
    this.teams = new Map();
  }
  
  /**
   * Create a new player
   * @param {Object} config - Player configuration
   * @returns {PlayerState} New player state
   */
  createPlayer(config) {
    const player = new PlayerState(config);
    this.players.set(player.id, player);
    return player;
  }
  
  /**
   * Get a player by ID
   * @param {string} playerId - Player ID
   * @returns {PlayerState|null} Player state or null if not found
   */
  getPlayer(playerId) {
    return this.players.get(playerId) || null;
  }
  
  /**
   * Remove a player
   * @param {string} playerId - Player ID
   */
  removePlayer(playerId) {
    this.players.delete(playerId);
  }
  
  /**
   * Update all players
   * @param {number} deltaTime - Time in seconds since last update
   * @param {Object} options - Update options
   */
  updateAll(deltaTime, options = {}) {
    for (const player of this.players.values()) {
      player.update(deltaTime, options);
    }
  }
  
  /**
   * Create a team
   * @param {Object} teamConfig - Team configuration
   * @returns {string} Team ID
   */
  createTeam(teamConfig) {
    const teamId = teamConfig.id || uuidv4();
    
    this.teams.set(teamId, {
      id: teamId,
      name: teamConfig.name || `Team ${teamId.substr(0, 4)}`,
      players: new Set(),
      score: 0,
      color: teamConfig.color || '#ff0000'
    });
    
    return teamId;
  }
  
  /**
   * Add a player to a team
   * @param {string} playerId - Player ID
   * @param {string} teamId - Team ID
   */
  addPlayerToTeam(playerId, teamId) {
    const player = this.players.get(playerId);
    const team = this.teams.get(teamId);
    
    if (!player || !team) return;
    
    // Remove from current team if any
    if (player.teamId) {
      const currentTeam = this.teams.get(player.teamId);
      if (currentTeam) {
        currentTeam.players.delete(playerId);
      }
    }
    
    // Add to new team
    player.teamId = teamId;
    team.players.add(playerId);
  }
  
  /**
   * Get serialized state of all players
   * @param {boolean} delta - Whether to use delta compression
   * @returns {Array} Serialized player states
   */
  serializeAll(delta = false) {
    const serialized = [];
    
    for (const player of this.players.values()) {
      if (delta) {
        const deltaState = player.serializeDelta();
        if (deltaState) {
          serialized.push(deltaState);
        }
      } else {
        serialized.push(player.serialize());
      }
    }
    
    return serialized;
  }
}

module.exports = {
  PlayerState,
  PlayerManager,
  PLAYER_STATES,
  PLAYER_ACTIONS
};