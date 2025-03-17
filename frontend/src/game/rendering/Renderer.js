// SkyWars Game - Three.js Scene Implementation
// This module handles all 3D rendering aspects of the game including
// sky environment, terrain, camera controls, and aircraft models

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

export class GameRenderer {
  constructor(container, gameState) {
    // Store reference to the game state for accessing data
    this.gameState = gameState;
    
    // Initialize core Three.js components
    this.initScene();
    this.initCamera();
    this.initRenderer(container);
    
    // Initialize game environment
    this.createSkyEnvironment();
    this.createTerrain();
    this.createWater();
    
    // Initialize aircraft model
    this.loadAircraftModel();
    
    // Setup camera controls
    this.setupFlightCamera();
    
    // Add event listeners
    this.addEventListeners();
    
    // Setup animation loop
    this.clock = new THREE.Clock();
    this.animate();
  }
  
  // Initialize the Three.js scene
  initScene() {
    this.scene = new THREE.Scene();
    
    // Add fog for distance culling and atmospheric effect
    this.scene.fog = new THREE.FogExp2(0xc8e0ff, 0.0015);
    
    // Setup lighting
    this.setupLighting();
  }
  
  // Setup various light sources for the scene
  setupLighting() {
    // Main directional light (sun)
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sunLight.position.set(0, 100, 0);
    this.sunLight.castShadow = true;
    
    // Configure shadow properties for better quality
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 500;
    this.sunLight.shadow.camera.left = -100;
    this.sunLight.shadow.camera.right = 100;
    this.sunLight.shadow.camera.top = 100;
    this.sunLight.shadow.camera.bottom = -100;
    this.scene.add(this.sunLight);
    
    // Ambient light for global illumination
    this.ambientLight = new THREE.AmbientLight(0x404050, 0.5);
    this.scene.add(this.ambientLight);
    
    // Hemisphere light for sky/ground color variation
    this.hemisphereLight = new THREE.HemisphereLight(0x7cc7ff, 0x274510, 0.5);
    this.scene.add(this.hemisphereLight);
  }
  
  // Initialize the camera
  initCamera() {
    // Perspective camera with reasonable FoV for flight games
    this.camera = new THREE.PerspectiveCamera(
      70, // Field of view
      window.innerWidth / window.innerHeight, // Aspect ratio
      0.1, // Near clipping plane
      20000 // Far clipping plane (set far for terrain visibility)
    );
    
    // Initial camera position
    this.camera.position.set(0, 100, 0);
    
    // Camera group for easier control during flight
    this.cameraGroup = new THREE.Group();
    this.cameraGroup.add(this.camera);
    this.scene.add(this.cameraGroup);
  }
  
