import * as THREE from 'three';
import { GameSettings } from '../core/GameSettings';
import { GameEvents } from '../core/GameEvents';

/**
 * Synchronizer
 * 
 * Handles client-side prediction, server reconciliation, and entity interpolation
 * for multiplayer gameplay. Optimized for flight physics with smooth movement
 * despite network latency.
 */
export class Synchronizer {
  constructor(networkManager) {
    this.networkManager = networkManager;
    
    // Local input history for reconciliation
    this.inputHistory = [];
    this.maxInputHistory = 60; // Store ~1 second at 60fps
    
    // State interpolation buffers
    this.stateBuffer = new Map(); // Map of entity ID to state buffer
    this.stateBufferSize = 60; // Store ~1 second at 60fps
    
    // Entity interpolation settings
    this.interpolationDelay = 100; // ms, adjust based on network conditions
    this.minInterpolationDelay = 50; // Minimum delay for very good connections
    this.maxInterpolationDelay = 300; // Maximum delay for poor connections
    
    // Network conditions
    this.ping = 0;
    this.avgPing = 0;
    this.jitter = 0;
    
    // Sequence tracking
    this.lastProcessedSequence = 0;
    this.serverSequence = 0;
    
    // Prediction configuration
    this.enablePrediction = GameSettings.get('enablePrediction') !== false;
    this.maxPredictionSteps = 20; // Maximum prediction steps before forced sync
    
    // Error tracking
    this.reconciliationCount = 0;
    this.errorThreshold = 0.05; // 5% error threshold for position
    this.errorHistory = [];
    this.maxErrorHistory = 10;
    
    // Entity tracker for interpolation
    this.entities = new Map(); // Map of entity ID to entity object
    
    // Debugging
    this.debugMode = process.env.NODE_ENV === 'development';
    this.reconciliationEvents = [];
    this.maxReconciliationEvents = 20;
    
    // Handle window focus/blur events for interpolation adjustment
    window.addEventListener('focus', this.handleWindowFocus.bind(this));
    window.addEventListener('blur', this.handleWindowBlur.bind(this));
  }
  
  /**
   * Process local player input
   * @param {Object} input Player input data
   */
  processLocalInput(input) {
    // Skip if prediction is disabled
    if (!this.enablePrediction) return;
    
    // Add timestamp and sequence number
    input.timestamp = this.networkManager.getServerTime();
    input.sequence = input.sequence || Date.now();
    
    // Store input in history for reconciliation
    this.inputHistory.push(input);
    
    // Trim history if needed
    if (this.inputHistory.length > this.maxInputHistory) {
      this.inputHistory.shift();
    }
    
    return input;
  }
  
  /**
   * Prepare player state update for sending to server
   * @param {Object} playerState Current local player state
   * @returns {Object} Formatted update for server
   */
  prepareUpdate(playerState) {
    // Add server timestamp and sequence
    const update = {
      timestamp: this.networkManager.getServerTime(),
      sequence: Date.now(),
      position: playerState.position ? this.compressVector(playerState.position) : undefined,
      rotation: playerState.rotation ? this.compressQuaternion(playerState.rotation) : undefined,
      velocity: playerState.velocity ? this.compressVector(playerState.velocity) : undefined,
      angular: playerState.angular ? this.compressVector(playerState.angular) : undefined,
      input: playerState.input
    };
    
    // Add last processed sequence for reconciliation
    update.ack = this.lastProcessedSequence;
    
    // Add pending inputs if prediction is enabled
    if (this.enablePrediction) {
      // Find inputs that haven't been acknowledged by server yet
      const pendingInputs = this.inputHistory.filter(input => 
        input.sequence > this.lastProcessedSequence
      );
      
      if (pendingInputs.length > 0) {
        update.inputs = this.compressInputs(pendingInputs);
      }
    }
    
    return update;
  }
  
  /**
   * Process state update from server
   * @param {Object} update State update data
   */
  processStateUpdate(update) {
    // Track server sequence
    if (update.sequence > this.serverSequence) {
      this.serverSequence = update.sequence;
    }
    
    // Process entity updates
    if (update.entities) {
      this.processEntityUpdates(update.entities, update.timestamp);
    }
    
    // Process world state updates (non-entity data)
    if (update.world) {
      GameEvents.emit('world:update', update.world);
    }
    
    // Process acknowledgments
    if (update.ack !== undefined) {
      this.processAcknowledgment(update.ack);
    }
    
    // Process reconciliation data if available
    if (update.reconcile) {
      this.reconcileState(update.reconcile);
    }
  }
  
