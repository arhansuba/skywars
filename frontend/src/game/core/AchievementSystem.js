/**
 * Achievement and Rewards System
 * 
 * Manages player achievements, missions, rewards, and token distribution.
 * Tracks progress, validates requirements, and handles blockchain token rewards.
 * 
 * @module achievementSystem
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

/**
 * Achievement categories
 * @enum {string}
 */
const ACHIEVEMENT_CATEGORIES = {
  COMBAT: 'combat',
  FLIGHT: 'flight',
  EXPLORATION: 'exploration',
  PROGRESSION: 'progression',
  SOCIAL: 'social',
  COLLECTION: 'collection',
  CHALLENGE: 'challenge'
};

/**
 * Reward types
 * @enum {string}
 */
const REWARD_TYPES = {
  TOKEN: 'token',
  ITEM: 'item',
  SKIN: 'skin',
  AIRCRAFT: 'aircraft',
  BADGE: 'badge',
  TITLE: 'title',
  UNLOCK: 'unlock'
};

/**
 * Achievement definition with requirements and rewards
 */
class Achievement {
  /**
   * Create a new achievement definition
   * @param {Object} config - Achievement configuration
   */
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.category = config.category;
    this.icon = config.icon;
    this.secret = config.secret || false;
    this.tier = config.tier || 1; // 1-3 (bronze, silver, gold)
    
    // Achievement requirements
    this.requirements = config.requirements || [];
    
    // Achievement rewards
    this.rewards = config.rewards || [];
    
    // Token reward (can be directly specified or in rewards array)
    this.tokenReward = config.tokenReward || 0;
    
    // Score reward
    this.scoreReward = config.scoreReward || (this.tokenReward * 10);
    
    // Follow-up achievements
    this.nextTier = config.nextTier || null;
    
    // Initialization flag
    this.initialized = false;
  }
}

/**
 * Mission definition with objectives and rewards
 */
class Mission {
  /**
   * Create a new mission definition
   * @param {Object} config - Mission configuration
   */
  constructor(config) {
    this.id = config.id || uuidv4();
    this.name = config.name;
    this.description = config.description;
    this.type = config.type;
    this.difficulty = config.difficulty || 1; // 1-3
    this.timeLimit = config.timeLimit || 0; // 0 = unlimited
    this.objectives = config.objectives || [];
    this.rewards = config.rewards || [];
    this.tokenReward = config.tokenReward || (10 * this.difficulty);
    this.scoreReward = config.scoreReward || (100 * this.difficulty);
    this.requiredLevel = config.requiredLevel || 0;
    this.unlockRequirements = config.unlockRequirements || [];
    this.repeatable = config.repeatable || false;
    this.cooldown = config.cooldown || 0; // Time before mission can be repeated (ms)
    this.position = config.position; // World position for mission
    this.radius = config.radius || 1000; // Activity radius
  }
}

/**
 * Requirement definition for achievements and missions
 */
class Requirement {
  /**
   * Create a new requirement definition
   * @param {Object} config - Requirement configuration
   */
  constructor(config) {
    this.type = config.type;
    this.target = config.target || null;
    this.value = config.value || 1;
    this.comparison = config.comparison || 'gte'; // gte, lte, eq
    
    // Optional time constraint
    this.timeframe = config.timeframe || null; // in seconds
    // Optional map constraint
    this.location = config.location || null;
    // Optional condition
    this.condition = config.condition || null;
  }
  
  /**
   * Check if requirement is met
   * @param {Object} playerState - Player state to check
   * @param {Object} gameState - Game state to check
   * @returns {boolean} True if requirement is met
   */
  isMet(playerState, gameState) {
    // Access the target value from player state or game state
    let targetValue;
    
    // Simple path-based target access
    if (typeof this.target === 'string') {
      const path = this.target.split('.');
      let current = playerState;
      
      for (const key of path) {
        if (current === undefined || current === null) {
          return false;
        }
        current = current[key];
      }
      
      targetValue = current;
    } 
    // Function-based evaluation
    else if (typeof this.target === 'function') {
      targetValue = this.target(playerState, gameState);
    }
    // Default case
    else {
      targetValue = null;
    }
    
    // Check if value meets requirement based on comparison type
    switch (this.comparison) {
      case 'gte':
        return targetValue >= this.value;
      case 'lte':
        return targetValue <= this.value;
      case 'eq':
        return targetValue === this.value;
      case 'ne':
        return targetValue !== this.value;
      case 'gt':
        return targetValue > this.value;
      case 'lt':
        return targetValue < this.value;
      default:
        return false;
    }
  }
}

/**
 * Reward definition for achievements and missions
 */
class Reward {
  /**
   * Create a new reward definition
   * @param {Object} config - Reward configuration
   */
  constructor(config) {
    this.type = config.type;
    this.value = config.value;
    this.name = config.name || '';
    this.description = config.description || '';
    this.iconUrl = config.iconUrl || '';
    this.data = config.data || {};
  }
}

/**
 * Achievement progress for a player
 */
class AchievementProgress {
  /**
   * Create a new achievement progress tracker
   * @param {string} achievementId - Achievement ID
   * @param {string} playerId - Player ID
   */
  constructor(achievementId, playerId) {
    this.achievementId = achievementId;
    this.playerId = playerId;
    this.progress = 0;
    this.completed = false;
    this.completedAt = null;
    this.requirementProgress = new Map();
    this.rewarded = false;
  }
  
  /**
   * Mark achievement as completed
   */
  complete() {
    this.completed = true;
    this.completedAt = Date.now();
  }
}

/**
 * Mission progress for a player
 */
class MissionProgress {
  /**
   * Create a new mission progress tracker
   * @param {string} missionId - Mission ID
   * @param {string} playerId - Player ID
   */
  constructor(missionId, playerId) {
    this.missionId = missionId;
    this.playerId = playerId;
    this.status = 'not_started'; // not_started, in_progress, completed, failed
    this.startedAt = null;
    this.completedAt = null;
    this.objectives = new Map(); // Map of objective IDs to completion status
    this.progress = 0;
    this.rewarded = false;
    this.attempts = 0;
    this.lastAttempt = null;
  }
  
  /**
   * Start the mission
   */
  start() {
    this.status = 'in_progress';
    this.startedAt = Date.now();
    this.attempts++;
    this.lastAttempt = Date.now();
  }
  
  /**
   * Complete an objective
   * @param {string} objectiveId - Objective ID
   */
  completeObjective(objectiveId) {
    this.objectives.set(objectiveId, true);
  }
  
  /**
   * Check if all objectives are completed
   * @param {Array} totalObjectives - Array of all mission objectives
   * @returns {boolean} True if all objectives are completed
   */
  areAllObjectivesCompleted(totalObjectives) {
    if (!totalObjectives || totalObjectives.length === 0) {
      return false;
    }
    
    // Check if all objectives are completed
    const completedCount = Array.from(this.objectives.values()).filter(Boolean).length;
    return completedCount === totalObjectives.length;
  }
  
  /**
   * Update mission progress percentage
   * @param {Array} totalObjectives - Array of all mission objectives
   */
  updateProgress(totalObjectives) {
    if (!totalObjectives || totalObjectives.length === 0) {
      this.progress = 0;
      return;
    }
    
    const completedCount = Array.from(this.objectives.values()).filter(Boolean).length;
    this.progress = Math.round((completedCount / totalObjectives.length) * 100);
  }
  
