// SkyWars Aircraft Physics and Controls Implementation
// Provides realistic flight simulation with multiple control schemes

import * as THREE from 'three';
import { Vector3, Quaternion, Euler, Matrix4 } from 'three';

/**
 * Manages aircraft physics simulation and controls
 */
export class FlightModel {
  constructor(options = {}) {
    // Default configuration
    this.config = {
      // Physics update rate
      updateRate: 60, // Hz
      deltaTime: 1 / 60, // seconds
      
      // Environment
      gravity: 9.81, // m/s²
      airDensity: 1.225, // kg/m³ (sea level)
      
      // Debug
      debug: false,
      
      // Override with provided options
      ...options
    };
    
    // Aircraft state
    this.state = {
      // Position and orientation
      position: new Vector3(0, 100, 0),
      quaternion: new Quaternion(),
      velocity: new Vector3(0, 0, 0),
      angularVelocity: new Vector3(0, 0, 0),
      
      // Control inputs (normalized -1 to 1)
      throttle: 0, // 0 to 1
      pitch: 0,
      roll: 0,
      yaw: 0,
      
      // Flight data
      airspeed: 0,
      verticalSpeed: 0,
      altitude: 100,
      heading: 0,
      angleOfAttack: 0,
      sideSlip: 0,
      bankAngle: 0,
      
      // Performance stats
      stallWarning: false,
      gForce: 1.0,
      
      // Weather & environment
      windVector: new Vector3(0, 0, 0),
      turbulenceIntensity: 0,
    };
    
    // Initialize aircraft template
    this.aircraft = this.createAircraftTemplate('cessna172');
    
    // Initialize input controller
    this.inputController = new InputController(this);
    
    // Initialize turbulence generator
    this.turbulence = new TurbulenceGenerator(this);
    
    // Create a clock for timing
    this.clock = new THREE.Clock();
    this.lastTime = 0;
    
    // Initialize debug data if enabled
    if (this.config.debug) {
      this.debugData = {
        forces: {
          lift: new Vector3(),
          drag: new Vector3(),
          thrust: new Vector3(),
          weight: new Vector3(),
          total: new Vector3()
        },
        moments: {
          pitch: 0,
          roll: 0,
          yaw: 0
        }
      };
    }
  }
  
  /**
   * Creates an aircraft template with specific flight characteristics
   */
  createAircraftTemplate(type) {
    // Available aircraft templates
    const templates = {
      // Cessna 172 - Light general aviation aircraft
      cessna172: {
        // Basic specifications
        name: 'Cessna 172 Skyhawk',
        type: 'prop',
        wingspan: 11, // meters
        length: 8.28, // meters
        height: 2.72, // meters
        wingArea: 16.2, // m²
        aspectRatio: 7.32, // wingspan²/wingArea
        
        // Mass properties
        mass: 1111, // kg (fully loaded)
        momentOfInertia: new Vector3(
          1285, // Ixx (roll)
          1825, // Iyy (pitch)
          2667  // Izz (yaw)
        ),
        centerOfMass: new Vector3(0, 0, 0),
        
        // Aerodynamic properties
        zeroLiftAoA: -2 * Math.PI / 180, // radians
        stallAngleHigh: 16 * Math.PI / 180, // radians
        stallAngleLow: -14 * Math.PI / 180, // radians
        
        // Lift and drag coefficients
        clSlope: 5.0, // Lift curve slope
        cd0: 0.027, // Zero-lift drag coefficient
        k: 0.045, // Induced drag factor
        
        // Control surfaces effectiveness
        controlEffectiveness: {
          pitch: 1.5,
          roll: 1.0,
          yaw: 1.2
        },
        
        // Engine specifications
        engine: {
          type: 'piston',
          maxPower: 120000, // Watts (160 HP)
          maxRPM: 2700,
          propellerDiameter: 1.88, // meters
          propellerEfficiency: 0.85,
          fuelConsumption: 35, // liters per hour at full power
        },
        
        // Flight envelope
        maxSpeed: 60, // m/s (approx 120 knots)
        cruiseSpeed: 50, // m/s (approx 100 knots)
        stallSpeed: 24, // m/s (approx 48 knots, flaps up)
        maxAltitude: 4115, // meters (13,500 feet)
        climbRate: 3.7, // m/s (730 fpm)
        
        // Flight model behavior
        flightModel: {
          stability: {
            pitch: 0.7, // Pitch stability (0-1)
            roll: 0.3,  // Roll stability (0-1)
            yaw: 0.5    // Yaw stability (0-1)
          },
          
          // Response rates (lower = more responsive)
          responsiveness: {
            pitch: 1.0,
            roll: 0.8,
            yaw: 1.2
          },
          
          // Dampening (higher = less oscillation)
          dampening: {
            pitch: 0.6,
            roll: 0.5,
            yaw: 0.7
          }
        }
      },
      
      // Spitfire - WWII Fighter
      spitfire: {
        name: 'Supermarine Spitfire',
        type: 'prop',
        wingspan: 11.23,
        length: 9.12,
        height: 3.02,
        wingArea: 22.48,
        aspectRatio: 5.61,
        
        mass: 3000,
        momentOfInertia: new Vector3(
          5000, // Ixx (roll)
          9000, // Iyy (pitch)
          12000 // Izz (yaw)
        ),
        centerOfMass: new Vector3(0, -0.1, 0),
        
        zeroLiftAoA: -1 * Math.PI / 180,
        stallAngleHigh: 18 * Math.PI / 180,
        stallAngleLow: -15 * Math.PI / 180,
        
        clSlope: 5.5,
        cd0: 0.025,
        k: 0.040,
        
        controlEffectiveness: {
          pitch: 2.0,
          roll: 1.8,
          yaw: 1.5
        },
        
        engine: {
          type: 'piston',
          maxPower: 1074000, // Watts (1,440 HP)
          maxRPM: 3000,
          propellerDiameter: 3.27,
          propellerEfficiency: 0.8,
          fuelConsumption: 300,
        },
        
        maxSpeed: 111, // m/s (approx 220 knots)
        cruiseSpeed: 83, // m/s (approx 160 knots)
        stallSpeed: 38, // m/s (approx 75 knots)
        maxAltitude: 9400, // meters (31,000 feet)
        climbRate: 13.4, // m/s (2,640 fpm)
        
        flightModel: {
          stability: {
            pitch: 0.5,
            roll: 0.2,
            yaw: 0.4
          },
          responsiveness: {
            pitch: 0.7,
            roll: 0.5,
            yaw: 0.9
          },
          dampening: {
            pitch: 0.5,
            roll: 0.3,
            yaw: 0.5
          }
        }
      },
      
      // F/A-18 Hornet - Modern jet fighter
      fa18: {
        name: 'F/A-18 Hornet',
        type: 'jet',
        wingspan: 11.43,
        length: 17.07,
        height: 4.66,
        wingArea: 37.16,
        aspectRatio: 3.5,
        
        mass: 16800,
        momentOfInertia: new Vector3(
          22967, // Ixx (roll)
          176867, // Iyy (pitch)
          194180  // Izz (yaw)
        ),
        centerOfMass: new Vector3(0, -0.15, 0),
        
        zeroLiftAoA: 0 * Math.PI / 180,
        stallAngleHigh: 25 * Math.PI / 180,
        stallAngleLow: -20 * Math.PI / 180,
        
        clSlope: 3.5,
        cd0: 0.022,
        k: 0.1,
        
        controlEffectiveness: {
          pitch: 3.0,
          roll: 3.5,
          yaw: 2.0
        },
        
        engine: {
          type: 'jet',
          maxThrust: 160000, // N (2x 80kN)
          afterburner: 1.5, // Afterburner thrust multiplier
          fuelConsumption: 7500, // kg/hour at full power
        },
        
        maxSpeed: 361, // m/s (approx 700 knots)
        cruiseSpeed: 241, // m/s (approx 470 knots)
        stallSpeed: 67, // m/s (approx 130 knots)
        maxAltitude: 15000, // meters (50,000 feet)
        climbRate: 254, // m/s (50,000 fpm)
        
        flightModel: {
          stability: {
            pitch: 0.3,
            roll: 0.1,
            yaw: 0.2
          },
          responsiveness: {
            pitch: 0.5,
            roll: 0.3,
            yaw: 0.6
          },
          dampening: {
            pitch: 0.4,
            roll: 0.2,
            yaw: 0.3
          }
        }
      }
    };
    
    // Return the requested template or default to Cessna if not found
    return templates[type] || templates.cessna172;
  }
  
