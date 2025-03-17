/**
 * Flight Physics Engine
 * 
 * Implements realistic flight mechanics for aircraft simulation.
 * This module handles forces (lift, drag, thrust, gravity), control inputs,
 * and calculates resulting motion based on aerodynamic principles.
 * 
 * @module flightPhysics
 */

const THREE = require('three');
const { clamp } = require('../utils/mathUtils');

// Aircraft performance profiles
const AIRCRAFT_PROFILES = {
  // Standard fighter aircraft
  'fighter': {
    mass: 12000,                // kg
    wingspan: 10,               // meters
    wingArea: 30,               // square meters
    maxThrust: 130000,          // newtons
    dragCoefficient: 0.021,     // coefficient
    liftCoefficient: 0.15,      // base lift coefficient
    maxLiftCoefficient: 1.6,    // maximum lift coefficient
    stallAngleRadians: 0.3,     // ~17 degrees
    rollRate: 3.0,              // radians per second 
    pitchRate: 1.2,             // radians per second
    yawRate: 0.8,               // radians per second
    maxSpeed: 800,              // km/h
    minSpeed: 200,              // km/h before stall
    controlSensitivity: 1.0     // multiplier for control inputs
  },
  
  // Heavier bomber with different characteristics
  'bomber': {
    mass: 30000,
    wingspan: 20,
    wingArea: 80,
    maxThrust: 180000,
    dragCoefficient: 0.03,
    liftCoefficient: 0.12,
    maxLiftCoefficient: 1.2,
    stallAngleRadians: 0.25,
    rollRate: 1.0,
    pitchRate: 0.7,
    yawRate: 0.5,
    maxSpeed: 650,
    minSpeed: 220,
    controlSensitivity: 0.7
  },
  
  // Light, agile aircraft
  'light': {
    mass: 5000,
    wingspan: 8,
    wingArea: 15,
    maxThrust: 60000,
    dragCoefficient: 0.019,
    liftCoefficient: 0.18,
    maxLiftCoefficient: 1.8,
    stallAngleRadians: 0.35,
    rollRate: 4.0,
    pitchRate: 1.5,
    yawRate: 1.0,
    maxSpeed: 700,
    minSpeed: 180,
    controlSensitivity: 1.2
  }
};

// Physical constants
const GRAVITY = 9.81;          // m/s²
const AIR_DENSITY = 1.225;     // kg/m³ at sea level
const DEGREES_TO_RADIANS = Math.PI / 180;

/**
 * FlightModel class implementing aircraft physics
 */
class FlightModel {
  /**
   * Create a new flight model with specified aircraft type
   * @param {string} aircraftType - Type of aircraft ('fighter', 'bomber', 'light')
   * @param {Object} customParams - Optional custom parameters to override defaults
   */
  constructor(aircraftType = 'fighter', customParams = {}) {
    // Select aircraft profile
    this.profile = { ...AIRCRAFT_PROFILES[aircraftType] || AIRCRAFT_PROFILES.fighter };
    
    // Apply any custom parameter overrides
    Object.assign(this.profile, customParams);
    
    // Current state
    this.position = new THREE.Vector3(0, 100, 0);
    this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    this.quaternion = new THREE.Quaternion();
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.angularVelocity = new THREE.Vector3(0, 0, 0);
    
    // Initialize control inputs (neutral)
    this.controls = {
      throttle: 0,      // 0 to 1
      pitch: 0,         // -1 to 1 (pull back / push forward)
      roll: 0,          // -1 to 1 (left / right)
      yaw: 0,           // -1 to 1 (left / right)
      flaps: 0,         // 0 to 1
      airbrake: 0       // 0 to 1
    };
    
    // Current forces
    this.forces = {
      lift: new THREE.Vector3(),
      drag: new THREE.Vector3(),
      thrust: new THREE.Vector3(),
      gravity: new THREE.Vector3(),
      total: new THREE.Vector3()
    };
    
    // Flight data
    this.flightData = {
      airspeed: 0,           // m/s
      verticalSpeed: 0,      // m/s
      altitude: 0,           // m
      angleOfAttack: 0,      // radians
      stalled: false,        // Is aircraft stalled?
      g: 1,                  // G-force
      throttlePercent: 0     // 0-100%
    };
    
    // Environment conditions (can be updated externally)
    this.environment = {
      windDirection: new THREE.Vector3(0, 0, 0),
      windSpeed: 0,
      turbulence: 0,
      airDensity: AIR_DENSITY
    };
    
    // Performance caching
    this._lastUpdate = 0;
    this._cachedMatrices = {};
  }
  