  /**
   * Complete the mission
   */
  complete() {
    this.status = 'completed';
    this.completedAt = Date.now();
  }
  
  /**
   * Fail the mission
   */
  fail() {
    this.status = 'failed';
  }
}

/**
 * Manages achievements, missions, and rewards
 */
class AchievementSystem extends EventEmitter {
  /**
   * Create a new achievement system
   * @param {Object} options - System options
   */
  constructor(options = {}) {
    super();
    
    this.options = Object.assign({
      tokenRewardEnabled: true,
      autoTrackAchievements: true,
      progressPersistence: true,
      difficultyScaling: true
    }, options);
    
    // Collections
    this.achievements = new Map();
    this.missions = new Map();
    this.playerProgress = new Map(); // Map of player IDs to progress objects
    this.activeMissions = new Map(); // Map of player IDs to active mission IDs
    
    // Token service for blockchain rewards
    this.tokenService = options.tokenService || null;
    
    // Event hooks
    this.eventHandlers = new Map();
    
    // Initialize predefined achievements and missions
    this._initializePredefined();
  }
  
  /**
   * Initialize predefined achievements and missions
   * @private
   */
  _initializePredefined() {
    // Combat achievements
    this._createPredefinedAchievements();
    
    // Flight achievements
    this._createFlightAchievements();
    
    // Progression achievements
    this._createProgressionAchievements();
    
    // Exploration achievements
    this._createExplorationAchievements();
    
    // Create predefined missions
    this._createPredefinedMissions();
  }
  
  /**
   * Create predefined combat achievements
   * @private
   */
  _createPredefinedAchievements() {
    // First blood achievement
    this.registerAchievement({
      id: 'first_blood',
      name: 'First Blood',
      description: 'Shoot down your first enemy aircraft',
      category: ACHIEVEMENT_CATEGORIES.COMBAT,
      icon: 'first_blood.png',
      requirements: [
        { type: 'kill', target: 'kills', value: 1, comparison: 'gte' }
      ],
      tokenReward: 5,
      scoreReward: 50
    });
    
    // Ace pilot achievement series
    this.registerAchievement({
      id: 'ace_pilot_bronze',
      name: 'Rookie Ace',
      description: 'Shoot down 5 enemy aircraft',
      category: ACHIEVEMENT_CATEGORIES.COMBAT,
      tier: 1,
      icon: 'ace_bronze.png',
      requirements: [
        { type: 'kill', target: 'kills', value: 5, comparison: 'gte' }
      ],
      tokenReward: 10,
      scoreReward: 100,
      nextTier: 'ace_pilot_silver'
    });
    
    this.registerAchievement({
      id: 'ace_pilot_silver',
      name: 'Veteran Ace',
      description: 'Shoot down 25 enemy aircraft',
      category: ACHIEVEMENT_CATEGORIES.COMBAT,
      tier: 2,
      icon: 'ace_silver.png',
      requirements: [
        { type: 'kill', target: 'kills', value: 25, comparison: 'gte' }
      ],
      tokenReward: 25,
      scoreReward: 250,
      nextTier: 'ace_pilot_gold'
    });
    
    this.registerAchievement({
      id: 'ace_pilot_gold',
      name: 'Legendary Ace',
      description: 'Shoot down 100 enemy aircraft',
      category: ACHIEVEMENT_CATEGORIES.COMBAT,
      tier: 3,
      icon: 'ace_gold.png',
      requirements: [
        { type: 'kill', target: 'kills', value: 100, comparison: 'gte' }
      ],
      tokenReward: 50,
      scoreReward: 500
    });
    
    // Killstreak achievements
    this.registerAchievement({
      id: 'killstreak_3',
      name: 'Killing Spree',
      description: 'Shoot down 3 enemy aircraft without dying',
      category: ACHIEVEMENT_CATEGORIES.COMBAT,
      icon: 'killstreak_3.png',
      requirements: [
        { 
          type: 'killstreak', 
          target: (player) => player.kills / Math.max(1, player.deaths), 
          value: 3, 
          comparison: 'gte' 
        }
      ],
      tokenReward: 5,
      scoreReward: 50
    });
    
    this.registerAchievement({
      id: 'killstreak_5',
      name: 'Rampage',
      description: 'Shoot down 5 enemy aircraft without dying',
      category: ACHIEVEMENT_CATEGORIES.COMBAT,
      icon: 'killstreak_5.png',
      requirements: [
        { 
          type: 'killstreak', 
          target: (player) => player.kills / Math.max(1, player.deaths), 
          value: 5, 
          comparison: 'gte' 
        }
      ],
      tokenReward: 10,
      scoreReward: 100
    });
    
    this.registerAchievement({
      id: 'killstreak_10',
      name: 'Unstoppable',
      description: 'Shoot down 10 enemy aircraft without dying',
      category: ACHIEVEMENT_CATEGORIES.COMBAT,
      icon: 'killstreak_10.png',
      requirements: [
        { 
          type: 'killstreak', 
          target: (player) => player.kills / Math.max(1, player.deaths), 
          value: 10, 
          comparison: 'gte' 
        }
      ],
      tokenReward: 25,
      scoreReward: 250
    });
    
    // Weapon mastery
    this.registerAchievement({
      id: 'missile_master',
      name: 'Missile Master',
      description: 'Shoot down 20 enemy aircraft using missiles',
      category: ACHIEVEMENT_CATEGORIES.COMBAT,
      icon: 'missile_master.png',
      requirements: [
        { 
          type: 'weapon_kill', 
          target: 'stats.missileKills', 
          value: 20, 
          comparison: 'gte' 
        }
      ],
      tokenReward: 15,
      scoreReward: 150
    });
    
    this.registerAchievement({
      id: 'cannon_master',
      name: 'Cannon Master',
      description: 'Shoot down 30 enemy aircraft using cannons',
      category: ACHIEVEMENT_CATEGORIES.COMBAT,
      icon: 'cannon_master.png',
      requirements: [
        { 
          type: 'weapon_kill', 
          target: 'stats.cannonKills', 
          value: 30, 
          comparison: 'gte' 
        }
      ],
      tokenReward: 15,
      scoreReward: 150
    });
  }
  