  /**
   * Changes the active aircraft type
   */
  setAircraftType(type) {
    const newAircraft = this.createAircraftTemplate(type);
    
    // Maintain current position and orientation
    const currentPosition = this.state.position.clone();
    const currentQuaternion = this.state.quaternion.clone();
    
    // Reset velocity when changing aircraft
    this.state.velocity.set(0, 0, 0);
    this.state.angularVelocity.set(0, 0, 0);
    
    // Update aircraft
    this.aircraft = newAircraft;
    
    // Restore position and orientation
    this.state.position.copy(currentPosition);
    this.state.quaternion.copy(currentQuaternion);
    
    // Reset controls
    this.state.throttle = 0.3; // Start with some throttle
    this.state.pitch = 0;
    this.state.roll = 0;
    this.state.yaw = 0;
    
    return this.aircraft;
  }
  
  /**
   * Updates the flight model with the given time delta
   */
  update(deltaTime = null) {
    // Use provided delta or calculate from clock
    if (deltaTime === null) {
      const time = this.clock.getElapsedTime();
      deltaTime = time - this.lastTime;
      this.lastTime = time;
    }
    
    // Cap delta time to prevent huge jumps
    deltaTime = Math.min(deltaTime, 0.1);
    
    // Ensure we have a non-zero delta
    if (deltaTime <= 0) return;
    
    // Update input controller
    this.inputController.update(deltaTime);
    
    // Update environment effects
    this.turbulence.update(deltaTime);
    
    // Apply environment effects to control inputs
    this.applyEnvironmentToControls();
    
    // Calculate flight dynamics
    this.calculateFlightDynamics(deltaTime);
    
    // Update flight data
    this.updateFlightData();
    
    return this.state;
  }
  
  /**
   * Applies environmental effects like turbulence to control inputs
   */
  applyEnvironmentToControls() {
    // Skip if no turbulence
    if (this.state.turbulenceIntensity <= 0) return;
    
    // Get turbulence effect as a force vector
    const turbEffect = this.turbulence.getTurbulenceEffect();
    
    // Scale turbulence based on airspeed (more effective at higher speeds)
    const turbScale = Math.min(1.0, this.state.airspeed / 30) 
      * this.state.turbulenceIntensity;
    
    // Apply turbulence to control inputs
    this.state.pitch += turbEffect.x * turbScale * 0.3;
    this.state.roll += turbEffect.y * turbScale * 0.2;
    this.state.yaw += turbEffect.z * turbScale * 0.1;
    
    // Clamp controls to valid range
    this.state.pitch = Math.max(-1, Math.min(1, this.state.pitch));
    this.state.roll = Math.max(-1, Math.min(1, this.state.roll));
    this.state.yaw = Math.max(-1, Math.min(1, this.state.yaw));
  }
  
  /**
   * Calculate and apply all flight dynamics
   */
  calculateFlightDynamics(deltaTime) {
    // Get local aircraft axes in world space
    const localToWorldMatrix = new Matrix4().makeRotationFromQuaternion(this.state.quaternion);
    
    // Aircraft axes
    const forwardVector = new Vector3(0, 0, -1).applyMatrix4(localToWorldMatrix).normalize();
    const rightVector = new Vector3(1, 0, 0).applyMatrix4(localToWorldMatrix).normalize();
    const upVector = new Vector3(0, 1, 0).applyMatrix4(localToWorldMatrix).normalize();
    
    // Calculate relative wind (airspeed) vector
    const relativeWindVector = this.calculateRelativeWind(forwardVector);
    
    // Calculate airspeed (magnitude of relative wind)
    this.state.airspeed = relativeWindVector.length();
    
    // Calculate angle of attack and sideslip
    this.calculateAoAAndSideslip(forwardVector, upVector, rightVector, relativeWindVector);
    
    // Initialize force and moment accumulators
    const forces = new Vector3(0, 0, 0);
    const moments = new Vector3(0, 0, 0);
    
    // Calculate and accumulate all forces and moments
    this.applyWeight(forces);
    this.applyAerodynamicForces(forces, moments, forwardVector, upVector, rightVector, relativeWindVector);
    this.applyThrust(forces, forwardVector);
    this.applyControlForces(moments);
    
    // Store debug data if enabled
    if (this.config.debug) {
      this.debugData.forces.total.copy(forces);
    }
    
    // Apply forces to velocity and position
    this.applyForces(forces, moments, deltaTime);
    
    // Update position and rotation
    this.updatePositionAndRotation(deltaTime);
  }
  
  /**
   * Calculate the relative wind vector considering aircraft velocity and world wind
   */
  calculateRelativeWind(forwardVector) {
    // Start with negative of aircraft velocity (if aircraft moves forward, wind comes from front)
    const relativeWind = this.state.velocity.clone().negate();
    
    // Add world wind vector
    relativeWind.add(this.state.windVector);
    
    // If airspeed is very low, default to forward vector to avoid mathematical issues
    if (relativeWind.lengthSq() < 0.1) {
      relativeWind.copy(forwardVector).multiplyScalar(0.1);
    }
    
    return relativeWind;
  }
  