  /**
   * Process full state snapshot from server
   * @param {Object} snapshot Full state snapshot
   */
  processStateSnapshot(snapshot) {
    // Clear state buffers for a fresh start
    this.stateBuffer.clear();
    
    // Track server sequence
    if (snapshot.sequence > this.serverSequence) {
      this.serverSequence = snapshot.sequence;
    }
    
    // Process entity snapshots
    if (snapshot.entities) {
      // Create buffers for all entities
      snapshot.entities.forEach(entity => {
        this.ensureEntityBuffer(entity.id);
        
        // Add entity state to buffer
        this.addToStateBuffer(entity.id, {
          ...entity,
          timestamp: snapshot.timestamp,
          received: Date.now()
        });
      });
    }
    
    // Process world state snapshot (non-entity data)
    if (snapshot.world) {
      GameEvents.emit('world:snapshot', snapshot.world);
    }
    
    // Notify game about full snapshot
    GameEvents.emit('state:snapshot', snapshot);
  }
  
  /**
   * Process entity updates from server
   * @param {Array} entities Entity update data
   * @param {number} timestamp Server timestamp
   */
  processEntityUpdates(entities, timestamp) {
    entities.forEach(entity => {
      // Ensure entity has a state buffer
      this.ensureEntityBuffer(entity.id);
      
      // Add entity state to buffer
      this.addToStateBuffer(entity.id, {
        ...entity,
        timestamp,
        received: Date.now()
      });
      
      // Track entity for interpolation
      if (!this.entities.has(entity.id)) {
        this.entities.set(entity.id, {
          id: entity.id,
          type: entity.type,
          lastUpdate: Date.now()
        });
      } else {
        // Update last update time
        const entityTracker = this.entities.get(entity.id);
        entityTracker.lastUpdate = Date.now();
      }
    });
  }
  
  /**
   * Process acknowledgment from server
   * @param {number} sequence Acknowledged sequence number
   */
  processAcknowledgment(sequence) {
    // Update last processed sequence
    if (sequence > this.lastProcessedSequence) {
      this.lastProcessedSequence = sequence;
      
      // Remove acknowledged inputs from history
      this.inputHistory = this.inputHistory.filter(input => 
        input.sequence > sequence
      );
    }
  }
  
  /**
   * Reconcile client state with server state
   * @param {Object} reconcileData Reconciliation data from server
   */
  reconcileState(reconcileData) {
    // Skip if prediction is disabled
    if (!this.enablePrediction) return;
    
    // Get local player ID
    const localPlayerId = this.networkManager.userId;
    if (!localPlayerId) return;
    
    // Check if reconciliation applies to local player
    const playerData = reconcileData.players[localPlayerId];
    if (!playerData) return;
    
    // Get sequence number
    const sequence = reconcileData.sequence;
    
    // We should only reconcile if this sequence is newer than our last processed
    if (sequence <= this.lastProcessedSequence) return;
    
    // Find the acknowledged input in history
    const ackIndex = this.inputHistory.findIndex(input => 
      input.sequence === sequence
    );
    
    // If not found, can't reconcile
    if (ackIndex === -1) return;
    
    // Get the acknowledged state from server
    const serverState = playerData;
    
    // Get the current local state
    const localState = this.networkManager.gameInstance.getLocalPlayerState();
    if (!localState) return;
    
    // Calculate position error
    let error = 0;
    if (serverState.position && localState.position) {
      const serverPos = this.decompressVector(serverState.position);
      error = serverPos.distanceTo(localState.position);
    }
    
    // Track error for adaptive correction
    this.addErrorToHistory(error);
    
    // If error is below threshold, no need to reconcile
    const avgError = this.getAverageError();
    if (avgError < this.errorThreshold) return;
    
    // Reset player state to server state
    const correctedState = {
      position: serverState.position ? this.decompressVector(serverState.position) : undefined,
      rotation: serverState.rotation ? this.decompressQuaternion(serverState.rotation) : undefined,
      velocity: serverState.velocity ? this.decompressVector(serverState.velocity) : undefined,
      angular: serverState.angular ? this.decompressVector(serverState.angular) : undefined
    };
    
    // Track reconciliation event for debugging
    if (this.debugMode) {
      this.addReconciliationEvent({
        sequence,
        error,
        serverState: { ...serverState },
        localState: { 
          position: localState.position ? localState.position.toArray() : undefined,
          rotation: localState.rotation ? 
            [localState.rotation.x, localState.rotation.y, localState.rotation.z, localState.rotation.w] : 
            undefined,
          velocity: localState.velocity ? localState.velocity.toArray() : undefined
        },
        time: Date.now()
      });
    }
    
    // Apply to game instance
    GameEvents.emit('state:reconcile', {
      state: correctedState,
      sequence
    });
    
    // Re-apply inputs from acknowledged input
    const pendingInputs = this.inputHistory.slice(ackIndex + 1);
    
    if (pendingInputs.length > 0) {
      // Notify game to reapply these inputs
      GameEvents.emit('input:reapply', {
        inputs: pendingInputs,
        state: correctedState
      });
    }
    
    // Increment reconciliation counter
    this.reconciliationCount++;
  }
  