  /**
   * Create flight achievements
   * @private
   */
  _createFlightAchievements() {
    // First flight achievement
    this.registerAchievement({
      id: 'first_flight',
      name: 'First Flight',
      description: 'Take to the skies for the first time',
      category: ACHIEVEMENT_CATEGORIES.FLIGHT,
      icon: 'first_flight.png',
      requirements: [
        { type: 'flight', target: 'flightData.airspeed', value: 50, comparison: 'gte' }
      ],
      tokenReward: 2,
      scoreReward: 20
    });
    
    // Speed demon achievements
    this.registerAchievement({
      id: 'speed_demon_bronze',
      name: 'Speed Demon I',
      description: 'Reach a speed of 500 km/h',
      category: ACHIEVEMENT_CATEGORIES.FLIGHT,
      tier: 1,
      icon: 'speed_bronze.png',
      requirements: [
        { type: 'speed', target: 'flightData.airspeedKph', value: 500, comparison: 'gte' }
      ],
      tokenReward: 5,
      scoreReward: 50,
      nextTier: 'speed_demon_silver'
    });
    
    this.registerAchievement({
      id: 'speed_demon_silver',
      name: 'Speed Demon II',
      description: 'Reach a speed of 750 km/h',
      category: ACHIEVEMENT_CATEGORIES.FLIGHT,
      tier: 2,
      icon: 'speed_silver.png',
      requirements: [
        { type: 'speed', target: 'flightData.airspeedKph', value: 750, comparison: 'gte' }
      ],
      tokenReward: 10,
      scoreReward: 100,
      nextTier: 'speed_demon_gold'
    });
    
    this.registerAchievement({
      id: 'speed_demon_gold',
      name: 'Speed Demon III',
      description: 'Reach a speed of 1000 km/h',
      category: ACHIEVEMENT_CATEGORIES.FLIGHT,
      tier: 3,
      icon: 'speed_gold.png',
      requirements: [
        { type: 'speed', target: 'flightData.airspeedKph', value: 1000, comparison: 'gte' }
      ],
      tokenReward: 20,
      scoreReward: 200
    });
    
    // Altitude achievements
    this.registerAchievement({
      id: 'high_flyer_bronze',
      name: 'High Flyer I',
      description: 'Reach an altitude of 5,000 meters',
      category: ACHIEVEMENT_CATEGORIES.FLIGHT,
      tier: 1,
      icon: 'altitude_bronze.png',
      requirements: [
        { type: 'altitude', target: 'flightData.altitude', value: 5000, comparison: 'gte' }
      ],
      tokenReward: 5,
      scoreReward: 50,
      nextTier: 'high_flyer_silver'
    });
    
    this.registerAchievement({
      id: 'high_flyer_silver',
      name: 'High Flyer II',
      description: 'Reach an altitude of 10,000 meters',
      category: ACHIEVEMENT_CATEGORIES.FLIGHT,
      tier: 2,
      icon: 'altitude_silver.png',
      requirements: [
        { type: 'altitude', target: 'flightData.altitude', value: 10000, comparison: 'gte' }
      ],
      tokenReward: 10,
      scoreReward: 100,
      nextTier: 'high_flyer_gold'
    });
    
    this.registerAchievement({
      id: 'high_flyer_gold',
      name: 'High Flyer III',
      description: 'Reach an altitude of 15,000 meters',
      category: ACHIEVEMENT_CATEGORIES.FLIGHT,
      tier: 3,
      icon: 'altitude_gold.png',
      requirements: [
        { type: 'altitude', target: 'flightData.altitude', value: 15000, comparison: 'gte' }
      ],
      tokenReward: 20,
      scoreReward: 200
    });
    
    // Landing achievements
    this.registerAchievement({
      id: 'safe_landing',
      name: 'Safe Landing',
      description: 'Land your aircraft safely',
      category: ACHIEVEMENT_CATEGORIES.FLIGHT,
      icon: 'landing.png',
      requirements: [
        { type: 'landing', target: 'isLanded', value: true, comparison: 'eq' }
      ],
      tokenReward: 5,
      scoreReward: 50
    });
    
    this.registerAchievement({
      id: 'precision_landing',
      name: 'Precision Landing',
      description: 'Land your aircraft with minimal vertical speed',
      category: ACHIEVEMENT_CATEGORIES.FLIGHT,
      icon: 'precision_landing.png',
      requirements: [
        { type: 'landing', target: 'isLanded', value: true, comparison: 'eq' },
        { 
          type: 'vertical_speed', 
          target: (player, gameState) => {
            // Get landing event data if available
            const landingEvent = gameState.events.find(
              e => e.type === 'landed' && e.playerId === player.id
            );
            
            if (landingEvent) {
              return Math.abs(landingEvent.verticalSpeed);
            }
            return 1000; // Will not fulfill requirement
          }, 
          value: 1, 
          comparison: 'lte' 
        }
      ],
      tokenReward: 10,
      scoreReward: 100
    });
  }
  
  /**
   * Create progression achievements
   * @private
   */
  _createProgressionAchievements() {
    // Score achievements
    this.registerAchievement({
      id: 'score_1000',
      name: 'Point Collector I',
      description: 'Earn a total of 1,000 points',
      category: ACHIEVEMENT_CATEGORIES.PROGRESSION,
      tier: 1,
      icon: 'score_bronze.png',
      requirements: [
        { type: 'score', target: 'score', value: 1000, comparison: 'gte' }
      ],
      tokenReward: 5,
      scoreReward: 50,
      nextTier: 'score_5000'
    });
    
    this.registerAchievement({
      id: 'score_5000',
      name: 'Point Collector II',
      description: 'Earn a total of 5,000 points',
      category: ACHIEVEMENT_CATEGORIES.PROGRESSION,
      tier: 2,
      icon: 'score_silver.png',
      requirements: [
        { type: 'score', target: 'score', value: 5000, comparison: 'gte' }
      ],
      tokenReward: 10,
      scoreReward: 100,
      nextTier: 'score_10000'
    });
    
    this.registerAchievement({
      id: 'score_10000',
      name: 'Point Collector III',
      description: 'Earn a total of 10,000 points',
      category: ACHIEVEMENT_CATEGORIES.PROGRESSION,
      tier: 3,
      icon: 'score_gold.png',
      requirements: [
        { type: 'score', target: 'score', value: 10000, comparison: 'gte' }
      ],
      tokenReward: 20,
      scoreReward: 200
    });
    
    // Mission achievements
    this.registerAchievement({
      id: 'mission_expert',
      name: 'Mission Expert',
      description: 'Complete 5 missions',
      category: ACHIEVEMENT_CATEGORIES.PROGRESSION,
      icon: 'mission_expert.png',
      requirements: [
        { 
          type: 'missions_completed', 
          target: (player) => player.completedMissions.size, 
          value: 5, 
          comparison: 'gte' 
        }
      ],
      tokenReward: 30,
      scoreReward: 300
    });
    
    this.registerAchievement({
      id: 'mission_master',
      name: 'Mission Master',
      description: 'Complete 20 missions',
      category: ACHIEVEMENT_CATEGORIES.PROGRESSION,
      icon: 'mission_master.png',
      requirements: [
        { 
          type: 'missions_completed', 
          target: (player) => player.completedMissions.size, 
          value: 20, 
          comparison: 'gte' 
        }
      ],
      tokenReward: 50,
      scoreReward: 500
    });
    
    // Token collector
    this.registerAchievement({
      id: 'token_collector',
      name: 'Token Collector',
      description: 'Earn a total of 100 tokens',
      category: ACHIEVEMENT_CATEGORIES.PROGRESSION,
      icon: 'token_collector.png',
      requirements: [
        { type: 'tokens_earned', target: 'tokensEarned', value: 100, comparison: 'gte' }
      ],
      tokenReward: 20,
      scoreReward: 200
    });
  }
  