  /**
   * Calculate angle of attack (AoA) and sideslip angle
   */
  calculateAoAAndSideslip(forwardVector, upVector, rightVector, relativeWindVector) {
    // Normalize relative wind
    const relativeWindNorm = relativeWindVector.clone().normalize();
    
    // Project relative wind onto aircraft's xz plane for AoA
    const relWindXZ = new Vector3(
      relativeWindNorm.dot(forwardVector),
      relativeWindNorm.dot(upVector),
      0
    ).normalize();
    
    // Angle of Attack is angle between forward vector and relative wind projected onto xz plane
    this.state.angleOfAttack = Math.asin(
      Math.max(-1, Math.min(1, relWindXZ.dot(upVector)))
    );
    
    // Sideslip is angle between relative wind and aircraft's xz plane
    this.state.sideSlip = Math.asin(
      Math.max(-1, Math.min(1, relativeWindNorm.dot(rightVector)))
    );
    
    // Calculate bank angle from up vector
    const worldUp = new Vector3(0, 1, 0);
    const projectedUp = upVector.clone().projectOnPlane(worldUp).normalize();
    
    this.state.bankAngle = Math.atan2(
      projectedUp.dot(rightVector),
      projectedUp.dot(forwardVector)
    );
  }
  
  /**
   * Apply weight force
   */
  applyWeight(forces) {
    // F = m * g
    const weight = new Vector3(0, -this.aircraft.mass * this.config.gravity, 0);
    
    forces.add(weight);
    
    // Store for debug
    if (this.config.debug) {
      this.debugData.forces.weight.copy(weight);
    }
  }
  
  /**
   * Apply all aerodynamic forces (lift, drag, etc)
   */
  applyAerodynamicForces(forces, moments, forwardVector, upVector, rightVector, relativeWindVector) {
    // Skip if no airspeed
    if (this.state.airspeed < 0.1) return;
    
    // Calculate dynamic pressure
    // q = 0.5 * rho * v^2
    const dynamicPressure = 0.5 * this.config.airDensity * Math.pow(this.state.airspeed, 2);
    
    // Lift calculation
    const aoa = this.state.angleOfAttack;
    
    // Check for stall
    this.state.stallWarning = false;
    let liftCoefficient = 0;
    
    if (aoa > this.aircraft.stallAngleHigh || aoa < this.aircraft.stallAngleLow) {
      // Stall condition
      this.state.stallWarning = true;
      
      // Reduced lift during stall
      liftCoefficient = Math.sin(2 * aoa) * 0.8;
    } else {
      // Normal flight
      // CL = CL_0 + CL_alpha * (AoA - AoA_0)
      liftCoefficient = this.aircraft.clSlope * (aoa - this.aircraft.zeroLiftAoA);
    }
    
    // Calculate induced drag coefficient
    // CD_i = CL^2 / (pi * AR * e)
    const inducedDragCoef = Math.pow(liftCoefficient, 2) * this.aircraft.k;
    
    // Total drag coefficient
    // CD = CD_0 + CD_i
    const dragCoefficient = this.aircraft.cd0 + inducedDragCoef;
    
    // Calculate lift and drag magnitudes
    // L = q * S * CL
    const liftMagnitude = dynamicPressure * this.aircraft.wingArea * liftCoefficient;
    
    // D = q * S * CD
    const dragMagnitude = dynamicPressure * this.aircraft.wingArea * dragCoefficient;
    
    // Lift direction: perpendicular to relative wind and in the aircraft's vertical plane
    const liftDirection = relativeWindVector.clone()
      .cross(rightVector)
      .normalize();
    
    // Drag direction: opposite to relative wind
    const dragDirection = relativeWindVector.clone()
      .normalize()
      .negate();
    
    // Calculate lift and drag forces
    const liftForce = liftDirection.clone()
      .multiplyScalar(liftMagnitude);
    
    const dragForce = dragDirection.clone()
      .multiplyScalar(dragMagnitude);
    
    // Apply forces
    forces.add(liftForce);
    forces.add(dragForce);
    
    // Store for debug
    if (this.config.debug) {
      this.debugData.forces.lift.copy(liftForce);
      this.debugData.forces.drag.copy(dragForce);
    }
    
    // Apply side force due to sideslip
    if (Math.abs(this.state.sideSlip) > 0.01) {
      const sideForceCoef = -1.0 * Math.sin(this.state.sideSlip) * Math.pow(Math.abs(this.state.sideSlip), 0.5);
      const sideForce = rightVector.clone()
        .multiplyScalar(dynamicPressure * this.aircraft.wingArea * sideForceCoef);
      
      forces.add(sideForce);
    }
    
    // Calculate natural stability moments
    this.applyStabilityMoments(moments, dynamicPressure);
  }
  
  /**
   * Apply natural stability moments
   */
  applyStabilityMoments(moments, dynamicPressure) {
    const { stability } = this.aircraft.flightModel;
    
    // Pitch stability (tendency to return to neutral AoA)
    const pitchStability = -this.state.angleOfAttack * stability.pitch 
      * dynamicPressure * this.aircraft.wingArea * 0.1;
    
    // Roll stability (tendency to level wings)
    const rollStability = -this.state.bankAngle * stability.roll
      * dynamicPressure * this.aircraft.wingArea * 0.1;
    
    // Yaw stability (tendency to align with relative wind)
    const yawStability = -this.state.sideSlip * stability.yaw 
      * dynamicPressure * this.aircraft.wingArea * 0.1;
    
    // Apply stability moments
    moments.x += rollStability;
    moments.y += yawStability;
    moments.z += pitchStability;
  }
  
  /**
   * Apply thrust force
   */
  applyThrust(forces, forwardVector) {
    let thrustMagnitude = 0;
    
    // Calculate thrust based on engine type
    if (this.aircraft.engine.type === 'piston' || this.aircraft.engine.type === 'turboprop') {
      // Piston/turboprop engine with propeller
      const power = this.aircraft.engine.maxPower * this.state.throttle;
      
      // Calculate propeller efficiency (simplified)
      // Higher efficiency at cruise speed, lower at extremes
      const normalizedSpeed = Math.min(1, this.state.airspeed / this.aircraft.cruiseSpeed);
      let propEfficiency = this.aircraft.engine.propellerEfficiency 
        * (1 - Math.pow(1 - normalizedSpeed, 2) * 0.5);
      
      // Prevent negative thrust
      propEfficiency = Math.max(0, propEfficiency);
      
      // P = F * v, so F = P / v
      if (this.state.airspeed > 1.0) {
        thrustMagnitude = power * propEfficiency / this.state.airspeed;
      } else {
        // Static thrust approximation
        thrustMagnitude = power * propEfficiency * 1.0;
      }
    } else if (this.aircraft.engine.type === 'jet') {
      // Jet engine
      thrustMagnitude = this.aircraft.engine.maxThrust * this.state.throttle;
      
      // Apply afterburner if available and throttle is maxed
      if (this.aircraft.engine.afterburner && this.state.throttle > 0.99) {
        thrustMagnitude *= this.aircraft.engine.afterburner;
      }
      
      // Jets lose some thrust at higher altitudes
      if (this.state.altitude > 10000) {
        const altFactor = Math.max(0.6, 1 - (this.state.altitude - 10000) / 30000);
        thrustMagnitude *= altFactor;
      }
    }
    
    // Apply thrust in forward direction
    const thrustForce = forwardVector.clone().multiplyScalar(thrustMagnitude);
    forces.add(thrustForce);
    
    // Store for debug
    if (this.config.debug) {
      this.debugData.forces.thrust.copy(thrustForce);
    }
  }
  