  /**
   * Update all entity interpolation
   * @param {number} deltaTime Time since last frame in seconds
   * @param {Object} gameTime Current game time information
   */
  update(deltaTime, gameTime) {
    // Calculate render timestamp based on interpolation delay
    const renderTimestamp = this.networkManager.getServerTime() - this.interpolationDelay;
    
    // Update interpolation for all entities
    this.entities.forEach((entity, entityId) => {
      // Skip if this is the local player (handled by prediction)
      if (entityId === this.networkManager.userId) return;
      
      // Get state buffer for entity
      const buffer = this.stateBuffer.get(entityId);
      if (!buffer || buffer.length < 2) return;
      
      // Find states to interpolate between
      const { before, after, t } = this.getInterpolationStates(buffer, renderTimestamp);
      
      // If no valid states found, skip
      if (!before || !after) return;
      
      // Interpolate entity state
      const interpolatedState = this.interpolateStates(before, after, t);
      
      // Apply interpolated state to entity
      GameEvents.emit('entity:interpolate', {
        id: entityId,
        type: entity.type,
        state: interpolatedState
      });
      
      // Clean up old states
      this.cleanStateBuffer(entityId, renderTimestamp);
    });
    
    // Clean up stale entities
    this.cleanStaleEntities();
  }
  
  /**
   * Update network conditions and adapt interpolation settings
   * @param {Object} conditions Network condition metrics
   */
  updateNetworkConditions(conditions) {
    this.ping = conditions.ping;
    this.avgPing = conditions.avgPing;
    this.jitter = conditions.jitter;
    
    // Adapt interpolation delay based on network conditions
    // More jitter requires more delay to ensure smooth movement
    const targetDelay = Math.max(
      this.minInterpolationDelay,
      Math.min(
        this.maxInterpolationDelay,
        this.avgPing + this.jitter * 2
      )
    );
    
    // Smoothly transition to new delay
    this.interpolationDelay = this.interpolationDelay * 0.8 + targetDelay * 0.2;
  }
  
  /**
   * Get interpolation states and blend factor for a specific timestamp
   * @param {Array} buffer Entity state buffer
   * @param {number} timestamp Target timestamp
   * @returns {Object} Before state, after state, and blend factor
   */
  getInterpolationStates(buffer, timestamp) {
    // Find the state before and after the target timestamp
    let beforeState = null;
    let afterState = null;
    
    for (let i = 0; i < buffer.length; i++) {
      const state = buffer[i];
      
      if (state.timestamp <= timestamp) {
        // This state is at or before target timestamp
        if (!beforeState || state.timestamp > beforeState.timestamp) {
          beforeState = state;
        }
      } else {
        // This state is after target timestamp
        if (!afterState || state.timestamp < afterState.timestamp) {
          afterState = state;
        }
      }
    }
    
    // If we don't have states on both sides, return null
    if (!beforeState || !afterState) {
      // Special case: if we only have states after the timestamp,
      // use the earliest state directly
      if (!beforeState && afterState) {
        return { before: afterState, after: afterState, t: 0 };
      }
      
      // Special case: if we only have states before the timestamp,
      // use the latest state directly
      if (beforeState && !afterState) {
        return { before: beforeState, after: beforeState, t: 0 };
      }
      
      return { before: null, after: null, t: 0 };
    }
    
    // Calculate blend factor (t) between the two states
    const totalTime = afterState.timestamp - beforeState.timestamp;
    if (totalTime <= 0) return { before: beforeState, after: afterState, t: 0 };
    
    const t = (timestamp - beforeState.timestamp) / totalTime;
    return { before: beforeState, after: afterState, t: Math.max(0, Math.min(1, t)) };
  }
  