  /**
   * Create exploration achievements
   * @private
   */
  _createExplorationAchievements() {
    // Environment achievements
    this.registerAchievement({
      id: 'mountain_explorer',
      name: 'Mountain Explorer',
      description: 'Fly through a mountain range',
      category: ACHIEVEMENT_CATEGORIES.EXPLORATION,
      icon: 'mountain_explorer.png',
      requirements: [
        { 
          type: 'environment', 
          target: (player, gameState) => {
            // Check if player is in mountains
            return gameState.environment?.type === 'mountains';
          }, 
          value: true, 
          comparison: 'eq' 
        }
      ],
      tokenReward: 5,
      scoreReward: 50
    });
    
    this.registerAchievement({
      id: 'desert_explorer',
      name: 'Desert Explorer',
      description: 'Fly over a desert',
      category: ACHIEVEMENT_CATEGORIES.EXPLORATION,
      icon: 'desert_explorer.png',
      requirements: [
        { 
          type: 'environment', 
          target: (player, gameState) => {
            // Check if player is in desert
            return gameState.environment?.type === 'desert';
          }, 
          value: true, 
          comparison: 'eq' 
        }
      ],
      tokenReward: 5,
      scoreReward: 50
    });
    
    this.registerAchievement({
      id: 'ocean_explorer',
      name: 'Ocean Explorer',
      description: 'Fly over the ocean',
      category: ACHIEVEMENT_CATEGORIES.EXPLORATION,
      icon: 'ocean_explorer.png',
      requirements: [
        { 
          type: 'environment', 
          target: (player, gameState) => {
            // Check if player is over ocean
            return gameState.environment?.type === 'ocean';
          }, 
          value: true, 
          comparison: 'eq' 
        }
      ],
      tokenReward: 5,
      scoreReward: 50
    });
    
    // Distance achievements
    this.registerAchievement({
      id: 'distance_100km',
      name: 'Globe Trotter I',
      description: 'Fly a total distance of 100 km',
      category: ACHIEVEMENT_CATEGORIES.EXPLORATION,
      tier: 1,
      icon: 'distance_bronze.png',
      requirements: [
        { type: 'distance', target: 'stats.totalDistance', value: 100000, comparison: 'gte' }
      ],
      tokenReward: 5,
      scoreReward: 50,
      nextTier: 'distance_500km'
    });
    
    this.registerAchievement({
      id: 'distance_500km',
      name: 'Globe Trotter II',
      description: 'Fly a total distance of 500 km',
      category: ACHIEVEMENT_CATEGORIES.EXPLORATION,
      tier: 2,
      icon: 'distance_silver.png',
      requirements: [
        { type: 'distance', target: 'stats.totalDistance', value: 500000, comparison: 'gte' }
      ],
      tokenReward: 10,
      scoreReward: 100,
      nextTier: 'distance_1000km'
    });
    
    this.registerAchievement({
      id: 'distance_1000km',
      name: 'Globe Trotter III',
      description: 'Fly a total distance of 1,000 km',
      category: ACHIEVEMENT_CATEGORIES.EXPLORATION,
      tier: 3,
      icon: 'distance_gold.png',
      requirements: [
        { type: 'distance', target: 'stats.totalDistance', value: 1000000, comparison: 'gte' }
      ],
      tokenReward: 20,
      scoreReward: 200
    });
  }
  
  /**
   * Create predefined missions
   * @private
   */
  _createPredefinedMissions() {
    // Tutorial mission
    this.registerMission({
      id: 'tutorial',
      name: 'Flight Training',
      description: 'Complete basic flight training',
      type: 'training',
      difficulty: 1,
      objectives: [
        {
          id: 'takeoff',
          name: 'Take Off',
          description: 'Take off from the runway',
          type: 'takeoff'
        },
        {
          id: 'reach_altitude',
          name: 'Reach Altitude',
          description: 'Climb to an altitude of 1,000 meters',
          type: 'altitude',
          target: 1000
        },
        {
          id: 'reach_speed',
          name: 'Reach Speed',
          description: 'Accelerate to a speed of 300 km/h',
          type: 'speed',
          target: 300
        },
        {
          id: 'landing',
          name: 'Safe Landing',
          description: 'Land safely back on the runway',
          type: 'landing'
        }
      ],
      tokenReward: 10,
      scoreReward: 100,
      repeatable: false
    });
    
    // Basic dogfight mission
    this.registerMission({
      id: 'dogfight_basic',
      name: 'Basic Dogfight',
      description: 'Defeat 5 enemy aircraft',
      type: 'dogfight',
      difficulty: 1,
      objectives: [
        {
          id: 'kill_5',
          name: 'Shoot Down 5 Enemies',
          description: 'Shoot down 5 enemy aircraft',
          type: 'kill',
          target: 5
        }
      ],
      tokenReward: 15,
      scoreReward: 150,
      repeatable: true,
      cooldown: 3600000 // 1 hour
    });
    
    // Race mission
    this.registerMission({
      id: 'time_trial',
      name: 'Time Trial',
      description: 'Complete the course as fast as possible',
      type: 'race',
      difficulty: 1,
      timeLimit: 300000, // 5 minutes
      objectives: [
        {
          id: 'checkpoint_1',
          name: 'Checkpoint 1',
          description: 'Pass through the first checkpoint',
          type: 'checkpoint',
          position: { x: 1000, y: 500, z: 0 }
        },
        {
          id: 'checkpoint_2',
          name: 'Checkpoint 2',
          description: 'Pass through the second checkpoint',
          type: 'checkpoint',
          position: { x: 2000, y: 700, z: 1000 }
        },
        {
          id: 'checkpoint_3',
          name: 'Checkpoint 3',
          description: 'Pass through the third checkpoint',
          type: 'checkpoint',
          position: { x: 3000, y: 900, z: 0 }
        },
        {
          id: 'checkpoint_4',
          name: 'Checkpoint 4',
          description: 'Pass through the fourth checkpoint',
          type: 'checkpoint',
          position: { x: 2000, y: 1100, z: -1000 }
        },
        {
          id: 'checkpoint_5',
          name: 'Checkpoint 5',
          description: 'Pass through the final checkpoint',
          type: 'checkpoint',
          position: { x: 1000, y: 500, z: 0 }
        }
      ],
      tokenReward: 20,
      scoreReward: 200,
      repeatable: true,
      cooldown: 1800000 // 30 minutes
    });
    
    // Escort mission
    this.registerMission({
      id: 'escort_mission',
      name: 'VIP Escort',
      description: 'Protect the VIP aircraft as it follows its route',
      type: 'escort',
      difficulty: 2,
      timeLimit: 600000, // 10 minutes
      objectives: [
        {
          id: 'escort_vip',
          name: 'Escort the VIP',
          description: 'Keep the VIP aircraft safe until it reaches its destination',
          type: 'escort',
          target: 'vip_aircraft'
        },
        {
          id: 'protect_from_enemies',
          name: 'Protect from Enemies',
          description: 'Defeat any enemies that attack the VIP',
          type: 'kill',
          condition: 'attacking_vip',
          target: 3
        }
      ],
      tokenReward: 30,
      scoreReward: 300,
      repeatable: true,
      cooldown: 7200000 // 2 hours
    });
    
    // Bombing mission
    this.registerMission({
      id: 'bombing_run',
      name: 'Bombing Run',
      description: 'Destroy all target buildings',
      type: 'bombing',
      difficulty: 2,
      objectives: [
        {
          id: 'target_1',
          name: 'Target 1',
          description: 'Destroy the first target',
          type: 'bombing',
          position: { x: 500, y: 0, z: 500 }
        },
        {
          id: 'target_2',
          name: 'Target 2',
          description: 'Destroy the second target',
          type: 'bombing',
          position: { x: 700, y: 0, z: 300 }
        },
        {
          id: 'target_3',
          name: 'Target 3',
          description: 'Destroy the third target',
          type: 'bombing',
          position: { x: 900, y: 0, z: 700 }
        }
      ],
      tokenReward: 25,
      scoreReward: 250,
      repeatable: true,
      cooldown: 5400000 // 1.5 hours
    });
    
    // Recon mission
    this.registerMission({
      id: 'recon_mission',
      name: 'Reconnaissance',
      description: 'Gather intelligence by flying over the target areas',
      type: 'recon',
      difficulty: 1,
      objectives: [
        {
          id: 'recon_1',
          name: 'Recon Point 1',
          description: 'Fly over the first recon point',
          type: 'recon',
          position: { x: 1500, y: 0, z: 1500 }
        },
        {
          id: 'recon_2',
          name: 'Recon Point 2',
          description: 'Fly over the second recon point',
          type: 'recon',
          position: { x: 2500, y: 0, z: 1000 }
        },
        {
          id: 'recon_3',
          name: 'Recon Point 3',
          description: 'Fly over the third recon point',
          type: 'recon',
          position: { x: 2000, y: 0, z: 2000 }
        },
        {
          id: 'return_base',
          name: 'Return to Base',
          description: 'Return to the airbase to deliver the intelligence',
          type: 'landing',
          position: { x: 0, y: 0, z: 0 }
        }
      ],
      tokenReward: 20,
      scoreReward: 200,
      repeatable: true,
      cooldown: 3600000 // 1 hour
    });
  }
  