  /**
   * Apply control forces from pilot inputs
   */
  applyControlForces(moments) {
    const { controlEffectiveness } = this.aircraft;
    const dynamicPressure = 0.5 * this.config.airDensity * Math.pow(this.state.airspeed, 2);
    
    // Scale control effectiveness with airspeed
    const controlScale = Math.min(1.0, dynamicPressure / 50);
    
    // Apply pitch control (elevator)
    const pitchMoment = this.state.pitch * controlEffectiveness.pitch * controlScale;
    
    // Apply roll control (ailerons)
    const rollMoment = this.state.roll * controlEffectiveness.roll * controlScale;
    
    // Apply yaw control (rudder)
    const yawMoment = this.state.yaw * controlEffectiveness.yaw * controlScale;
    
    // Apply control moments
    moments.x += rollMoment;  // Roll
    moments.y += yawMoment;   // Yaw
    moments.z += pitchMoment; // Pitch
    
    // Store for debug
    if (this.config.debug) {
      this.debugData.moments.roll = rollMoment;
      this.debugData.moments.yaw = yawMoment;
      this.debugData.moments.pitch = pitchMoment;
    }
  }
  
  /**
   * Apply accumulated forces and moments to update velocity
   */
  applyForces(forces, moments, deltaTime) {
    // F = m * a, so a = F / m
    const acceleration = forces.clone().divideScalar(this.aircraft.mass);
    
    // Update linear velocity: v = v0 + a * dt
    this.state.velocity.add(acceleration.clone().multiplyScalar(deltaTime));
    
    // Apply angular accelerations
    // α = M / I (angular acceleration = moment / moment of inertia)
    const angularAcceleration = new Vector3(
      moments.x / this.aircraft.momentOfInertia.x,
      moments.y / this.aircraft.momentOfInertia.y,
      moments.z / this.aircraft.momentOfInertia.z
    );
    
    // Update angular velocity: ω = ω0 + α * dt
    this.state.angularVelocity.add(angularAcceleration.multiplyScalar(deltaTime));
    
    // Apply damping to angular velocity
    const { dampening } = this.aircraft.flightModel;
    this.state.angularVelocity.x *= Math.pow(0.5, deltaTime * dampening.roll);
    this.state.angularVelocity.y *= Math.pow(0.5, deltaTime * dampening.yaw);
    this.state.angularVelocity.z *= Math.pow(0.5, deltaTime * dampening.pitch);
    
    // Calculate G-forces (simplified)
    // Component of acceleration along the aircraft's up axis
    const localAccel = acceleration.clone()
      .applyQuaternion(this.state.quaternion.clone().invert());
    
    // 1G when stationary (Earth gravity)
    this.state.gForce = localAccel.y / this.config.gravity + 1.0;
  }
  
  /**
   * Update position and rotation based on velocity
   */
  updatePositionAndRotation(deltaTime) {
    // Update position: p = p0 + v * dt
    this.state.position.add(
      this.state.velocity.clone().multiplyScalar(deltaTime)
    );
    
    // Create rotation quaternion from angular velocity
    if (this.state.angularVelocity.lengthSq() > 0) {
      const angularSpeed = this.state.angularVelocity.length();
      const axis = this.state.angularVelocity.clone().normalize();
      
      const rotationDelta = new Quaternion()
        .setFromAxisAngle(axis, angularSpeed * deltaTime);
      
      // Apply rotation
      this.state.quaternion.premultiply(rotationDelta);
      this.state.quaternion.normalize();
    }
  }
  
  /**
   * Update flight data based on current state
   */
  updateFlightData() {
    // Calculate vertical speed (m/s)
    this.state.verticalSpeed = this.state.velocity.y;
    
    // Update altitude
    this.state.altitude = this.state.position.y;
    
    // Calculate heading (yaw angle in degrees, 0-360 where 0/360 is north)
    // Forward vector in world space
    const forward = new Vector3(0, 0, -1)
      .applyQuaternion(this.state.quaternion);
    
    // Project onto xz plane
    forward.y = 0;
    forward.normalize();
    
    // Calculate heading where +Z is north
    this.state.heading = (Math.atan2(forward.x, forward.z) * 180 / Math.PI + 180) % 360;
  }
  
  /**
   * Get the current state for rendering and UI
   */
  getState() {
    return this.state;
  }
  
  /**
   * Get debug data if enabled
   */
  getDebugData() {
    return this.config.debug ? this.debugData : null;
  }
  
  /**
   * Sets environment parameters like wind and turbulence
   */
  setEnvironment(params = {}) {
    // Update wind vector if provided
    if (params.windVector) {
      this.state.windVector.copy(params.windVector);
    }
    
    // Update turbulence intensity if provided
    if (params.turbulenceIntensity !== undefined) {
      this.state.turbulenceIntensity = Math.max(0, Math.min(1, params.turbulenceIntensity));
    }
    
    // Update air density if provided (affects aerodynamics)
    if (params.airDensity) {
      this.config.airDensity = params.airDensity;
    }
  }
}

/**
 * Manages user input for aircraft control
 */
export class InputController {
  constructor(flightModel) {
    this.flightModel = flightModel;
    
    // Input state
    this.inputs = {
      // Keyboard state
      keyboard: {
        throttleUp: false,
        throttleDown: false,
        pitchUp: false,
        pitchDown: false,
        rollLeft: false,
        rollRight: false,
        yawLeft: false,
        yawRight: false,
        quickCenter: false
      },
      
      // Mouse state
      mouse: {
        active: false,
        x: 0,
        y: 0,
        sensitivity: 1.0
      },
      
      // Touch state
      touch: {
        active: false,
        leftJoystick: { x: 0, y: 0, touching: false },
        rightJoystick: { x: 0, y: 0, touching: false },
        throttle: { value: 0, touching: false }
      },
      
      // Gamepad state
      gamepad: {
        active: false,
        leftStick: { x: 0, y: 0 },
        rightStick: { x: 0, y: 0 },
        triggers: { left: 0, right: 0 }
      }
    };
    
    // Control configuration
    this.config = {
      // Control sensitivity
      sensitivity: {
        pitch: 1.0,
        roll: 1.0,
        yaw: 1.0,
        throttle: 1.0
      },
      
      // Input mode
      mode: 'keyboard', // 'keyboard', 'mouse', 'touch', 'gamepad'
      
      // Mouse control options
      mouse: {
        invertY: false,
        pitchSensitivity: 1.0,
        rollSensitivity: 1.0
      },
      
      // Touch control options
      touch: {
        dualJoysticks: true // false = single joystick + throttle slider
      }
    };
    
    // Initialize input handlers
    this.initKeyboard();
    this.initMouse();
    this.initTouch();
    this.initGamepad();
    
    // Input smoothing
    this.smoothedControls = {
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttle: 0.3 // Start with some throttle
    };
    
    // Smoothing factors (lower = smoother but less responsive)
    this.smoothing = {
      pitch: 0.2,
      roll: 0.2,
      yaw: 0.15,
      throttle: 0.1
    };
  }
  