  /**
   * Interpolate between two entity states
   * @param {Object} before State before target timestamp
   * @param {Object} after State after target timestamp
   * @param {number} t Blend factor (0-1)
   * @returns {Object} Interpolated state
   */
  interpolateStates(before, after, t) {
    const result = {};
    
    // Interpolate position
    if (before.position && after.position) {
      const beforePos = this.decompressVector(before.position);
      const afterPos = this.decompressVector(after.position);
      
      result.position = new THREE.Vector3().lerpVectors(beforePos, afterPos, t);
    }
    
    // Interpolate rotation (using quaternion slerp)
    if (before.rotation && after.rotation) {
      const beforeRot = this.decompressQuaternion(before.rotation);
      const afterRot = this.decompressQuaternion(after.rotation);
      
      result.rotation = new THREE.Quaternion().slerpQuaternions(beforeRot, afterRot, t);
    }
    
    // Interpolate velocity
    if (before.velocity && after.velocity) {
      const beforeVel = this.decompressVector(before.velocity);
      const afterVel = this.decompressVector(after.velocity);
      
      result.velocity = new THREE.Vector3().lerpVectors(beforeVel, afterVel, t);
    }
    
    // Interpolate angular velocity
    if (before.angular && after.angular) {
      const beforeAng = this.decompressVector(before.angular);
      const afterAng = this.decompressVector(after.angular);
      
      result.angular = new THREE.Vector3().lerpVectors(beforeAng, afterAng, t);
    }
    
    // Copy non-interpolated properties
    if (after.health !== undefined) result.health = after.health;
    if (after.status !== undefined) result.status = after.status;
    if (after.flags !== undefined) result.flags = after.flags;
    
    return result;
  }
  
  /**
   * Ensure an entity has a state buffer
   * @param {string} entityId Entity ID
   */
  ensureEntityBuffer(entityId) {
    if (!this.stateBuffer.has(entityId)) {
      this.stateBuffer.set(entityId, []);
    }
  }
  
  /**
   * Add entity state to buffer
   * @param {string} entityId Entity ID
   * @param {Object} state Entity state
   */
  addToStateBuffer(entityId, state) {
    const buffer = this.stateBuffer.get(entityId);
    
    // Add state to buffer, sorted by timestamp
    buffer.push(state);
    buffer.sort((a, b) => a.timestamp - b.timestamp);
    
    // Trim buffer if needed
    if (buffer.length > this.stateBufferSize) {
      buffer.shift();
    }
  }
  
