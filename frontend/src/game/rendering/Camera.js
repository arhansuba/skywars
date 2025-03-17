import * as THREE from 'three';
import { GameSettings } from '../core/GameSettings';

/**
 * Manages camera system for SkyWars with multiple view modes
 * optimized for flight gameplay
 */
export class Camera {
  constructor(container) {
    this.container = container;
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    
    // Camera modes
    this.CAMERA_MODES = {
      COCKPIT: 'cockpit',
      CHASE: 'chase',
      CINEMATIC: 'cinematic',
      ORBITAL: 'orbital',
      TACTICAL: 'tactical'
    };
    
    // Default to chase camera
    this.currentMode = GameSettings.get('defaultCameraMode') || this.CAMERA_MODES.CHASE;
    
    // Camera positioning parameters
    this.offset = {
      [this.CAMERA_MODES.COCKPIT]: new THREE.Vector3(0, 0.15, 0),
      [this.CAMERA_MODES.CHASE]: new THREE.Vector3(0, 2, -8),
      [this.CAMERA_MODES.CINEMATIC]: new THREE.Vector3(5, 2, -10),
      [this.CAMERA_MODES.ORBITAL]: new THREE.Vector3(0, 15, 0),
      [this.CAMERA_MODES.TACTICAL]: new THREE.Vector3(0, 50, 0)
    };
    
    // Camera smoothing parameters (lower = more responsive)
    this.positionLerp = {
      [this.CAMERA_MODES.COCKPIT]: 1.0, // Immediate
      [this.CAMERA_MODES.CHASE]: 0.05,
      [this.CAMERA_MODES.CINEMATIC]: 0.02,
      [this.CAMERA_MODES.ORBITAL]: 0.1,
      [this.CAMERA_MODES.TACTICAL]: 0.1
    };
    
    this.rotationLerp = {
      [this.CAMERA_MODES.COCKPIT]: 1.0, // Immediate
      [this.CAMERA_MODES.CHASE]: 0.1,
      [this.CAMERA_MODES.CINEMATIC]: 0.03,
      [this.CAMERA_MODES.ORBITAL]: 0.05,
      [this.CAMERA_MODES.TACTICAL]: 0.2
    };
    
    this.initCamera();
    
    // Handle window resize
    window.addEventListener('resize', this.onResize.bind(this));
  }
  
  /**
   * Initialize the camera system
   */
  initCamera() {
    // Main perspective camera
    this.camera = new THREE.PerspectiveCamera(
      GameSettings.get('fieldOfView') || 75,
      this.width / this.height,
      0.1, // Near clipping plane
      50000 // Far clipping plane for horizon visibility
    );
    
    // Set initial position
    this.camera.position.set(0, 10, 0);
    
    // For cockpit view - head movement simulation
    this.cockpitOffset = new THREE.Vector3(0, 0, 0);
    
    // For shake effects (turbulence, damage)
    this.shakeIntensity = 0;
    this.shakeDecay = 0.9;
    this.shakeOffset = new THREE.Vector3();
    
    // For cinematic camera movement
    this.cinematicPath = null;
    this.cinematicPathTime = 0;
    
    // For tactical view targets
    this.targetPosition = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();
  }
  