  /**
   * Initialize keyboard controls
   */
  initKeyboard() {
    // Bind keyboard events
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
  }
  
  /**
   * Handle key down events
   */
  handleKeyDown(event) {
    if (event.repeat) return; // Ignore key repeats
    
    const { keyboard } = this.inputs;
    const key = event.key.toLowerCase();
    
    switch (key) {
      // Throttle controls
      case 'shift': keyboard.throttleUp = true; break;
      case 'control': 
      case 'ctrl': keyboard.throttleDown = true; break;
      
      // Pitch controls
      case 'w':
      case 'arrowup': keyboard.pitchUp = true; break;
      case 's':
      case 'arrowdown': keyboard.pitchDown = true; break;
      
      // Roll controls
      case 'a':
      case 'arrowleft': keyboard.rollLeft = true; break;
      case 'd':
      case 'arrowright': keyboard.rollRight = true; break;
      
      // Yaw controls
      case 'q': keyboard.yawLeft = true; break;
      case 'e': keyboard.yawRight = true; break;
      
      // Quick center controls
      case ' ': keyboard.quickCenter = true; break;
    }
    
    // Set active input mode
    this.config.mode = 'keyboard';
  }
  
  /**
   * Handle key up events
   */
  handleKeyUp(event) {
    const { keyboard } = this.inputs;
    const key = event.key.toLowerCase();
    
    switch (key) {
      // Throttle controls
      case 'shift': keyboard.throttleUp = false; break;
      case 'control': 
      case 'ctrl': keyboard.throttleDown = false; break;
      
      // Pitch controls
      case 'w':
      case 'arrowup': keyboard.pitchUp = false; break;
      case 's':
      case 'arrowdown': keyboard.pitchDown = false; break;
      
      // Roll controls
      case 'a':
      case 'arrowleft': keyboard.rollLeft = false; break;
      case 'd':
      case 'arrowright': keyboard.rollRight = false; break;
      
      // Yaw controls
      case 'q': keyboard.yawLeft = false; break;
      case 'e': keyboard.yawRight = false; break;
      
      // Quick center controls
      case ' ': keyboard.quickCenter = false; break;
    }
  }
  