  /**
   * Set control inputs for the aircraft
   * @param {number} throttle - Throttle setting (0 to 1)
   * @param {number} roll - Roll input (-1 to 1)
   * @param {number} pitch - Pitch input (-1 to 1)
   * @param {number} yaw - Yaw input (-1 to 1)
   * @param {number} flaps - Flaps setting (0 to 1)
   * @param {number} airbrake - Airbrake setting (0 to 1)
   */
  setControls(throttle, roll, pitch, yaw, flaps = 0, airbrake = 0) {
    this.controls.throttle = clamp(throttle, 0, 1);
    this.controls.roll = clamp(roll, -1, 1);
    this.controls.pitch = clamp(pitch, -1, 1);
    this.controls.yaw = clamp(yaw, -1, 1);
    this.controls.flaps = clamp(flaps, 0, 1);
    this.controls.airbrake = clamp(airbrake, 0, 1);
  }
  
  /**
   * Update the flight model for a given time step
   * @param {THREE.Vector3} position - Current position
   * @param {THREE.Euler} rotation - Current rotation
   * @param {THREE.Vector3} velocity - Current velocity
   * @param {number} deltaTime - Time step in seconds
   * @returns {Object} Updated physics state
   */
  update(position, rotation, velocity, deltaTime) {
    // Copy input values
    this.position.copy(position);
    this.rotation.copy(rotation);
    this.velocity.copy(velocity);
    
    // Update quaternion from rotation
    this.quaternion.setFromEuler(this.rotation);
    
    // Calculate altitude
    this.flightData.altitude = this.position.y;
    
    // Update air density based on altitude
    this._updateAirDensity();
    
    // Calculate airspeed and related flight data
    this._calculateFlightData();
    
    // Calculate aerodynamic forces
    this._calculateForces();
    
    // Apply flight dynamics
    this._applyPhysics(deltaTime);
    
    // Apply control inputs
    this._applyControls(deltaTime);
    
    // Apply environmental effects
    this._applyEnvironment(deltaTime);
    
    // Check for stall conditions
    this._checkStall();
    
    // Return updated state
    return {
      position: this.position,
      rotation: this.rotation,
      velocity: this.velocity,
      flightData: { ...this.flightData }
    };
  }
  
  /**
   * Update air density based on altitude (simplified atmospheric model)
   * @private
   */
  _updateAirDensity() {
    // Simplified exponential atmosphere model
    const altitude = Math.max(0, this.position.y);
    this.environment.airDensity = AIR_DENSITY * Math.exp(-altitude / 8000);
  }
  
  /**
   * Calculate flight data including airspeed, angle of attack, etc.
   * @private
   */
  _calculateFlightData() {
    // Calculate airspeed (magnitude of velocity)
    this.flightData.airspeed = this.velocity.length();
    
    // Convert to km/h for display
    this.flightData.airspeedKph = this.flightData.airspeed * 3.6;
    
    // Calculate vertical speed
    this.flightData.verticalSpeed = this.velocity.y;
    
    // Calculate angle of attack (simplified)
    // Get forward and up vectors
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion).normalize();
    
    // Calculate normalized velocity vector
    const velocityNorm = this.velocity.clone().normalize();
    
    // Calculate angle between forward and velocity
    if (this.flightData.airspeed > 1) {
      this.flightData.angleOfAttack = Math.acos(clamp(forward.dot(velocityNorm), -1, 1));
      
      // Determine if AoA is positive or negative by checking if velocity is above or below forward
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion).normalize();
      const sideComponent = velocityNorm.dot(right);
      