  /**
   * Clean up old states from buffer
   * @param {string} entityId Entity ID
   * @param {number} timestamp Current render timestamp
   */
  cleanStateBuffer(entityId, timestamp) {
    const buffer = this.stateBuffer.get(entityId);
    if (!buffer) return;
    
    // Keep one state before render timestamp
    let oldestToKeep = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i].timestamp < timestamp) {
        oldestToKeep = i;
      } else {
        break;
      }
    }
    
    // Keep at least one state before render timestamp, unless we have none
    if (oldestToKeep > 0) {
      oldestToKeep = Math.max(0, oldestToKeep - 1);
    }
    
    // Remove older states
    if (oldestToKeep > 0) {
      buffer.splice(0, oldestToKeep);
    }
  }
  
  /**
   * Clean up stale entities
   */
  cleanStaleEntities() {
    const now = Date.now();
    const staleThreshold = 5000; // 5 seconds
    
    // Check each entity for staleness
    this.entities.forEach((entity, entityId) => {
      if (now - entity.lastUpdate > staleThreshold) {
        // Entity is stale, remove from tracking
        this.entities.delete(entityId);
        this.stateBuffer.delete(entityId);
        
        // Notify game about entity removal
        GameEvents.emit('entity:remove', {
          id: entityId,
          reason: 'stale'
        });
      }
    });
  }
  
  /**
   * Add error to history
   * @param {number} error Position error magnitude
   */
  addErrorToHistory(error) {
    this.errorHistory.push(error);
    
    // Trim history if needed
    if (this.errorHistory.length > this.maxErrorHistory) {
      this.errorHistory.shift();
    }
  }
  
  /**
   * Get average error from history
   * @returns {number} Average error
   */
  getAverageError() {
    if (this.errorHistory.length === 0) return 0;
    
    const sum = this.errorHistory.reduce((acc, val) => acc + val, 0);
    return sum / this.errorHistory.length;
  }
  
  /**
   * Add reconciliation event for debugging
   * @param {Object} event Reconciliation event data
   */
  addReconciliationEvent(event) {
    this.reconciliationEvents.push(event);
    
    // Trim events if needed
    if (this.reconciliationEvents.length > this.maxReconciliationEvents) {
      this.reconciliationEvents.shift();
    }
  }
  
  /**
   * Handle window focus event
   */
  handleWindowFocus() {
    // Reset state buffers on focus to avoid interpolation jumps
    this.stateBuffer.clear();
    
    // Request a full state snapshot
    if (this.networkManager.isConnected) {
      this.networkManager.socket.emit('state:request', { full: true });
    }
  }
  
  /**
   * Handle window blur event
   */
  handleWindowBlur() {
    // Disable prediction when window is not focused
    this.enablePrediction = false;
  }
  
  /* Data Compression Utilities */
  
  /**
   * Compress Vector3 to array with precision scaling
   * @param {THREE.Vector3} vector Vector to compress
   * @returns {Array} Compressed vector array
   */
  compressVector(vector) {
    // Scale and round to reduce bandwidth
    // For flight games, positions can be large, so we use a compromise
    // between precision and bandwidth
    const precisionFactor = 100; // 2 decimal places
    
    return [
      Math.round(vector.x * precisionFactor) / precisionFactor,
      Math.round(vector.y * precisionFactor) / precisionFactor,
      Math.round(vector.z * precisionFactor) / precisionFactor
    ];
  }
  
  /**
   * Decompress array to Vector3
   * @param {Array} array Compressed vector array
   * @returns {THREE.Vector3} Decompressed vector
   */
  decompressVector(array) {
    return new THREE.Vector3(array[0], array[1], array[2]);
  }
  
  /**
   * Compress Quaternion to array with precision scaling
   * @param {THREE.Quaternion} quaternion Quaternion to compress
   * @returns {Array} Compressed quaternion array
   */
  compressQuaternion(quaternion) {
    // Scale and round to reduce bandwidth
    const precisionFactor = 10000; // 4 decimal places
    
    return [
      Math.round(quaternion.x * precisionFactor) / precisionFactor,
      Math.round(quaternion.y * precisionFactor) / precisionFactor,
      Math.round(quaternion.z * precisionFactor) / precisionFactor,
      Math.round(quaternion.w * precisionFactor) / precisionFactor
    ];
  }
  
  /**
   * Decompress array to Quaternion
   * @param {Array} array Compressed quaternion array
   * @returns {THREE.Quaternion} Decompressed quaternion
   */
  decompressQuaternion(array) {
    const q = new THREE.Quaternion(array[0], array[1], array[2], array[3]);
    // Normalize to ensure valid quaternion
    q.normalize();
    return q;
  }
  
  /**
   * Compress array of inputs for efficient transmission
   * @param {Array} inputs Array of input objects
   * @returns {Array} Compressed inputs
   */
  compressInputs(inputs) {
    // For small numbers of inputs, just send the full objects
    if (inputs.length <= 3) return inputs;
    
    // For larger numbers, use a more efficient format
    // This is a simplified implementation - a full solution would
    // use bit packing or delta encoding for maximum efficiency
    return inputs.map(input => ({
      s: input.sequence,
      t: input.timestamp,
      // Just include the keys that have changed to save bandwidth
      ...(input.thrust !== undefined ? { th: input.thrust } : {}),
      ...(input.roll !== undefined ? { r: input.roll } : {}),
      ...(input.pitch !== undefined ? { p: input.pitch } : {}),
      ...(input.yaw !== undefined ? { y: input.yaw } : {})
    }));
  }
  
  /**
   * Get debugging information
   * @returns {Object} Debug data
   */
  getDebugInfo() {
    return {
      ping: this.ping,
      avgPing: this.avgPing,
      jitter: this.jitter,
      interpolationDelay: this.interpolationDelay,
      reconciliationCount: this.reconciliationCount,
      avgError: this.getAverageError(),
      bufferSizes: Array.from(this.stateBuffer.entries()).map(([id, buffer]) => ({
        id,
        size: buffer.length
      })),
      entities: Array.from(this.entities.keys()),
      inputHistory: this.inputHistory.length,
      prediction: this.enablePrediction,
      reconciliationEvents: this.reconciliationEvents
    };
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    // Remove window event listeners
    window.removeEventListener('focus', this.handleWindowFocus);
    window.removeEventListener('blur', this.handleWindowBlur);
    
    // Clear data
    this.inputHistory = [];
    this.stateBuffer.clear();
    this.entities.clear();
    this.errorHistory = [];
    this.reconciliationEvents = [];
  }
}