  // Initialize the renderer
  initRenderer(container) {
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      logarithmicDepthBuffer: true // Helps with z-fighting in large scenes
    });
    
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.5;
    
    // Add renderer to DOM
    container.appendChild(this.renderer.domElement);
  }
  
  // Set up sky environment with dynamic time of day
  createSkyEnvironment() {
    // Sky instance from Three.js examples
    this.sky = new Sky();
    this.sky.scale.setScalar(10000);
    this.scene.add(this.sky);
    
    // Sun position parameters
    this.skyParams = {
      turbidity: 10,
      rayleigh: 2,
      mieCoefficient: 0.005,
      mieDirectionalG: 0.8,
      elevation: 45, // sun elevation angle
      azimuth: 180,  // sun azimuth angle
      exposure: 0.25
    };
    
    this.updateSky();
  }
  
  // Update sky based on parameters
  updateSky() {
    const uniforms = this.sky.material.uniforms;
    uniforms['turbidity'].value = this.skyParams.turbidity;
    uniforms['rayleigh'].value = this.skyParams.rayleigh;
    uniforms['mieCoefficient'].value = this.skyParams.mieCoefficient;
    uniforms['mieDirectionalG'].value = this.skyParams.mieDirectionalG;
    
    // Calculate sun position from elevation and azimuth
    const phi = THREE.MathUtils.degToRad(90 - this.skyParams.elevation);
    const theta = THREE.MathUtils.degToRad(this.skyParams.azimuth);
    
    const sunPosition = new THREE.Vector3();
    sunPosition.setFromSphericalCoords(1, phi, theta);
    uniforms['sunPosition'].value.copy(sunPosition);
    
    // Update directional light to match sun position
    this.sunLight.position.copy(sunPosition.multiplyScalar(100));
    
    // Update renderer exposure
    this.renderer.toneMappingExposure = this.skyParams.exposure;
  }
  
  // Create procedural terrain using simplex noise
  createTerrain() {
    // Terrain generation parameters
    const terrainSize = 10000; // Size of the terrain
    const resolution = 256;    // Resolution of the terrain grid
    const heightScale = 500;   // Maximum height of the terrain
    
    // Create terrain geometry
    const geometry = new THREE.PlaneGeometry(
      terrainSize, 
      terrainSize, 
      resolution - 1, 
      resolution - 1
    );
    
    // Rotate to make it horizontal (x-z plane)
    geometry.rotateX(-Math.PI / 2);
    
    // Initialize noise generator
    const noise = new SimplexNoise();
    
    // Generate heightmap using multiple octaves of noise
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      
      // Multi-octave noise for more natural-looking terrain
      let elevation = 0;
      elevation += noise.noise(x * 0.0005, z * 0.0005) * 0.5;
      elevation += noise.noise(x * 0.001, z * 0.001) * 0.25;
      elevation += noise.noise(x * 0.002, z * 0.002) * 0.125;
      elevation += noise.noise(x * 0.004, z * 0.004) * 0.0625;
      
      // Apply height with non-linear mapping for more interesting terrain
      vertices[i + 1] = Math.pow(Math.abs(elevation), 1.2) * heightScale * Math.sign(elevation);
    }
    
    // Update normals for lighting
    geometry.computeVertexNormals();
    
    // Create terrain material with different regions based on height
    const terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.1
    });
    
    // Add vertex colors based on height and slope
    const colors = [];
    const terrainColors = {
      deepWater: new THREE.Color(0x0077be),
      shallowWater: new THREE.Color(0x39a0ed),
      sand: new THREE.Color(0xe0c782),
      grass: new THREE.Color(0x549e3f),
      forest: new THREE.Color(0x276221),
      rock: new THREE.Color(0x706b66),
      snow: new THREE.Color(0xf8f8ff)
    };
    
    // Get position data for calculating colors
    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal.array;
    
    // Calculate vertex colors based on height and slope
    for (let i = 0; i < positions.length; i += 3) {
      const height = positions[i + 1];
      
      // Get the normal for slope calculation
      const nx = normals[i];
      const ny = normals[i + 1];
      const nz = normals[i + 2];
      
      // Calculate steepness (0 = flat, 1 = vertical)
      const steepness = 1 - ny;
      
      // Choose color based on height and steepness
      let color = new THREE.Color();
      
      if (height < -50) {
        color.copy(terrainColors.deepWater);
      } else if (height < 0) {
        color.lerpColors(terrainColors.deepWater, terrainColors.shallowWater, (height + 50) / 50);
      } else if (height < 20) {
        color.lerpColors(terrainColors.shallowWater, terrainColors.sand, height / 20);
      } else if (height < 100) {
        color.lerpColors(terrainColors.sand, terrainColors.grass, (height - 20) / 80);
      } else if (height < 250) {
        color.lerpColors(terrainColors.grass, terrainColors.forest, (height - 100) / 150);
      } else if (height < 400) {
        color.lerpColors(terrainColors.forest, terrainColors.rock, (height - 250) / 150);
      } else {
        color.lerpColors(terrainColors.rock, terrainColors.snow, Math.min((height - 400) / 100, 1));
      }
      
      // Make steep areas more rocky
      if (steepness > 0.3 && height > 0) {
        color.lerp(terrainColors.rock, Math.min(steepness, 1));
      }
      
      colors.push(color.r, color.g, color.b);
    }
    
    // Add colors to geometry
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    // Create terrain mesh
    this.terrain = new THREE.Mesh(geometry, terrainMaterial);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }
  
  // Create water for the terrain
  createWater() {
    // Water geometry (positioned at sea level)
    const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
    
    // Create water from Three.js examples
    this.water = new Water(waterGeometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: new THREE.TextureLoader().load(
        'textures/waternormals.jpg',
        function (texture) {
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        }
      ),
      sunDirection: new THREE.Vector3(0, 1, 0),
      sunColor: 0xffffff,
      waterColor: 0x001e0f,
      distortionScale: 3.7,
      fog: this.scene.fog !== undefined
    });
    
    // Rotate water to horizontal position
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -10; // Slightly below sea level
    this.scene.add(this.water);
  }
  
  // Setup camera controls optimized for flight
  setupFlightCamera() {
    // Create a targets object for camera to follow
    this.cameraTarget = new THREE.Object3D();
    this.scene.add(this.cameraTarget);
    
    // Camera parameters for flight
    this.cameraParams = {
      mode: 'follow',     // 'follow', 'cockpit', 'free'
      distance: 30,       // Distance behind aircraft in follow mode
      height: 10,         // Height above aircraft in follow mode
      smoothing: 0.05,    // Camera movement smoothing (0-1)
      lookAhead: 2.0,     // How far ahead to look (multiplier)
      roll: true,         // Whether camera rolls with the aircraft
      rollAmount: 0.4,    // Amount of roll applied (0-1)
    };
    
    // Debug controls for development (can be removed in production)
    this.debugControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.debugControls.enabled = false; // Disabled by default
    
    // Method to toggle debug mode
    this.setDebugMode = (enabled) => {
      this.debugControls.enabled = enabled;
    };
  }
  
  // Load aircraft model with GLTF loader
  loadAircraftModel() {
    // Create aircraft container
    this.aircraft = new THREE.Group();
    this.scene.add(this.aircraft);
    
    // Set initial position
    this.aircraft.position.set(0, 100, 0);
    
    const loader = new GLTFLoader();
    
    // Load the aircraft model
    loader.load(
      'models/aircraft/cessna.glb', // Replace with your model path
      (gltf) => {
        // Store the model
        this.aircraftModel = gltf.scene;
        this.aircraft.add(this.aircraftModel);
        
        // Apply shadows to all meshes
        this.aircraftModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        
        // Find animated parts for later use
        this.propeller = this.aircraftModel.getObjectByName('propeller');
        this.aileron_left = this.aircraftModel.getObjectByName('aileron_left');
        this.aileron_right = this.aircraftModel.getObjectByName('aileron_right');
        this.elevator = this.aircraftModel.getObjectByName('elevator');
        this.rudder = this.aircraftModel.getObjectByName('rudder');
        
        // Scale the model appropriately
        this.aircraftModel.scale.set(1, 1, 1);
        
        // Position the camera target at aircraft
        this.cameraTarget.position.copy(this.aircraft.position);
      },
      // Progress callback
      (xhr) => {
        console.log(`Aircraft model: ${(xhr.loaded / xhr.total) * 100}% loaded`);
      },
      // Error callback
      (error) => {
        console.error('Error loading aircraft model:', error);
        
        // Create a simple fallback aircraft if model fails to load
        this.createFallbackAircraft();
      }
    );
  }
  
  // Create a simple aircraft model as fallback
  createFallbackAircraft() {
    // Fuselage
    const fuselageGeometry = new THREE.CylinderGeometry(1, 1, 10, 8);
    fuselageGeometry.rotateZ(Math.PI / 2);
    const fuselageMaterial = new THREE.MeshPhongMaterial({ color: 0xcccccc });
    const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
    
    // Wings
    const wingGeometry = new THREE.BoxGeometry(1, 10, 2);
    const wingMaterial = new THREE.MeshPhongMaterial({ color: 0xaaaaaa });
    const wings = new THREE.Mesh(wingGeometry, wingMaterial);
    wings.position.set(0, 0, 0);
    
    // Tail
    const tailGeometry = new THREE.BoxGeometry(0.5, 4, 1);
    const tailMaterial = new THREE.MeshPhongMaterial({ color: 0xaaaaaa });
    const tail = new THREE.Mesh(tailGeometry, tailMaterial);
    tail.position.set(-4.5, 0, 0);
    
    // Vertical stabilizer
    const vstabGeometry = new THREE.BoxGeometry(2, 1, 3);
    const vstabMaterial = new THREE.MeshPhongMaterial({ color: 0xaaaaaa });
    const vstab = new THREE.Mesh(vstabGeometry, vstabMaterial);
    vstab.position.set(-4.5, 0, 1.5);
    
    // Propeller
    const propGeometry = new THREE.BoxGeometry(0.2, 7, 0.5);
    const propMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
    this.propeller = new THREE.Mesh(propGeometry, propMaterial);
    this.propeller.position.set(5, 0, 0);
    
    // Create control surfaces for animation
    const aileronGeometry = new THREE.BoxGeometry(0.3, 3, 0.3);
    const aileronMaterial = new THREE.MeshPhongMaterial({ color: 0x999999 });
    this.aileron_left = new THREE.Mesh(aileronGeometry, aileronMaterial);
    this.aileron_left.position.set(0, -4, 0);
    
    this.aileron_right = new THREE.Mesh(aileronGeometry, aileronMaterial);
    this.aileron_right.position.set(0, 4, 0);
    
    const elevatorGeometry = new THREE.BoxGeometry(1, 4, 0.3);
    const elevatorMaterial = new THREE.MeshPhongMaterial({ color: 0x999999 });
    this.elevator = new THREE.Mesh(elevatorGeometry, elevatorMaterial);
    this.elevator.position.set(-5.5, 0, 0);
    
    const rudderGeometry = new THREE.BoxGeometry(1, 0.3, 2);
    const rudderMaterial = new THREE.MeshPhongMaterial({ color: 0x999999 });
    this.rudder = new THREE.Mesh(rudderGeometry, rudderMaterial);
    this.rudder.position.set(-5, 0, 2);
    
    // Add all parts to aircraft
    this.aircraftModel = new THREE.Group();
    this.aircraftModel.add(fuselage);
    this.aircraftModel.add(wings);
    this.aircraftModel.add(tail);
    this.aircraftModel.add(vstab);
    this.aircraftModel.add(this.propeller);
    this.aircraftModel.add(this.aileron_left);
    this.aircraftModel.add(this.aileron_right);
    this.aircraftModel.add(this.elevator);
    this.aircraftModel.add(this.rudder);
    
    // Add to aircraft container
    this.aircraft.add(this.aircraftModel);
    
    // Apply shadows
    this.aircraftModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }
  
  // Update aircraft position and rotation based on physics
  updateAircraft(deltaTime) {
    // This would be replaced with actual physics from the game state
    // For this example, we'll create some sample movement
    
    // Get control inputs (would come from game inputs)
    const controls = {
      throttle: 0.75,     // 0 to 1
      pitch: 0.1,         // -1 to 1
      roll: 0.0,          // -1 to 1
      yaw: 0.0            // -1 to 1
    };
    
    // Simple flight model
    const speed = 50 * controls.throttle;
    
    // Create movement vector in aircraft's forward direction
    const movement = new THREE.Vector3(0, 0, -1).applyQuaternion(this.aircraft.quaternion);
    movement.multiplyScalar(speed * deltaTime);
    
    // Apply movement
    this.aircraft.position.add(movement);
    
    // Apply rotation based on controls
    const pitchAmount = controls.pitch * 1.0 * deltaTime;
    const rollAmount = controls.roll * 2.0 * deltaTime;
    const yawAmount = controls.yaw * 0.5 * deltaTime;
    
    // Create a rotation quaternion
    const rotationDelta = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(
        pitchAmount,  // Pitch (X)
        yawAmount,    // Yaw (Y)
        rollAmount,   // Roll (Z)
        'XYZ'
      ));
    
    // Apply rotation
    this.aircraft.quaternion.multiply(rotationDelta);
    
    // Animate propeller
    if (this.propeller) {
      this.propeller.rotation.x += 20 * controls.throttle * deltaTime;
    }
    
    // Animate control surfaces
    if (this.aileron_left && this.aileron_right) {
      this.aileron_left.rotation.x = -controls.roll * 0.5;
      this.aileron_right.rotation.x = controls.roll * 0.5;
    }
    
    if (this.elevator) {
      this.elevator.rotation.x = controls.pitch * 0.5;
    }
    
    if (this.rudder) {
      this.rudder.rotation.y = controls.yaw * 0.5;
    }
    
    // Update camera target to follow aircraft
    this.updateCameraTarget(deltaTime);
  }
  
  // Update camera target position for smooth following
  updateCameraTarget(deltaTime) {
    const smoothing = Math.pow(1 - this.cameraParams.smoothing, deltaTime * 60);
    
    // Move camera target toward aircraft
    this.cameraTarget.position.lerp(this.aircraft.position, smoothing);
    
    // Calculate forward vector for aircraft
    const aircraftForward = new THREE.Vector3(0, 0, -1);
    aircraftForward.applyQuaternion(this.aircraft.quaternion);
    
    // For look-ahead, add forward vector scaled by look-ahead factor
    const lookAheadTarget = this.aircraft.position.clone().add(
      aircraftForward.clone().multiplyScalar(this.cameraParams.lookAhead * 10)
    );
    
    // Make target look in direction of movement
    const targetPosition = new THREE.Vector3();
    targetPosition.copy(this.cameraTarget.position);
    
    // Update target rotation
    const lookAtPosition = lookAheadTarget;
    this.cameraTarget.lookAt(lookAtPosition);
    
    // Apply aircraft roll to camera if enabled
    if (this.cameraParams.roll) {
      // Extract roll angle from aircraft's quaternion
      const aircraftEuler = new THREE.Euler().setFromQuaternion(this.aircraft.quaternion);
      
      // Apply scaled roll to camera target
      const targetEuler = new THREE.Euler().setFromQuaternion(this.cameraTarget.quaternion);
      targetEuler.z = aircraftEuler.z * this.cameraParams.rollAmount;
      
      this.cameraTarget.quaternion.setFromEuler(targetEuler);
    }
  }
  
  // Update camera position based on mode
  updateCamera() {
    // Skip if debug controls are enabled
    if (this.debugControls && this.debugControls.enabled) {
      return;
    }
    
    switch (this.cameraParams.mode) {
      case 'follow':
        this.updateFollowCamera();
        break;
      case 'cockpit':
        this.updateCockpitCamera();
        break;
      case 'free':
        // Free camera is controlled by user, no updates needed
        break;
    }
  }
  
  // Update camera in follow mode
  updateFollowCamera() {
    // Calculate offset based on camera target's orientation
    const backward = new THREE.Vector3(0, 0, 1);
    backward.applyQuaternion(this.cameraTarget.quaternion);
    backward.multiplyScalar(this.cameraParams.distance);
    
    const upward = new THREE.Vector3(0, 1, 0);
    upward.applyQuaternion(this.cameraTarget.quaternion);
    upward.multiplyScalar(this.cameraParams.height);
    
    // Calculate desired camera position
    const desiredPosition = new THREE.Vector3();
    desiredPosition.copy(this.cameraTarget.position)
      .add(backward)
      .add(upward);
    
    // Update camera position
    this.camera.position.copy(desiredPosition);
    
    // Make camera look at aircraft with same roll as target
    this.camera.quaternion.copy(this.cameraTarget.quaternion);
  }
  
  // Update camera in cockpit mode
  updateCockpitCamera() {
    // Position camera at aircraft's position
    const cockpitOffset = new THREE.Vector3(0, 1.5, 0);
    cockpitOffset.applyQuaternion(this.aircraft.quaternion);
    
    const cockpitPosition = this.aircraft.position.clone().add(cockpitOffset);
    this.camera.position.copy(cockpitPosition);
    
    // Set rotation to match aircraft
    this.camera.quaternion.copy(this.aircraft.quaternion);
  }
  
  // Add event listeners for window resize, etc.
  addEventListeners() {
    window.addEventListener('resize', this.onWindowResize.bind(this));
    
    // Add keyboard events for camera switching
    window.addEventListener('keydown', (event) => {
      // Number keys for camera modes
      if (event.key === '1') {
        this.cameraParams.mode = 'follow';
      } else if (event.key === '2') {
        this.cameraParams.mode = 'cockpit';
      } else if (event.key === '3') {
        this.cameraParams.mode = 'free';
        this.setDebugMode(true);
      }
      
      // Toggle debug mode with 'D' key
      if (event.key === 'd' || event.key === 'D') {
        this.setDebugMode(!this.debugControls.enabled);
      }
      
      // Day/night cycle with 'L' key
      if (event.key === 'l' || event.key === 'L') {
        // Cycle through time of day
        this.skyParams.elevation = (this.skyParams.elevation + 30) % 180;
        this.updateSky();
      }
    });
  }
  
  // Handle window resize
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  
  // Animation loop
  animate() {
    requestAnimationFrame(this.animate.bind(this));
    
    const deltaTime = this.clock.getDelta();
    
    // Update water if present
    if (this.water) {
      this.water.material.uniforms['time'].value += deltaTime;
    }
    
    // Update aircraft position and rotation
    if (this.aircraft) {
      this.updateAircraft(deltaTime);
    }
    
    // Update camera
    this.updateCamera();
    
    // Render scene
    this.renderer.render(this.scene, this.camera);
  }
  
  // Public method to update time of day
  setTimeOfDay(timePercent) {
    // 0% = midnight, 25% = sunrise, 50% = noon, 75% = sunset, 100% = midnight
    this.skyParams.elevation = timePercent < 50 
      ? timePercent * 3.6 // 0 to 180 degrees (rising)
      : (100 - timePercent) * 3.6; // 180 to 0 degrees (setting)
      
    // Update sky colors based on time
    if (timePercent < 25) { // Night to sunrise
      const t = timePercent / 25;
      this.skyParams.rayleigh = 1 + t;
      this.skyParams.turbidity = 5 + t * 5;
      this.skyParams.mieCoefficient = 0.005 + t * 0.005;
    } else if (timePercent < 50) { // Sunrise to noon
      const t = (timePercent - 25) / 25;
      this.skyParams.rayleigh = 2;
      this.skyParams.turbidity = 10;
      this.skyParams.mieCoefficient = 0.01 - t * 0.005;
    } else if (timePercent < 75) { // Noon to sunset
      const t = (timePercent - 50) / 25;
      this.skyParams.rayleigh = 2;
      this.skyParams.turbidity = 10;
      this.skyParams.mieCoefficient = 0.005 + t * 0.005;
    } else { // Sunset to night
      const t = (timePercent - 75) / 25;
      this.skyParams.rayleigh = 2 - t;
      this.skyParams.turbidity = 10 - t * 5;
      this.skyParams.mieCoefficient = 0.01 - t * 0.005;
    }
    
    this.updateSky();
  }
  
  // Public method to get current camera mode
  getCameraMode() {
    return this.cameraParams.mode;
  }
  
  // Public method to set camera mode
  setCameraMode(mode) {
    if (['follow', 'cockpit', 'free'].includes(mode)) {
      this.cameraParams.mode = mode;
      this.setDebugMode(mode === 'free');
    }
  }
  
  // Method to set aircraft position (for teleporting or respawning)
  setAircraftPosition(position, rotation) {
    if (this.aircraft) {
      this.aircraft.position.copy(position);
      
      if (rotation) {
        this.aircraft.quaternion.copy(rotation);
      }
      
      // Reset camera target to match new position
      this.cameraTarget.position.copy(position);
    }
  }
}

// Usage example:
/*
// Create the renderer when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('game-container');
  
  // Create a mock game state for testing
  const gameState = {
    // Add necessary game state properties
  };
  
  // Initialize the renderer
  const renderer = new GameRenderer(container, gameState);
  
  // Example of setting time of day (0-100)
  // 0 = midnight, 25 = sunrise, 50 = noon, 75 = sunset
  renderer.setTimeOfDay(35); // Morning
  
  // Set camera mode ('follow', 'cockpit', 'free')
  renderer.setCameraMode('follow');
});
*/