  /**
   * Register a new achievement
   * @param {Object} config - Achievement configuration
   * @returns {Achievement} Created achievement
   */
  registerAchievement(config) {
    // Create achievement
    const achievement = new Achievement(config);
    
    // Convert requirements to Requirement objects
    achievement.requirements = config.requirements.map(req => new Requirement(req));
    
    // Convert rewards to Reward objects
    if (config.rewards) {
      achievement.rewards = config.rewards.map(reward => new Reward(reward));
    }
    
    // Add token reward if specified
    if (config.tokenReward && config.tokenReward > 0) {
      achievement.rewards.push(new Reward({
        type: REWARD_TYPES.TOKEN,
        value: config.tokenReward,
        name: 'Tokens',
        description: `${config.tokenReward} tokens`
      }));
    }
    
    // Store achievement
    this.achievements.set(achievement.id, achievement);
    achievement.initialized = true;
    
    return achievement;
  }
  
  /**
   * Register a new mission
   * @param {Object} config - Mission configuration
   * @returns {Mission} Created mission
   */
  registerMission(config) {
    // Create mission
    const mission = new Mission(config);
    
    // Convert rewards to Reward objects if needed
    if (config.rewards) {
      mission.rewards = config.rewards.map(reward => new Reward(reward));
    } else {
      mission.rewards = [];
    }
    
    // Add token reward if specified
    if (config.tokenReward && config.tokenReward > 0) {
      mission.rewards.push(new Reward({
        type: REWARD_TYPES.TOKEN,
        value: config.tokenReward,
        name: 'Tokens',
        description: `${config.tokenReward} tokens`
      }));
    }
    
    // Store mission
    this.missions.set(mission.id, mission);
    
    return mission;
  }
  
  /**
   * Get player progress for all achievements
   * @param {string} playerId - Player ID
   * @returns {Map} Map of achievement IDs to progress objects
   */
  getPlayerAchievementProgress(playerId) {
    // Initialize progress for player if not exists
    if (!this.playerProgress.has(playerId)) {
      this.playerProgress.set(playerId, {
        achievements: new Map(),
        missions: new Map()
      });
    }
    
    const playerProgress = this.playerProgress.get(playerId);
    
    // Initialize achievement progress for any new achievements
    for (const [id, achievement] of this.achievements) {
      if (!playerProgress.achievements.has(id)) {
        playerProgress.achievements.set(id, new AchievementProgress(id, playerId));
      }
    }
    
    return playerProgress.achievements;
  }
  
  /**
   * Get player progress for all missions
   * @param {string} playerId - Player ID
   * @returns {Map} Map of mission IDs to progress objects
   */
  getPlayerMissionProgress(playerId) {
    // Initialize progress for player if not exists
    if (!this.playerProgress.has(playerId)) {
      this.playerProgress.set(playerId, {
        achievements: new Map(),
        missions: new Map()
      });
    }
    
    const playerProgress = this.playerProgress.get(playerId);
    
    // Initialize mission progress for any new missions
    for (const [id, mission] of this.missions) {
      if (!playerProgress.missions.has(id)) {
        playerProgress.missions.set(id, new MissionProgress(id, playerId));
      }
    }
    
    return playerProgress.missions;
  }
  
  /**
   * Check if a player has completed an achievement
   * @param {string} playerId - Player ID
   * @param {string} achievementId - Achievement ID
   * @returns {boolean} Whether achievement is completed
   */
  hasCompletedAchievement(playerId, achievementId) {
    const achievements = this.getPlayerAchievementProgress(playerId);
    const progress = achievements.get(achievementId);
    
    return progress && progress.completed;
  }
  
  /**
   * Check if a player has completed a mission
   * @param {string} playerId - Player ID
   * @param {string} missionId - Mission ID
   * @returns {boolean} Whether mission is completed
   */
  hasCompletedMission(playerId, missionId) {
    const missions = this.getPlayerMissionProgress(playerId);
    const progress = missions.get(missionId);
    
    return progress && progress.status === 'completed';
  }
  
  /**
   * Start a mission for a player
   * @param {string} playerId - Player ID
   * @param {string} missionId - Mission ID
   * @returns {Object} Mission start result
   */
  startMission(playerId, missionId) {
    // Check if mission exists
    const mission = this.missions.get(missionId);
    if (!mission) {
      return { success: false, error: 'Mission not found' };
    }
    
    // Get mission progress
    const missionProgress = this.getPlayerMissionProgress(playerId);
    const progress = missionProgress.get(missionId);
    
    // Check if mission is already in progress
    if (progress.status === 'in_progress') {
      return { success: false, error: 'Mission already in progress' };
    }
    
    // Check if mission is on cooldown
    if (mission.cooldown > 0 && progress.lastAttempt) {
      const timeSinceLastAttempt = Date.now() - progress.lastAttempt;
      if (timeSinceLastAttempt < mission.cooldown) {
        const remainingTime = mission.cooldown - timeSinceLastAttempt;
        return { 
          success: false, 
          error: 'Mission on cooldown', 
          remainingTime 
        };
      }
    }
    
    // Start the mission
    progress.start();
    
    // Clear objectives
    progress.objectives.clear();
    
    // Add to active missions
    if (!this.activeMissions.has(playerId)) {
      this.activeMissions.set(playerId, new Set());
    }
    this.activeMissions.get(playerId).add(missionId);
    
    // Mission started event
    this.emit('missionStarted', {
      playerId,
      missionId,
      mission: { ...mission }
    });
    
    return { 
      success: true, 
      mission: { ...mission },
      progress: { ...progress }
    };
  }
  
  /**
   * Complete an objective for a mission
   * @param {string} playerId - Player ID
   * @param {string} missionId - Mission ID
   * @param {string} objectiveId - Objective ID
   * @returns {Object} Objective completion result
   */
  completeObjective(playerId, missionId, objectiveId) {
    // Check if mission exists
    const mission = this.missions.get(missionId);
    if (!mission) {
      return { success: false, error: 'Mission not found' };
    }
    
    // Check if mission is active for player
    const activeMissions = this.activeMissions.get(playerId) || new Set();
    if (!activeMissions.has(missionId)) {
      return { success: false, error: 'Mission not active' };
    }
    
    // Check if objective exists
    const objective = mission.objectives.find(obj => obj.id === objectiveId);
    if (!objective) {
      return { success: false, error: 'Objective not found' };
    }
    
    // Get mission progress
    const missionProgress = this.getPlayerMissionProgress(playerId);
    const progress = missionProgress.get(missionId);
    
    // Check if mission is in progress
    if (progress.status !== 'in_progress') {
      return { success: false, error: 'Mission not in progress' };
    }
    
    // Check if objective is already completed
    if (progress.objectives.get(objectiveId)) {
      return { success: false, error: 'Objective already completed' };
    }
    
    // Complete the objective
    progress.completeObjective(objectiveId);
    
    // Update mission progress
    progress.updateProgress(mission.objectives);
    
    // Check if all objectives are completed
    if (progress.areAllObjectivesCompleted(mission.objectives)) {
      this._completeMission(playerId, missionId);
    }
    
    // Objective completed event
    this.emit('objectiveCompleted', {
      playerId,
      missionId,
      objectiveId,
      progress: progress.progress
    });
    
    return { 
      success: true, 
      objective: { ...objective },
      progress: progress.progress,
      missionComplete: progress.status === 'completed'
    };
  }
  