  /**
   * Handle window resize events
   */
  onResize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }
  
  /**
   * Switch between camera modes
   */
  setMode(mode) {
    if (Object.values(this.CAMERA_MODES).includes(mode)) {
      this.currentMode = mode;
      
      // Update FOV based on camera mode
      switch (mode) {
        case this.CAMERA_MODES.COCKPIT:
          this.camera.fov = GameSettings.get('cockpitFOV') || 85;
          break;
        case this.CAMERA_MODES.CHASE:
          this.camera.fov = GameSettings.get('chaseFOV') || 75;
          break;
        case this.CAMERA_MODES.CINEMATIC:
          this.camera.fov = GameSettings.get('cinematicFOV') || 60;
          break;
        case this.CAMERA_MODES.ORBITAL:
          this.camera.fov = GameSettings.get('orbitalFOV') || 70;
          break;
        case this.CAMERA_MODES.TACTICAL:
          this.camera.fov = GameSettings.get('tacticalFOV') || 50;
          break;
      }
      
      this.camera.updateProjectionMatrix();
      
      // Reset any active effects
      this.resetShake();
      
      return true;
    }
    
    console.warn(`Invalid camera mode: ${mode}`);
    return false;
  }
  
  /**
   * Get current camera mode
   */
  getMode() {
    return this.currentMode;
  }
  
  /**
   * Apply camera shake effect (for turbulence, damage, explosions)
   */
  shake(intensity, duration = 1.0) {
    this.shakeIntensity = Math.min(intensity, 1.0);
    this.shakeDecay = Math.pow(0.01, 1.0 / (60.0 * duration)); // 60fps target
  }
  
  /**
   * Reset camera shake effect
   */
  resetShake() {
    this.shakeIntensity = 0;
    this.shakeOffset.set(0, 0, 0);
  }
  
  /**
   * Set a cinematic camera path
   */
  setCinematicPath(path, duration = 10) {
    this.cinematicPath = path;
    this.cinematicPathDuration = duration;
    this.cinematicPathTime = 0;
  }
  
  /**
   * Update camera position and rotation based on target aircraft
   */
  update(deltaTime, targetAircraft) {
    if (!targetAircraft) return;
    
    // Get target transform
    const targetPosition = targetAircraft.getWorldPosition();
    const targetQuaternion = targetAircraft.getWorldQuaternion();
    const targetMatrix = targetAircraft.getWorldMatrix();
    
    // Store target info for other systems
    this.targetPosition.copy(targetPosition);
    this.targetQuaternion.copy(targetQuaternion);
    
    // Handle different camera modes
    switch (this.currentMode) {
      case this.CAMERA_MODES.COCKPIT:
        this.updateCockpitCamera(targetMatrix, deltaTime);
        break;
      case this.CAMERA_MODES.CHASE:
        this.updateChaseCamera(targetPosition, targetQuaternion, deltaTime);
        break;
      case this.CAMERA_MODES.CINEMATIC:
        this.updateCinematicCamera(targetPosition, targetQuaternion, deltaTime);
        break;
      case this.CAMERA_MODES.ORBITAL:
        this.updateOrbitalCamera(targetPosition, deltaTime);
        break;
      case this.CAMERA_MODES.TACTICAL:
        this.updateTacticalCamera(targetPosition, deltaTime);
        break;
    }
    
    // Apply camera shake if active
    this.updateShake(deltaTime);
  }
  
  /**
   * Update cockpit camera (first-person view)
   */
  updateCockpitCamera(targetMatrix, deltaTime) {
    // Extract position and orientation from target matrix
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    targetMatrix.decompose(position, quaternion, scale);
    
    // Apply cockpit offset in aircraft's local space
    const offsetVector = this.offset[this.CAMERA_MODES.COCKPIT].clone();
    
    // Simulate head movement based on aircraft acceleration
    if (GameSettings.get('cockpitHeadEffects')) {
      // Get velocity and acceleration from aircraft physics
      // This is a simplified version - actual implementation would use physics data
      const accelX = Math.sin(Date.now() * 0.001) * 0.02;
      const accelY = Math.cos(Date.now() * 0.0007) * 0.01;
      
      // Apply opposing movement to simulate g-forces
      this.cockpitOffset.x = THREE.MathUtils.lerp(this.cockpitOffset.x, -accelX, 0.1);
      this.cockpitOffset.y = THREE.MathUtils.lerp(this.cockpitOffset.y, -accelY, 0.1);
      
      offsetVector.add(this.cockpitOffset);
    }
    
    // Apply offset to cockpit position
    offsetVector.applyQuaternion(quaternion);
    position.add(offsetVector);
    
    // Apply immediately for first-person view (no smoothing)
    this.camera.position.copy(position);
    this.camera.quaternion.copy(quaternion);
  }
  
  /**
   * Update chase camera (third-person view)
   */
  updateChaseCamera(targetPosition, targetQuaternion, deltaTime) {
    // Calculate desired camera position
    const offset = this.offset[this.CAMERA_MODES.CHASE].clone();
    offset.applyQuaternion(targetQuaternion);
    const desiredPosition = targetPosition.clone().add(offset);
    
    // Smoothly interpolate camera position
    this.camera.position.lerp(
      desiredPosition,
      1.0 - Math.pow(1.0 - this.positionLerp[this.CAMERA_MODES.CHASE], deltaTime * 60)
    );
    
    // Calculate look-at quaternion
    const lookAtQuaternion = new THREE.Quaternion();
    const lookAtMatrix = new THREE.Matrix4();
    lookAtMatrix.lookAt(
      this.camera.position,
      targetPosition,
      new THREE.Vector3(0, 1, 0)
    );
    lookAtQuaternion.setFromRotationMatrix(lookAtMatrix);
    
    // Smoothly interpolate camera rotation
    this.camera.quaternion.slerp(
      lookAtQuaternion,
      1.0 - Math.pow(1.0 - this.rotationLerp[this.CAMERA_MODES.CHASE], deltaTime * 60)
    );
  }
  
  /**
   * Update cinematic camera (dramatic angles, path following)
   */
  updateCinematicCamera(targetPosition, targetQuaternion, deltaTime) {
    // If following a cinematic path
    if (this.cinematicPath) {
      this.cinematicPathTime += deltaTime;
      
      // Ensure path time is within duration
      const t = Math.min(this.cinematicPathTime / this.cinematicPathDuration, 1.0);
      
      if (t >= 1.0) {
        // Path completed, return to chase camera
        this.cinematicPath = null;
        this.setMode(this.CAMERA_MODES.CHASE);
      } else {
        // Get position along the path
        const pathPosition = this.cinematicPath.getPointAt(t);
        this.camera.position.copy(pathPosition);
        
        // Look at target
        this.camera.lookAt(targetPosition);
        return;
      }
    }
    
    // Default cinematic behavior if no path is set
    // Calculate a dynamic offset position that orbits the aircraft
    const time = Date.now() * 0.001;
    const orbitRadius = 12;
    const orbitHeight = 3;
    const orbitSpeed = 0.2;
    
    const offset = new THREE.Vector3(
      Math.sin(time * orbitSpeed) * orbitRadius,
      orbitHeight,
      Math.cos(time * orbitSpeed) * orbitRadius
    );
    
    // Apply target rotation influence (partial)
    const rotatedOffset = offset.clone();
    rotatedOffset.applyQuaternion(targetQuaternion);
    
    // Blend between orbit offset and rotated offset
    offset.lerp(rotatedOffset, 0.3);
    
    const desiredPosition = targetPosition.clone().add(offset);
    
    // Smoothly move camera
    this.camera.position.lerp(
      desiredPosition,
      1.0 - Math.pow(1.0 - this.positionLerp[this.CAMERA_MODES.CINEMATIC], deltaTime * 60)
    );
    
    // Look at target with forward vector offset
    const lookAtPosition = targetPosition.clone();
    const forwardVector = new THREE.Vector3(0, 0, -1).applyQuaternion(targetQuaternion).multiplyScalar(5);
    lookAtPosition.add(forwardVector);
    
    // Create look-at quaternion
    const lookAtQuaternion = new THREE.Quaternion();
    const lookAtMatrix = new THREE.Matrix4();
    lookAtMatrix.lookAt(
      this.camera.position,
      lookAtPosition,
      new THREE.Vector3(0, 1, 0)
    );
    lookAtQuaternion.setFromRotationMatrix(lookAtMatrix);
    
    // Smooth rotation
    this.camera.quaternion.slerp(
      lookAtQuaternion,
      1.0 - Math.pow(1.0 - this.rotationLerp[this.CAMERA_MODES.CINEMATIC], deltaTime * 60)
    );
  }
  
  /**
   * Update orbital camera (circling the target)
   */
  updateOrbitalCamera(targetPosition, deltaTime) {
    // Calculate orbital position
    const time = Date.now() * 0.0003; // Slower rotation
    const radius = this.offset[this.CAMERA_MODES.ORBITAL].z || 15;
    const height = this.offset[this.CAMERA_MODES.ORBITAL].y || 15;
    
    const desiredPosition = new THREE.Vector3(
      targetPosition.x + Math.sin(time) * radius,
      targetPosition.y + height,
      targetPosition.z + Math.cos(time) * radius
    );
    
    // Smooth position transition
    this.camera.position.lerp(
      desiredPosition,
      1.0 - Math.pow(1.0 - this.positionLerp[this.CAMERA_MODES.ORBITAL], deltaTime * 60)
    );
    
    // Look at target
    this.camera.lookAt(targetPosition);
  }
  
  /**
   * Update tactical camera (top-down view)
   */
  updateTacticalCamera(targetPosition, deltaTime) {
    // Calculate desired position (high above the target)
    const offset = this.offset[this.CAMERA_MODES.TACTICAL].clone();
    const desiredPosition = targetPosition.clone().add(offset);
    
    // Smooth position transition
    this.camera.position.lerp(
      desiredPosition,
      1.0 - Math.pow(1.0 - this.positionLerp[this.CAMERA_MODES.TACTICAL], deltaTime * 60)
    );
    
    // Look directly down
    const lookDirection = new THREE.Vector3(0, -1, 0.001); // Slight offset to avoid gimbal lock
    
    // Create look-at quaternion
    const lookAtQuaternion = new THREE.Quaternion();
    const lookAtMatrix = new THREE.Matrix4();
    lookAtMatrix.lookAt(
      this.camera.position,
      targetPosition,
      new THREE.Vector3(0, 0, -1) // Use forward vector as up to get proper orientation
    );
    lookAtQuaternion.setFromRotationMatrix(lookAtMatrix);
    
    // Smooth rotation
    this.camera.quaternion.slerp(
      lookAtQuaternion,
      1.0 - Math.pow(1.0 - this.rotationLerp[this.CAMERA_MODES.TACTICAL], deltaTime * 60)
    );
  }
  
  /**
   * Update shake effect
   */
  updateShake(deltaTime) {
    if (this.shakeIntensity > 0.001) {
      // Calculate random offset based on intensity
      this.shakeOffset.set(
        (Math.random() - 0.5) * this.shakeIntensity * 0.3,
        (Math.random() - 0.5) * this.shakeIntensity * 0.3,
        (Math.random() - 0.5) * this.shakeIntensity * 0.3
      );
      
      // Apply to camera position
      this.camera.position.add(this.shakeOffset);
      
      // Decay shake intensity
      this.shakeIntensity *= this.shakeDecay;
      
      if (this.shakeIntensity < 0.001) {
        this.shakeIntensity = 0;
      }
    }
  }
  
  /**
   * Set camera field of view
   */
  setFOV(fov) {
    this.camera.fov = THREE.MathUtils.clamp(fov, 40, 120);
    this.camera.updateProjectionMatrix();
  }
  
  /**
   * Get the THREE.js camera
   */
  getCamera() {
    return this.camera;
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    window.removeEventListener('resize', this.onResize.bind(this));
  }
}