  /**
   * Initialize mouse controls
   */
  initMouse() {
    // Bind mouse events
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mousedown', () => {
      this.inputs.mouse.active = true;
      this.config.mode = 'mouse';
      
      // Lock pointer for mouse flight
      if (document.pointerLockElement !== document.body) {
        document.body.requestPointerLock();
      }
    });
    
    window.addEventListener('mouseup', () => {
      this.inputs.mouse.active = false;
    });
    
    // Pointer lock change handler
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== document.body) {
        this.inputs.mouse.active = false;
      }
    });
  }
  
  /**
   * Handle mouse movement for flight control
   */
  handleMouseMove(event) {
    if (!this.inputs.mouse.active) return;
    
    // Use movementX/Y for pointer lock
    const { movementX, movementY } = event;
    
    // Scale by sensitivity
    const { pitchSensitivity, rollSensitivity, invertY } = this.config.mouse;
    
    // Update mouse position (normalized to -1 to 1)
    this.inputs.mouse.x += movementX * 0.002 * rollSensitivity;
    this.inputs.mouse.y += movementY * 0.002 * pitchSensitivity * (invertY ? -1 : 1);
    
    // Clamp values
    this.inputs.mouse.x = Math.max(-1, Math.min(1, this.inputs.mouse.x));
    this.inputs.mouse.y = Math.max(-1, Math.min(1, this.inputs.mouse.y));
    
    // Set active input mode
    this.config.mode = 'mouse';
    
    // Auto-center slowly when no movement
    if (Math.abs(movementX) < 0.01 && Math.abs(movementY) < 0.01) {
      this.inputs.mouse.x *= 0.95;
      this.inputs.mouse.y *= 0.95;
    }
  }
  
  /**
   * Initialize touch controls
   */
  initTouch() {
    // Create touch UI elements
    this.createTouchInterface();
    
    // Track touch state
    this.touchIds = {
      leftJoystick: null,
      rightJoystick: null,
      throttle: null
    };
  }
  
  /**
   * Create touch interface elements
   */
  createTouchInterface() {
    // Check if we're already initialized
    if (document.getElementById('flight-touch-controls')) return;
    
    // Create container
    const container = document.createElement('div');
    container.id = 'flight-touch-controls';
    container.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
      touch-action: none;
    `;
    
    // Create left joystick (typically roll/pitch)
    const leftJoystick = document.createElement('div');
    leftJoystick.id = 'touch-left-joystick';
    leftJoystick.className = 'touch-joystick';
    leftJoystick.style.cssText = `
      position: absolute;
      bottom: 100px;
      left: 100px;
      width: 150px;
      height: 150px;
      border-radius: 75px;
      background: rgba(255, 255, 255, 0.2);
      border: 2px solid rgba(255, 255, 255, 0.4);
      pointer-events: auto;
    `;
    
    // Joystick handle
    const leftHandle = document.createElement('div');
    leftHandle.id = 'touch-left-handle';
    leftHandle.className = 'touch-joystick-handle';
    leftHandle.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: 50px;
      height: 50px;
      margin-left: -25px;
      margin-top: -25px;
      border-radius: 25px;
      background: rgba(255, 255, 255, 0.6);
    `;
    leftJoystick.appendChild(leftHandle);
    
    // Create right joystick (typically yaw/throttle)
    const rightJoystick = document.createElement('div');
    rightJoystick.id = 'touch-right-joystick';
    rightJoystick.className = 'touch-joystick';
    rightJoystick.style.cssText = `
      position: absolute;
      bottom: 100px;
      right: 100px;
      width: 150px;
      height: 150px;
      border-radius: 75px;
      background: rgba(255, 255, 255, 0.2);
      border: 2px solid rgba(255, 255, 255, 0.4);
      pointer-events: auto;
    `;
    
    // Joystick handle
    const rightHandle = document.createElement('div');
    rightHandle.id = 'touch-right-handle';
    rightHandle.className = 'touch-joystick-handle';
    rightHandle.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: 50px;
      height: 50px;
      margin-left: -25px;
      margin-top: -25px;
      border-radius: 25px;
      background: rgba(255, 255, 255, 0.6);
    `;
    rightJoystick.appendChild(rightHandle);
    
    // Create throttle slider
    const throttleSlider = document.createElement('div');
    throttleSlider.id = 'touch-throttle';
    throttleSlider.style.cssText = `
      position: absolute;
      top: 100px;
      right: 50px;
      width: 60px;
      height: 300px;
      background: rgba(255, 255, 255, 0.2);
      border: 2px solid rgba(255, 255, 255, 0.4);
      border-radius: 30px;
      pointer-events: auto;
    `;
    
    // Throttle handle
    const throttleHandle = document.createElement('div');
    throttleHandle.id = 'touch-throttle-handle';
    throttleHandle.style.cssText = `
      position: absolute;
      bottom: 10px;
      left: 10px;
      width: 40px;
      height: 40px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.6);
    `;
    throttleSlider.appendChild(throttleHandle);
    
    // Add elements to container
    container.appendChild(leftJoystick);
    container.appendChild(rightJoystick);
    container.appendChild(throttleSlider);
    
    // Add container to body
    document.body.appendChild(container);
    
    // Add touch event listeners
    container.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    container.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    container.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
    container.addEventListener('touchcancel', (e) => this.handleTouchEnd(e), { passive: false });
  }
  
  /**
   * Handle touch start events
   */
  handleTouchStart(event) {
    event.preventDefault();
    
    // Set active input mode
    this.config.mode = 'touch';
    this.inputs.touch.active = true;
    
    // Process each touch
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      const touchId = touch.identifier;
      
      // Determine which control element was touched
      const leftJoystick = document.getElementById('touch-left-joystick');
      const rightJoystick = document.getElementById('touch-right-joystick');
      const throttle = document.getElementById('touch-throttle');
      
      if (this.elementContainsTouch(leftJoystick, touch)) {
        this.touchIds.leftJoystick = touchId;
        this.inputs.touch.leftJoystick.touching = true;
        this.updateJoystickPosition('left', touch);
      } else if (this.elementContainsTouch(rightJoystick, touch)) {
        this.touchIds.rightJoystick = touchId;
        this.inputs.touch.rightJoystick.touching = true;
        this.updateJoystickPosition('right', touch);
      } else if (this.elementContainsTouch(throttle, touch)) {
        this.touchIds.throttle = touchId;
        this.inputs.touch.throttle.touching = true;
        this.updateThrottlePosition(touch);
      }
    }
  }
  
  /**
   * Handle touch move events
   */
  handleTouchMove(event) {
    event.preventDefault();
    
    // Process each moved touch
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      const touchId = touch.identifier;
      
      // Update control based on which element is being touched
      if (touchId === this.touchIds.leftJoystick) {
        this.updateJoystickPosition('left', touch);
      } else if (touchId === this.touchIds.rightJoystick) {
        this.updateJoystickPosition('right', touch);
      } else if (touchId === this.touchIds.throttle) {
        this.updateThrottlePosition(touch);
      }
    }
  }
  
  /**
   * Handle touch end events
   */
  handleTouchEnd(event) {
    event.preventDefault();
    
    // Process each ended touch
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      const touchId = touch.identifier;
      
      // Reset control based on which element was being touched
      if (touchId === this.touchIds.leftJoystick) {
        this.touchIds.leftJoystick = null;
        this.inputs.touch.leftJoystick.touching = false;
        this.resetJoystickPosition('left');
      } else if (touchId === this.touchIds.rightJoystick) {
        this.touchIds.rightJoystick = null;
        this.inputs.touch.rightJoystick.touching = false;
        this.resetJoystickPosition('right');
      } else if (touchId === this.touchIds.throttle) {
        this.touchIds.throttle = null;
        this.inputs.touch.throttle.touching = false;
        // Don't reset throttle position - let it stay where it was
      }
    }
    
    // Check if all touches have ended
    if (!this.inputs.touch.leftJoystick.touching && 
        !this.inputs.touch.rightJoystick.touching && 
        !this.inputs.touch.throttle.touching) {
      this.inputs.touch.active = false;
    }
  }
  
  /**
   * Check if an element contains a touch point
   */
  elementContainsTouch(element, touch) {
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    return (
      touch.clientX >= rect.left &&
      touch.clientX <= rect.right &&
      touch.clientY >= rect.top &&
      touch.clientY <= rect.bottom
    );
  }
  
  /**
   * Update joystick position and input values
   */
  updateJoystickPosition(side, touch) {
    const joystickElement = document.getElementById(`touch-${side}-joystick`);
    const handleElement = document.getElementById(`touch-${side}-handle`);
    
    if (!joystickElement || !handleElement) return;
    
    const rect = joystickElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Calculate distance from center (normalized -1 to 1)
    let dx = (touch.clientX - centerX) / (rect.width / 2);
    let dy = (touch.clientY - centerY) / (rect.height / 2);
    
    // Clamp to circle
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    
    // Update joystick handle position
    const handleX = centerX + dx * (rect.width / 2);
    const handleY = centerY + dy * (rect.height / 2);
    
    handleElement.style.left = `${handleX - rect.left}px`;
    handleElement.style.top = `${handleY - rect.top}px`;
    
    // Update input values
    if (side === 'left') {
      this.inputs.touch.leftJoystick.x = dx;
      this.inputs.touch.leftJoystick.y = dy;
    } else {
      this.inputs.touch.rightJoystick.x = dx;
      this.inputs.touch.rightJoystick.y = dy;
    }
  }
  
  /**
   * Reset joystick position to center
   */
  resetJoystickPosition(side) {
    const handleElement = document.getElementById(`touch-${side}-handle`);
    
    if (!handleElement) return;
    
    // Center the handle
    handleElement.style.left = '50%';
    handleElement.style.top = '50%';
    
    // Reset input values
    if (side === 'left') {
      this.inputs.touch.leftJoystick.x = 0;
      this.inputs.touch.leftJoystick.y = 0;
    } else {
      this.inputs.touch.rightJoystick.x = 0;
      this.inputs.touch.rightJoystick.y = 0;
    }
  }
  
  /**
   * Update throttle slider position and value
   */
  updateThrottlePosition(touch) {
    const throttleElement = document.getElementById('touch-throttle');
    const handleElement = document.getElementById('touch-throttle-handle');
    
    if (!throttleElement || !handleElement) return;
    
    const rect = throttleElement.getBoundingClientRect();
    
    // Calculate position in slider (0 = bottom, 1 = top)
    let value = 1 - ((touch.clientY - rect.top) / rect.height);
    
    // Clamp value
    value = Math.max(0, Math.min(1, value));
    
    // Update handle position
    const handleY = rect.bottom - value * rect.height;
    
    handleElement.style.bottom = `${rect.bottom - handleY}px`;
    
    // Update input value
    this.inputs.touch.throttle.value = value;
  }
  
  /**
   * Initialize gamepad controls
   */
  initGamepad() {
    // Check for gamepad support
    if (navigator.getGamepads) {
      // Add gamepad polling
      this.gamepadPolling = setInterval(() => this.pollGamepads(), 16);
    }
  }
  
  /**
   * Poll for gamepad input
   */
  pollGamepads() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    
    // Find the first connected gamepad
    let activeGamepad = null;
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i] && gamepads[i].connected) {
        activeGamepad = gamepads[i];
        break;
      }
    }
    
    // No active gamepad
    if (!activeGamepad) {
      this.inputs.gamepad.active = false;
      return;
    }
    
    // Apply deadzone to avoid drift
    const applyDeadzone = (value, deadzone = 0.05) => {
      return Math.abs(value) < deadzone ? 0 : value;
    };
    
    // Update gamepad state
    this.inputs.gamepad.active = true;
    
    // Left stick (roll/pitch)
    this.inputs.gamepad.leftStick.x = applyDeadzone(activeGamepad.axes[0]);
    this.inputs.gamepad.leftStick.y = applyDeadzone(activeGamepad.axes[1]);
    
    // Right stick (yaw/throttle or camera)
    this.inputs.gamepad.rightStick.x = applyDeadzone(activeGamepad.axes[2]);
    this.inputs.gamepad.rightStick.y = applyDeadzone(activeGamepad.axes[3]);
    
    // Triggers (throttle)
    this.inputs.gamepad.triggers.left = activeGamepad.buttons[6] ? activeGamepad.buttons[6].value : 0;
    this.inputs.gamepad.triggers.right = activeGamepad.buttons[7] ? activeGamepad.buttons[7].value : 0;
    
    // Set active input mode if there's significant input
    if (Math.abs(this.inputs.gamepad.leftStick.x) > 0.1 || 
        Math.abs(this.inputs.gamepad.leftStick.y) > 0.1 ||
        Math.abs(this.inputs.gamepad.rightStick.x) > 0.1 ||
        Math.abs(this.inputs.gamepad.rightStick.y) > 0.1 ||
        this.inputs.gamepad.triggers.left > 0.1 ||
        this.inputs.gamepad.triggers.right > 0.1) {
      this.config.mode = 'gamepad';
    }
  }
  
  /**
   * Process all inputs and update flight controls
   */
  update(deltaTime) {
    // Get raw input values based on active mode
    let rawControls = { pitch: 0, roll: 0, yaw: 0, throttle: null };
    
    switch (this.config.mode) {
      case 'keyboard':
        rawControls = this.processKeyboardInput();
        break;
      case 'mouse':
        rawControls = this.processMouseInput();
        break;
      case 'touch':
        rawControls = this.processTouchInput();
        break;
      case 'gamepad':
        rawControls = this.processGamepadInput();
        break;
    }
    
    // Apply smoothing to controls
    this.smoothControls(rawControls, deltaTime);
    
    // Apply controls to flight model
    this.applyControls();
  }
  
  /**
   * Process keyboard inputs
   */
  processKeyboardInput() {
    const { keyboard } = this.inputs;
    const result = { pitch: 0, roll: 0, yaw: 0, throttle: null };
    
    // Pitch control
    if (keyboard.pitchUp) result.pitch -= 1.0;
    if (keyboard.pitchDown) result.pitch += 1.0;
    
    // Roll control
    if (keyboard.rollLeft) result.roll -= 1.0;
    if (keyboard.rollRight) result.roll += 1.0;
    
    // Yaw control
    if (keyboard.yawLeft) result.yaw -= 1.0;
    if (keyboard.yawRight) result.yaw += 1.0;
    
    // Throttle control (increment/decrement)
    if (keyboard.throttleUp) {
      result.throttle = this.smoothedControls.throttle + 0.5 * deltaTime;
    } else if (keyboard.throttleDown) {
      result.throttle = this.smoothedControls.throttle - 0.5 * deltaTime;
    }
    
    // Quick center controls
    if (keyboard.quickCenter) {
      result.pitch = 0;
      result.roll = 0;
      result.yaw = 0;
    }
    
    return result;
  }
  
  /**
   * Process mouse inputs
   */
  processMouseInput() {
    const { mouse } = this.inputs;
    const result = { pitch: 0, roll: a: 0, yaw: 0, throttle: null };
    
    if (!mouse.active) return result;
    
    // Mouse controls pitch and roll
    result.pitch = mouse.y;
    result.roll = mouse.x;
    
    // Use keyboard for other controls during mouse mode
    const { keyboard } = this.inputs;
    
    // Yaw control
    if (keyboard.yawLeft) result.yaw -= 1.0;
    if (keyboard.yawRight) result.yaw += 1.0;
    
    // Throttle control
    if (keyboard.throttleUp) {
      result.throttle = this.smoothedControls.throttle + 0.5 * deltaTime;
    } else if (keyboard.throttleDown) {
      result.throttle = this.smoothedControls.throttle - 0.5 * deltaTime;
    }
    
    return result;
  }
  
  /**
   * Process touch inputs
   */
  processTouchInput() {
    const { touch } = this.inputs;
    const result = { pitch: 0, roll: 0, yaw: 0, throttle: null };
    
    if (!touch.active) return result;
    
    if (this.config.touch.dualJoysticks) {
      // Dual joystick mode
      // Left joystick controls pitch and roll
      result.pitch = touch.leftJoystick.y;
      result.roll = touch.leftJoystick.x;
      
      // Right joystick controls yaw and throttle
      result.yaw = touch.rightJoystick.x;
      
      // Vertical axis of right joystick or dedicated throttle
      if (touch.throttle.touching) {
        result.throttle = touch.throttle.value;
      } else {
        // Use right joystick vertical for throttle
        // Map from -1,1 to 0,1
        result.throttle = (1 - touch.rightJoystick.y) / 2;
      }
    } else {
      // Single joystick mode
      // Left joystick controls pitch and roll
      result.pitch = touch.leftJoystick.y;
      result.roll = touch.leftJoystick.x;
      
      // Use touch position on screen for yaw
      if (touch.leftJoystick.touching) {
        // Calculate yaw from roll with reduced sensitivity
        result.yaw = touch.leftJoystick.x * 0.3;
      }
      
      // Dedicated throttle
      if (touch.throttle.touching) {
        result.throttle = touch.throttle.value;
      }
    }
    
    return result;
  }
  
  /**
   * Process gamepad inputs
   */
  processGamepadInput() {
    const { gamepad } = this.inputs;
    const result = { pitch: 0, roll: 0, yaw: 0, throttle: null };
    
    if (!gamepad.active) return result;
    
    // Left stick controls pitch and roll
    result.pitch = gamepad.leftStick.y;
    result.roll = gamepad.leftStick.x;
    
    // Right stick X controls yaw
    result.yaw = gamepad.rightStick.x;
    
    // Triggers control throttle
    // Right trigger increases, left trigger decreases
    const throttleDelta = gamepad.triggers.right - gamepad.triggers.left;
    
    if (Math.abs(throttleDelta) > 0.05) {
      result.throttle = this.smoothedControls.throttle + throttleDelta * 0.5 * deltaTime;
    }
    
    return result;
  }
  
  /**
   * Apply smoothing to raw control inputs
   */
  smoothControls(rawControls, deltaTime) {
    // Calculate smooth factor based on delta time
    const getSmoothFactor = (smoothing) => {
      return Math.pow(smoothing, deltaTime * 60);
    };
    
    // Smooth pitch
    if (rawControls.pitch !== null) {
      const smoothFactor = getSmoothFactor(this.smoothing.pitch);
      this.smoothedControls.pitch = this.smoothedControls.pitch * smoothFactor + 
        rawControls.pitch * (1 - smoothFactor);
    }
    
    // Smooth roll
    if (rawControls.roll !== null) {
      const smoothFactor = getSmoothFactor(this.smoothing.roll);
      this.smoothedControls.roll = this.smoothedControls.roll * smoothFactor + 
        rawControls.roll * (1 - smoothFactor);
    }
    
    // Smooth yaw
    if (rawControls.yaw !== null) {
      const smoothFactor = getSmoothFactor(this.smoothing.yaw);
      this.smoothedControls.yaw = this.smoothedControls.yaw * smoothFactor + 
        rawControls.yaw * (1 - smoothFactor);
    }
    
    // Handle throttle specially - no smoothing on direct throttle settings
    if (rawControls.throttle !== null) {
      // Direct throttle setting
      this.smoothedControls.throttle = Math.max(0, Math.min(1, rawControls.throttle));
    }
  }
  
  /**
   * Apply processed controls to flight model
   */
  applyControls() {
    // Apply sensitivity
    const { sensitivity } = this.config;
    
    // Apply pitch
    this.flightModel.state.pitch = this.smoothedControls.pitch * sensitivity.pitch;
    
    // Apply roll
    this.flightModel.state.roll = this.smoothedControls.roll * sensitivity.roll;
    
    // Apply yaw
    this.flightModel.state.yaw = this.smoothedControls.yaw * sensitivity.yaw;
    
    // Apply throttle
    this.flightModel.state.throttle = this.smoothedControls.throttle;
  }
  
  /**
   * Configure input settings
   */
  configureInput(settings) {
    // Merge with existing config
    Object.assign(this.config, settings);
    
    // Update UI if needed
    if (this.config.mode === 'touch') {
      this.updateTouchInterface();
    }
  }
  
  /**
   * Update touch interface based on current config
   */
  updateTouchInterface() {
    // Show/hide elements based on config
    const rightJoystick = document.getElementById('touch-right-joystick');
    const throttleSlider = document.getElementById('touch-throttle');
    
    if (rightJoystick && throttleSlider) {
      if (this.config.touch.dualJoysticks) {
        rightJoystick.style.display = 'block';
        throttleSlider.style.display = 'block';
      } else {
        rightJoystick.style.display = 'none';
        throttleSlider.style.display = 'block';
      }
    }
  }
}

/**
 * Generates turbulence and wind effects for realistic flight
 */
export class TurbulenceGenerator {
  constructor(flightModel) {
    this.flightModel = flightModel;
    
    // Simplex noise instance for turbulence
    this.noise = new SimplexNoise();
    
    // Turbulence state
    this.turbulence = {
      // Time-varying offsets for noise functions
      timeOffset: 0,
      
      // Current turbulence effect
      effect: new Vector3(0, 0, 0),
      
      // Cached values
      cachedIntensity: 0,
      
      // Frequency settings
      frequency: {
        x: 0.2,  // Roll turbulence frequency
        y: 0.3,  // Pitch turbulence frequency
        z: 0.15  // Yaw turbulence frequency
      },
      
      // Amplitude settings
      amplitude: {
        x: 1.0,  // Roll turbulence strength
        y: 0.7,  // Pitch turbulence strength
        z: 0.5   // Yaw turbulence strength
      }
    };
  }
  
  /**
   * Update turbulence effects
   */
  update(deltaTime) {
    // Update time offset for noise
    this.turbulence.timeOffset += deltaTime;
    
    // Get current turbulence intensity from flight model
    const intensity = this.flightModel.state.turbulenceIntensity;
    
    // Skip calculation if no turbulence or intensity hasn't changed
    if (intensity <= 0 || (intensity === this.turbulence.cachedIntensity && 
                          this.turbulence.effect.length() > 0)) {
      return;
    }
    
    // Update cached intensity
    this.turbulence.cachedIntensity = intensity;
    
    // Calculate new turbulence effect
    this.calculateTurbulenceEffect();
  }
  
  /**
   * Calculate the current turbulence effect
   */
  calculateTurbulenceEffect() {
    const { timeOffset, frequency, amplitude } = this.turbulence;
    const intensity = this.flightModel.state.turbulenceIntensity;
    
    // Use 3D simplex noise with different offsets for each axis
    const xNoise = this.noise.noise3d(
      timeOffset * frequency.x,
      0.5,
      0.1
    );
    
    const yNoise = this.noise.noise3d(
      0.1,
      timeOffset * frequency.y,
      0.5
    );
    
    const zNoise = this.noise.noise3d(
      0.7,
      0.3,
      timeOffset * frequency.z
    );
    
    // Apply to turbulence effect vector
    this.turbulence.effect.set(
      xNoise * amplitude.x * intensity,
      yNoise * amplitude.y * intensity,
      zNoise * amplitude.z * intensity
    );
  }
  
  /**
   * Get current turbulence effect
   */
  getTurbulenceEffect() {
    return this.turbulence.effect;
  }
  
  /**
   * Configure turbulence settings
   */
  configureTurbulence(settings) {
    if (settings.frequency) {
      Object.assign(this.turbulence.frequency, settings.frequency);
    }
    
    if (settings.amplitude) {
      Object.assign(this.turbulence.amplitude, settings.amplitude);
    }
  }
}

// SimplexNoise implementation (simplified for this example)
class SimplexNoise {
  constructor() {
    this.p = new Uint8Array(256);
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    
    const p = this.p;
    
    // Initialize with values 0..255
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }
    
    // Randomize the permutation table
    let n;
    let q;
    for (let i = 255; i > 0; i--) {
      n = Math.floor((i + 1) * Math.random());
      q = p[i];
      p[i] = p[n];
      p[n] = q;
    }
    
    // Extend permutation tables
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }
  
  // Simplified 3D simplex noise
  noise3d(x, y, z) {
    // Simple noise approximation
    const nx = Math.sin(x * 1.5);
    const ny = Math.sin(y * 1.5 + 1.3);
    const nz = Math.sin(z * 1.5 + 2.7);
    
    return (nx + ny + nz) / 3;
  }
}

// Usage Example:
/*
// Create flight model with default settings
const flightModel = new FlightModel();

// Set aircraft type
flightModel.setAircraftType('spitfire');

// Set environment conditions
flightModel.setEnvironment({
  windVector: new THREE.Vector3(5, 0, 2),
  turbulenceIntensity: 0.3
});

// In your game loop
function gameLoop(deltaTime) {
  // Update flight model
  flightModel.update(deltaTime);
  
  // Get current state for rendering
  const state = flightModel.getState();
  
  // Apply state to your aircraft model
  aircraft.position.copy(state.position);
  aircraft.quaternion.copy(state.quaternion);
  
  // Update HUD with flight data
  updateHUD({
    airspeed: Math.round(state.airspeed * 1.94384), // m/s to knots
    altitude: Math.round(state.altitude * 3.28084), // m to feet
    heading: Math.round(state.heading),
    verticalSpeed: Math.round(state.verticalSpeed * 196.85), // m/s to ft/min
    stallWarning: state.stallWarning
  });
}
*/