  /**
   * Complete a mission for a player
   * @param {string} playerId - Player ID
   * @param {string} missionId - Mission ID
   * @returns {Object} Mission completion result
   * @private
   */
  _completeMission(playerId, missionId) {
    // Check if mission exists
    const mission = this.missions.get(missionId);
    if (!mission) {
      return { success: false, error: 'Mission not found' };
    }
    
    // Get mission progress
    const missionProgress = this.getPlayerMissionProgress(playerId);
    const progress = missionProgress.get(missionId);
    
    // Mark mission as completed
    progress.complete();
    
    // Remove from active missions
    const activeMissions = this.activeMissions.get(playerId) || new Set();
    activeMissions.delete(missionId);
    
    // Award rewards
    const rewardResults = this._awardMissionRewards(playerId, mission);
    
    // Mission completed event
    this.emit('missionCompleted', {
      playerId,
      missionId,
      mission: { ...mission },
      rewards: rewardResults
    });
    
    return { 
      success: true, 
      mission: { ...mission },
      rewards: rewardResults
    };
  }
  
  /**
   * Award mission rewards to player
   * @param {string} playerId - Player ID
   * @param {Mission} mission - Mission to award rewards for
   * @returns {Array} Array of reward results
   * @private
   */
  _awardMissionRewards(playerId, mission) {
    const rewardResults = [];
    
    // Get mission progress
    const missionProgress = this.getPlayerMissionProgress(playerId);
    const progress = missionProgress.get(mission.id);
    
    // Check if rewards already given
    if (progress.rewarded) {
      return rewardResults;
    }
    
    // Process each reward
    for (const reward of mission.rewards) {
      let result = null;
      
      switch (reward.type) {
        case REWARD_TYPES.TOKEN:
          // Award tokens via token service
          if (this.tokenService && this.options.tokenRewardEnabled) {
            result = this._awardTokens(playerId, reward.value, `Mission: ${mission.name}`);
          } else {
            result = { 
              type: REWARD_TYPES.TOKEN, 
              value: reward.value, 
              simulated: true 
            };
          }
          break;
          
        case REWARD_TYPES.ITEM:
          // Award item via inventory system
          result = { 
            type: REWARD_TYPES.ITEM, 
            value: reward.value, 
            name: reward.name 
          };
          
          // Emit item reward event
          this.emit('itemRewarded', {
            playerId,
            item: result
          });
          break;
          
        case REWARD_TYPES.SKIN:
          // Award skin
          result = { 
            type: REWARD_TYPES.SKIN, 
            value: reward.value, 
            name: reward.name 
          };
          
          // Emit skin reward event
          this.emit('skinRewarded', {
            playerId,
            skin: result
          });
          break;
          
        case REWARD_TYPES.AIRCRAFT:
          // Award aircraft
          result = { 
            type: REWARD_TYPES.AIRCRAFT, 
            value: reward.value, 
            name: reward.name 
          };
          
          // Emit aircraft reward event
          this.emit('aircraftRewarded', {
            playerId,
            aircraft: result
          });
          break;
          
        default:
          // Generic reward
          result = { 
            type: reward.type, 
            value: reward.value, 
            name: reward.name 
          };
      }
      
      if (result) {
        rewardResults.push(result);
      }
    }
    
    // Add score reward
    if (mission.scoreReward) {
      rewardResults.push({
        type: 'score',
        value: mission.scoreReward
      });
      
      // Emit score reward event
      this.emit('scoreRewarded', {
        playerId,
        score: mission.scoreReward,
        source: 'mission',
        missionId: mission.id
      });
    }
    
    // Mark rewards as given
    progress.rewarded = true;
    
    return rewardResults;
  }
  
  /**
   * Award tokens to a player
   * @param {string} playerId - Player ID
   * @param {number} amount - Amount of tokens to award
   * @param {string} reason - Reason for awarding tokens
   * @returns {Object} Token reward result
   * @private
   */
  _awardTokens(playerId, amount, reason) {
    // Call token service to award tokens
    const result = {
      type: REWARD_TYPES.TOKEN,
      value: amount,
      reason
    };
    
    // Emit token reward event
    this.emit('tokenRewarded', {
      playerId,
      amount,
      reason,
      result
    });
    
    return result;
  }
  
  /**
   * Check achievements for a player
   * @param {string} playerId - Player ID
   * @param {Object} playerState - Current player state
   * @param {Object} gameState - Current game state
   * @returns {Array} Array of newly completed achievements
   */
  checkAchievements(playerId, playerState, gameState) {
    const newlyCompleted = [];
    
    // Get player achievement progress
    const achievements = this.getPlayerAchievementProgress(playerId);
    
    // Check each achievement
    for (const [id, achievement] of this.achievements) {
      // Skip if already completed
      const progress = achievements.get(id);
      if (progress.completed) continue;
      
      // Check if all requirements are met
      let allRequirementsMet = true;
      let totalProgress = 0;
      
      for (const [index, requirement] of achievement.requirements.entries()) {
        const requirementMet = requirement.isMet(playerState, gameState);
        
        // Track progress for each requirement
        if (typeof requirement.target === 'string') {
          // Path-based target
          const path = requirement.target.split('.');
          let current = playerState;
          
          for (const key of path) {
            if (current === undefined || current === null) {
              break;
            }
            current = current[key];
          }
          
          if (current !== undefined && current !== null) {
            const value = Number(current) || 0;
            const targetValue = Number(requirement.value) || 1;
            
            // Calculate progress percentage
            let requirementProgress = 0;
            
            switch (requirement.comparison) {
              case 'gte':
                requirementProgress = Math.min(100, (value / targetValue) * 100);
                break;
              case 'lte':
                requirementProgress = value <= targetValue ? 100 : 0;
                break;
              case 'eq':
                requirementProgress = value === targetValue ? 100 : 0;
                break;
              default:
                requirementProgress = requirementMet ? 100 : 0;
            }
            
            progress.requirementProgress.set(index, requirementProgress);
            totalProgress += requirementProgress;
          }
        } else {
          // Function-based target
          progress.requirementProgress.set(index, requirementMet ? 100 : 0);
          totalProgress += requirementMet ? 100 : 0;
        }
        
        // If any requirement is not met, achievement is not complete
        if (!requirementMet) {
          allRequirementsMet = false;
        }
      }
      
      // Calculate overall progress
      if (achievement.requirements.length > 0) {
        progress.progress = Math.floor(totalProgress / achievement.requirements.length);
      }
      
      // Complete achievement if all requirements are met
      if (allRequirementsMet) {
        progress.complete();
        
        // Award achievement rewards
        const rewards = this._awardAchievementRewards(playerId, achievement);
        
        // Add to newly completed list
        newlyCompleted.push({
          achievement,
          rewards
        });
        
        // Achievement completed event
        this.emit('achievementCompleted', {
          playerId,
          achievementId: achievement.id,
          achievement: { ...achievement },
          rewards
        });
        
        // Check for next tier achievement
        if (achievement.nextTier) {
          // Progress is automatically tracked for next tier
          const nextAchievement = this.achievements.get(achievement.nextTier);
          if (nextAchievement) {
            // Don't need to do anything special here, next tier will be checked normally
          }
        }
      }
    }
    
    return newlyCompleted;
  }
  