      // Calculate sideslip angle
      this.flightData.sideslipAngle = Math.asin(clamp(sideComponent, -1, 1));
    } else {
      this.flightData.angleOfAttack = 0;
      this.flightData.sideslipAngle = 0;
    }
    
    // Throttle percentage 
    this.flightData.throttlePercent = this.controls.throttle * 100;
  }
  
  /**
   * Calculate all forces acting on the aircraft
   * @private
   */
  _calculateForces() {
    // Reset total force
    this.forces.total.set(0, 0, 0);
    
    // Get the orientation vectors of the aircraft
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion).normalize();
    
    // Calculate direction of movement relative to the aircraft
    const velDir = this.velocity.clone().normalize();
    const airspeed = this.flightData.airspeed;
    
    // Calculate lift coefficient based on angle of attack
    let liftCoeff = this.profile.liftCoefficient;
    
    // Add lift from angle of attack (simplified model)
    const aoa = this.flightData.angleOfAttack;
    if (aoa < this.profile.stallAngleRadians) {
      // Linear region before stall
      liftCoeff += aoa * 5;
    } else {
      // After stall, lift drops off
      liftCoeff = Math.max(0.1, liftCoeff - (aoa - this.profile.stallAngleRadians) * 2);
    }
    
    // Add lift from flaps
    liftCoeff += this.controls.flaps * 0.3;
    
    // Ensure we don't exceed maximum lift coefficient
    liftCoeff = Math.min(liftCoeff, this.profile.maxLiftCoefficient);
    
    // Calculate lift magnitude
    // L = 0.5 * rho * v^2 * S * Cl
    const liftMagnitude = 0.5 * this.environment.airDensity * airspeed * airspeed * 
                        this.profile.wingArea * liftCoeff;
    
    // Apply lift in the up direction of the aircraft (perpendicular to velocity)
    // We need to get the component perpendicular to velocity
    const liftDirection = new THREE.Vector3();
    // Calculate lift direction: perpendicular to velocity and right vector
    if (airspeed > 1) { // Only if we're moving
      // Correct lift direction: perpendicular to velocity and aircraft right
      liftDirection.crossVectors(right, velDir).normalize();
    } else {
      liftDirection.copy(up);
    }
    
    this.forces.lift.copy(liftDirection).multiplyScalar(liftMagnitude);
    
    // Calculate drag
    // Induced drag increases with lift squared
    const inducedDragCoeff = (liftCoeff * liftCoeff) / (Math.PI * this.profile.wingspan);
    
    // Parasitic drag from the airframe
    const parasiticDragCoeff = this.profile.dragCoefficient;
    
    // Additional drag from airbrakes, flaps, landing gear
    const additionalDrag = this.controls.airbrake * 0.5 + this.controls.flaps * 0.1;
    
    // Total drag coefficient
    const dragCoeff = parasiticDragCoeff + inducedDragCoeff + additionalDrag;
    
    // Calculate drag magnitude
    // D = 0.5 * rho * v^2 * S * Cd
    const dragMagnitude = 0.5 * this.environment.airDensity * airspeed * airspeed * 
                        this.profile.wingArea * dragCoeff;
    
    // Apply drag in the opposite direction of velocity
    if (airspeed > 0.01) {
      this.forces.drag.copy(velDir).multiplyScalar(-dragMagnitude);
    } else {
      this.forces.drag.set(0, 0, 0);
    }
    
    // Calculate thrust
    const thrustMagnitude = this.controls.throttle * this.profile.maxThrust;
    this.forces.thrust.copy(forward).multiplyScalar(thrustMagnitude);
    
    // Calculate gravity
    this.forces.gravity.set(0, -GRAVITY * this.profile.mass, 0);
    
    // Sum all forces
    this.forces.total.add(this.forces.lift)
                    .add(this.forces.drag)
                    .add(this.forces.thrust)
                    .add(this.forces.gravity);
    
    // Calculate g-force (simplified)
    const acceleration = this.forces.total.clone().divideScalar(this.profile.mass);
    const verticalAccel = Math.abs(acceleration.dot(up) + GRAVITY); // Add gravity because we already include it in forces
    this.flightData.g = verticalAccel / GRAVITY;
  }
  
  /**
   * Apply physics calculations to update position and velocity
   * @param {number} deltaTime - Time step in seconds
   * @private
   */
  _applyPhysics(deltaTime) {
    // Calculate acceleration from forces (F = ma)
    const acceleration = this.forces.total.clone().divideScalar(this.profile.mass);
    
    // Update velocity using acceleration (v = v0 + at)
    this.velocity.add(acceleration.clone().multiplyScalar(deltaTime));
    
    // Update position using velocity (p = p0 + vt)
    this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
    
    // Prevent going underground (very basic terrain collision)
    if (this.position.y < 0) {
      this.position.y = 0;
      // Bounce with energy loss
      if (this.velocity.y < 0) {
        this.velocity.y = -this.velocity.y * 0.3; // 70% energy loss
      }
    }
  }
  
  /**
   * Apply control inputs to manipulate aircraft attitude
   * @param {number} deltaTime - Time step in seconds
   * @private
   */
  _applyControls(deltaTime) {
    // Apply roll (around forward axis)
    const rollRate = this.profile.rollRate * this.controls.roll * this.profile.controlSensitivity;
    
    // Apply pitch (around right axis)
    // Pitch effectiveness decreases at high angles of attack
    let pitchEffectiveness = 1.0;
    if (this.flightData.angleOfAttack > this.profile.stallAngleRadians) {
      // Reduced control effectiveness in stall
      pitchEffectiveness = Math.max(0.2, 1.0 - (this.flightData.angleOfAttack - this.profile.stallAngleRadians) * 3);
    }
    const pitchRate = this.profile.pitchRate * this.controls.pitch * pitchEffectiveness * this.profile.controlSensitivity;
    
    // Apply yaw (around up axis)
    const yawRate = this.profile.yawRate * this.controls.yaw * this.profile.controlSensitivity;
    
    // Create rotation quaternions
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -rollRate * deltaTime);
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitchRate * deltaTime);
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yawRate * deltaTime);
    
    // Apply rotations in proper order (yaw, pitch, roll)
    this.quaternion.multiply(yawQuat).multiply(pitchQuat).multiply(rollQuat);
    this.quaternion.normalize(); // Ensure we don't accumulate errors
    
    // Update Euler angles from quaternion
    this.rotation.setFromQuaternion(this.quaternion, 'YXZ');
  }
  
  /**
   * Apply environmental effects like wind and turbulence
   * @param {number} deltaTime - Time step in seconds
   * @private
   */
  _applyEnvironment(deltaTime) {
    // Apply wind effect on velocity
    if (this.environment.windSpeed > 0) {
      // Wind affects aircraft based on its size (larger = more affected)
      const windFactor = 0.2 * (this.profile.wingspan / 10); // Normalized by a 10m wingspan
      
      // Calculate wind force
      const windForce = this.environment.windDirection.clone()
        .normalize()
        .multiplyScalar(this.environment.windSpeed * windFactor);
      
      // Add wind force to velocity
      this.velocity.add(windForce.multiplyScalar(deltaTime));
    }
    
    // Apply turbulence if present
    if (this.environment.turbulence > 0) {
      // Random turbulence forces
      const turbulenceFactor = this.environment.turbulence * this.flightData.airspeed * 0.01;
      
      // Add random perturbations
      this.velocity.x += (Math.random() - 0.5) * turbulenceFactor * deltaTime;
      this.velocity.y += (Math.random() - 0.5) * turbulenceFactor * deltaTime;
      this.velocity.z += (Math.random() - 0.5) * turbulenceFactor * deltaTime;
      
      // Also add random rotation effects
      const turbRotFactor = this.environment.turbulence * 0.05;
      
      // Create small random rotation quaternion
      const turbRoll = (Math.random() - 0.5) * turbRotFactor * deltaTime;
      const turbPitch = (Math.random() - 0.5) * turbRotFactor * deltaTime;
      const turbYaw = (Math.random() - 0.5) * turbRotFactor * deltaTime;
      
      const turbQuat = new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(turbPitch, turbYaw, turbRoll));
      
      // Apply turbulence rotation
      this.quaternion.multiply(turbQuat);
      this.quaternion.normalize();
      
      // Update Euler angles
      this.rotation.setFromQuaternion(this.quaternion, 'YXZ');
    }
  }
  
  /**
   * Check if the aircraft is in a stall condition
   * @private
   */
  _checkStall() {
    // Check angle of attack
    if (this.flightData.angleOfAttack > this.profile.stallAngleRadians) {
      this.flightData.stalled = true;
      
      // In a stall, add some realistic stall effects
      if (this.flightData.airspeed > 10) { // Only if we have some airspeed
        // Add random rotation in stall (aircraft becomes unstable)
        const stallPitch = (Math.random() - 0.3) * 0.1; // Tend to pitch down
        const stallRoll = (Math.random() - 0.5) * 0.2;
        
        // Apply stall rotations
        this.rotation.x += stallPitch;
        this.rotation.z += stallRoll;
        
        // Update quaternion
        this.quaternion.setFromEuler(this.rotation);
      }
    } else {
      this.flightData.stalled = false;
    }
    
    // Also stall if airspeed is too low (regardless of AOA)
    if (this.flightData.airspeedKph < this.profile.minSpeed) {
      this.flightData.stalled = true;
    }
  }
  
  /**
   * Returns a complete debug data object with all relevant flight information
   * @returns {Object} Debug data for flight model
   */
  getDebugData() {
    return {
      position: this.position.toArray(),
      rotation: [
        this.rotation.x * (180 / Math.PI),
        this.rotation.y * (180 / Math.PI),
        this.rotation.z * (180 / Math.PI)
      ],
      velocity: {
        vector: this.velocity.toArray(),
        magnitude: this.velocity.length(),
        kph: this.flightData.airspeedKph
      },
      forces: {
        lift: this.forces.lift.length(),
        drag: this.forces.drag.length(),
        thrust: this.forces.thrust.length(),
        total: this.forces.total.toArray()
      },
      flightData: {
        altitude: this.flightData.altitude,
        airspeed: this.flightData.airspeed,
        airspeedKph: this.flightData.airspeedKph,
        verticalSpeed: this.flightData.verticalSpeed,
        angleOfAttack: this.flightData.angleOfAttack * (180 / Math.PI),
        sideslipAngle: this.flightData.sideslipAngle * (180 / Math.PI),
        stalled: this.flightData.stalled,
        gForce: this.flightData.g,
        throttle: this.flightData.throttlePercent
      },
      controls: { ...this.controls }
    };
  }
}

module.exports = FlightModel;