  /**
   * Award achievement rewards to player
   * @param {string} playerId - Player ID
   * @param {Achievement} achievement - Achievement to award rewards for
   * @returns {Array} Array of reward results
   * @private
   */
  _awardAchievementRewards(playerId, achievement) {
    const rewardResults = [];
    
    // Get achievement progress
    const achievements = this.getPlayerAchievementProgress(playerId);
    const progress = achievements.get(achievement.id);
    
    // Check if rewards already given
    if (progress.rewarded) {
      return rewardResults;
    }
    
    // Process each reward
    for (const reward of achievement.rewards) {
      let result = null;
      
      switch (reward.type) {
        case REWARD_TYPES.TOKEN:
          // Award tokens via token service
          if (this.tokenService && this.options.tokenRewardEnabled) {
            result = this._awardTokens(playerId, reward.value, `Achievement: ${achievement.name}`);
          } else {
            result = { 
              type: REWARD_TYPES.TOKEN, 
              value: reward.value, 
              simulated: true 
            };
          }
          break;
          
        case REWARD_TYPES.ITEM:
          // Award item via inventory system
          result = { 
            type: REWARD_TYPES.ITEM, 
            value: reward.value, 
            name: reward.name 
          };
          
          // Emit item reward event
          this.emit('itemRewarded', {
            playerId,
            item: result
          });
          break;
          
        case REWARD_TYPES.SKIN:
          // Award skin
          result = { 
            type: REWARD_TYPES.SKIN, 
            value: reward.value, 
            name: reward.name 
          };
          
          // Emit skin reward event
          this.emit('skinRewarded', {
            playerId,
            skin: result
          });
          break;
          
        default:
          // Generic reward
          result = { 
            type: reward.type, 
            value: reward.value, 
            name: reward.name 
          };
      }
      
      if (result) {
        rewardResults.push(result);
      }
    }
    
    // Add score reward
    if (achievement.scoreReward) {
      rewardResults.push({
        type: 'score',
        value: achievement.scoreReward
      });
      
      // Emit score reward event
      this.emit('scoreRewarded', {
        playerId,
        score: achievement.scoreReward,
        source: 'achievement',
        achievementId: achievement.id
      });
    }
    
    // Mark rewards as given
    progress.rewarded = true;
    
    return rewardResults;
  }
  
  /**
   * Get available missions for a player
   * @param {string} playerId - Player ID
   * @param {Object} playerState - Player state for requirement checking
   * @returns {Array} Array of available missions
   */
  getAvailableMissions(playerId, playerState) {
    const available = [];
    
    // Get player mission progress
    const missionProgress = this.getPlayerMissionProgress(playerId);
    
    // Check each mission
    for (const [id, mission] of this.missions) {
      const progress = missionProgress.get(id);
      
      // Skip if already in progress
      if (progress.status === 'in_progress') {
        continue;
      }
      
      // Check if repeatable or not completed
      if (mission.repeatable || progress.status !== 'completed') {
        // Check for cooldown
        let onCooldown = false;
        if (mission.cooldown > 0 && progress.lastAttempt) {
          const timeSinceLastAttempt = Date.now() - progress.lastAttempt;
          if (timeSinceLastAttempt < mission.cooldown) {
            onCooldown = true;
          }
        }
        
        // Check level requirement
        const meetsLevelReq = !mission.requiredLevel || 
          (playerState.level && playerState.level >= mission.requiredLevel);
        
        // Add if available
        if (!onCooldown && meetsLevelReq) {
          available.push({
            mission: { ...mission },
            progress: {
              status: progress.status,
              attempts: progress.attempts,
              lastAttempt: progress.lastAttempt
            }
          });
        }
      }
    }
    
    return available;
  }
  
  /**
   * Update achievement and mission progress for a player based on an event
   * @param {string} playerId - Player ID
   * @param {string} eventType - Type of event
   * @param {Object} eventData - Event data
   * @param {Object} playerState - Current player state
   * @param {Object} gameState - Current game state
   */
  processEvent(playerId, eventType, eventData, playerState, gameState) {
    // Handle different event types
    switch (eventType) {
      case 'kill':
        this._processKillEvent(playerId, eventData, playerState, gameState);
        break;
        
      case 'mission_objective':
        this._processMissionObjectiveEvent(playerId, eventData, playerState, gameState);
        break;
        
      case 'achievement_progress':
        this._processAchievementProgressEvent(playerId, eventData, playerState, gameState);
        break;
        
      default:
        // Generic event - check achievements and missions
        this.checkAchievements(playerId, playerState, gameState);
        this._updateMissionProgress(playerId, eventType, eventData, playerState, gameState);
    }
  }
  
  /**
   * Process a kill event
   * @param {string} playerId - Player ID
   * @param {Object} eventData - Event data
   * @param {Object} playerState - Current player state
   * @param {Object} gameState - Current game state
   * @private
   */
  _processKillEvent(playerId, eventData, playerState, gameState) {
    // Award tokens for kill if token service available
    if (this.tokenService && this.options.tokenRewardEnabled) {
      // Base token amount for kills
      const baseTokens = 2;
      
      // Bonus for special conditions
      let bonus = 0;
      
      // Bonus for killing higher ranked players
      if (eventData.victimRank && playerState.rank && eventData.victimRank > playerState.rank) {
        bonus += 1;
      }
      
      // Bonus for killstreaks
      if (playerState.kills > 0 && playerState.deaths > 0) {
        const killstreak = playerState.kills / playerState.deaths;
        if (killstreak >= 5) {
          bonus += 2;
        } else if (killstreak >= 3) {
          bonus += 1;
        }
      }
      
      // Award tokens
      const tokenAmount = baseTokens + bonus;
      this._awardTokens(playerId, tokenAmount, 'Kill reward');
    }
    
    // Check achievements
    this.checkAchievements(playerId, playerState, gameState);
    
    // Update mission progress
    this._updateMissionProgress(playerId, 'kill', eventData, playerState, gameState);
  }
  
  /**
   * Process a mission objective event
   * @param {string} playerId - Player ID
   * @param {Object} eventData - Event data
   * @param {Object} playerState - Current player state
   * @param {Object} gameState - Current game state
   * @private
   */
  _processMissionObjectiveEvent(playerId, eventData, playerState, gameState) {
    const { missionId, objectiveId } = eventData;
    
    // Complete the objective
    this.completeObjective(playerId, missionId, objectiveId);
  }
  
  /**
   * Process an achievement progress event
   * @param {string} playerId - Player ID
   * @param {Object} eventData - Event data
   * @param {Object} playerState - Current player state
   * @param {Object} gameState - Current game state
   * @private
   */
  _processAchievementProgressEvent(playerId, eventData, playerState, gameState) {
    // Check achievements
    this.checkAchievements(playerId, playerState, gameState);
  }
  
  /**
   * Update mission progress based on an event
   * @param {string} playerId - Player ID
   * @param {string} eventType - Type of event
   * @param {Object} eventData - Event data
   * @param {Object} playerState - Current player state
   * @param {Object} gameState - Current game state
   * @private
   */
  _updateMissionProgress(playerId, eventType, eventData, playerState, gameState) {
    // Get active missions for player
    const activeMissions = this.activeMissions.get(playerId) || new Set();
    
    // Update each active mission
    for (const missionId of activeMissions) {
      const mission = this.missions.get(missionId);
      if (!mission) continue;
      
      // Get mission progress
      const missionProgress = this.getPlayerMissionProgress(playerId);
      const progress = missionProgress.get(missionId);
      
      // Skip if not in progress
      if (progress.status !== 'in_progress') continue;
      
      // Check each objective
      for (const objective of mission.objectives) {
        // Skip if already completed
        if (progress.objectives.get(objective.id)) continue;
        
        // Check if objective is fulfilled by this event
        let objectiveCompleted = false;
        
        switch (objective.type) {
          case 'kill':
            if (eventType === 'kill') {
              // Check kill count
              const killTarget = objective.target || 1;
              const killCount = playerState.kills || 0;
              
              // Check condition if specified
              if (objective.condition) {
                if (objective.condition === 'attacking_vip' && eventData.isAttackingVip) {
                  objectiveCompleted = true;
                }
              } else if (killCount >= killTarget) {
                objectiveCompleted = true;
              }
            }
            break;
            
          case 'checkpoint':
            if (eventType === 'checkpoint') {
              // Check if this is the right checkpoint
              if (eventData.checkpointId === objective.id || 
                  eventData.position === objective.position) {
                objectiveCompleted = true;
              }
            }
            break;
            
          case 'takeoff':
            if (eventType === 'takeoff') {
              objectiveCompleted = true;
            }
            break;
            
          case 'landing':
            if (eventType === 'landed') {
              objectiveCompleted = true;
            }
            break;
            
          case 'altitude':
            if (eventType === 'altitude' || eventType === 'flight_data') {
              const altTarget = objective.target || 1000;
              const currentAlt = playerState.flightData?.altitude || 0;
              
              if (currentAlt >= altTarget) {
                objectiveCompleted = true;
              }
            }
            break;
            
          case 'speed':
            if (eventType === 'speed' || eventType === 'flight_data') {
              const speedTarget = objective.target || 300;
              const currentSpeed = playerState.flightData?.airspeedKph || 0;
              
              if (currentSpeed >= speedTarget) {
                objectiveCompleted = true;
              }
            }
            break;
            
          case 'bombing':
            if (eventType === 'bombing') {
              // Check if target position matches
              if (eventData.position && objective.position) {
                const dx = eventData.position.x - objective.position.x;
                const dz = eventData.position.z - objective.position.z;
                const distance = Math.sqrt(dx*dx + dz*dz);
                
                // Check if within range
                const range = objective.range || 50;
                if (distance <= range) {
                  objectiveCompleted = true;
                }
              }
            }
            break;
            
          case 'recon':
            if (eventType === 'recon') {
              // Check if target position matches
              if (eventData.position && objective.position) {
                const dx = eventData.position.x - objective.position.x;
                const dz = eventData.position.z - objective.position.z;
                const distance = Math.sqrt(dx*dx + dz*dz);
                
                // Check if within range
                const range = objective.range || 100;
                if (distance <= range) {
                  objectiveCompleted = true;
                }
              }
            }
            break;
            
          case 'escort':
            if (eventType === 'escort_complete') {
              // Check if escorted unit matches
              if (eventData.targetId === objective.target) {
                objectiveCompleted = true;
              }
            }
            break;
        }
        
        // Complete objective if fulfilled
        if (objectiveCompleted) {
          this.completeObjective(playerId, missionId, objective.id);
        }
      }
    }
  }
  
  /**
   * Set token service for blockchain rewards
   * @param {Object} tokenService - Token service
   */
  setTokenService(tokenService) {
    this.tokenService = tokenService;
  }
  
  /**
   * Set event handlers for automatic tracking
   * @param {Map} eventHandlers - Map of event type to handler functions
   */
  setEventHandlers(eventHandlers) {
    this.eventHandlers = eventHandlers;
  }
  
  /**
   * Import player progress
   * @param {string} playerId - Player ID
   * @param {Object} progressData - Progress data to import
   */
  importProgress(playerId, progressData) {
    if (!progressData) return;
    
    // Initialize player progress
    if (!this.playerProgress.has(playerId)) {
      this.playerProgress.set(playerId, {
        achievements: new Map(),
        missions: new Map()
      });
    }
    
    // Import achievement progress
    if (progressData.achievements) {
      for (const [id, data] of Object.entries(progressData.achievements)) {
        if (!this.achievements.has(id)) continue;
        
        const progress = new AchievementProgress(id, playerId);
        progress.progress = data.progress || 0;
        progress.completed = data.completed || false;
        progress.completedAt = data.completedAt || null;
        progress.rewarded = data.rewarded || false;
        
        this.playerProgress.get(playerId).achievements.set(id, progress);
      }
    }
    
    // Import mission progress
    if (progressData.missions) {
      for (const [id, data] of Object.entries(progressData.missions)) {
        if (!this.missions.has(id)) continue;
        
        const progress = new MissionProgress(id, playerId);
        progress.status = data.status || 'not_started';
        progress.startedAt = data.startedAt || null;
        progress.completedAt = data.completedAt || null;
        progress.progress = data.progress || 0;
        progress.rewarded = data.rewarded || false;
        progress.attempts = data.attempts || 0;
        progress.lastAttempt = data.lastAttempt || null;
        
        // Import objectives
        if (data.objectives) {
          for (const [objId, completed] of Object.entries(data.objectives)) {
            progress.objectives.set(objId, completed);
          }
        }
        
        this.playerProgress.get(playerId).missions.set(id, progress);
      }
    }
    
    // Import active missions
    if (progressData.activeMissions) {
      const activeMissions = new Set(progressData.activeMissions);
      this.activeMissions.set(playerId, activeMissions);
    }
  }
  
  /**
   * Export player progress
   * @param {string} playerId - Player ID
   * @returns {Object} Exported progress data
   */
  exportProgress(playerId) {
    const playerProgress = this.playerProgress.get(playerId);
    if (!playerProgress) return null;
    
    const exportData = {
      achievements: {},
      missions: {},
      activeMissions: Array.from(this.activeMissions.get(playerId) || [])
    };
    
    // Export achievement progress
    for (const [id, progress] of playerProgress.achievements) {
      exportData.achievements[id] = {
        progress: progress.progress,
        completed: progress.completed,
        completedAt: progress.completedAt,
        rewarded: progress.rewarded
      };
    }
    
    // Export mission progress
    for (const [id, progress] of playerProgress.missions) {
      exportData.missions[id] = {
        status: progress.status,
        startedAt: progress.startedAt,
        completedAt: progress.completedAt,
        progress: progress.progress,
        rewarded: progress.rewarded,
        attempts: progress.attempts,
        lastAttempt: progress.lastAttempt,
        objectives: Object.fromEntries(progress.objectives)
      };
    }
    
    return exportData;
  }
}

module.exports = {
  AchievementSystem,
  Achievement,
  Mission,
  Requirement,
  Reward,
  ACHIEVEMENT_CATEGORIES,
  REWARD_TYPES
};