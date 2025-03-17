import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import io from 'socket.io-client';

import { NetworkManager } from '../networking/NetworkManager';
import { Renderer } from '../rendering/Renderer';
import { Camera } from '../rendering/Camera';
import { Player } from './Player';
import { World } from './World';
import { FlightModel } from '../physics/FlightModel';

/**
 * Main game class responsible for managing the game loop,
 * scene, physics, networking, and rendering
 */
export class Game {
  constructor(containerId, options = {}) {
    // DOM container
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container with id "${containerId}" not found`);
    }
    
    // Game options with defaults
    this.options = {
      serverUrl: options.serverUrl || 'http://localhost:3000',
      walletAddress: options.walletAddress || null,
      username: options.username || 'Player',
      model: options.model || 'default',
      roomId: options.roomId || 'default',
      debug: options.debug || false,
      ...options
    };
    
    // Game state
    this.isRunning = false;
    this.clock = new THREE.Clock();
    this.deltaTime = 0;
    this.elapsedTime = 0;
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    
    // Player data
    this.playerId = null;
    this.players = new Map();
    
    // Game objects
    this.projectiles = new Map();
    
    // Initialize components
    this.initThree();
    this.initManagers();
    this.initEventListeners();
    
    // Debug mode setup
    if (this.options.debug) {
      this.initDebugTools();
    }
  }
  
  /**
   * Initialize Three.js components
   */
  initThree() {
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
    this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.0005);
    
    // Create renderer
    this.renderer = new Renderer(this.container);
    
    // Create camera
    this.camera = new Camera(this.container);
    this.scene.add(this.camera.object);
    
    // Add lighting
    this.addLighting();
    
    // Create asset loaders
    this.gltfLoader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();
    
    // Create world
    this.world = new World(this.scene, this.textureLoader);
  }
  
  /**
   * Initialize game managers
   */
  initManagers() {
    // Initialize network manager
    this.networkManager = new NetworkManager(this.options.serverUrl);
    this.networkManager.onConnect = this.handleConnect.bind(this);
    this.networkManager.onDisconnect = this.handleDisconnect.bind(this);
    this.networkManager.onGameInit = this.handleGameInit.bind(this);
    this.networkManager.onPlayerJoined = this.handlePlayerJoined.bind(this);
    this.networkManager.onPlayerLeft = this.handlePlayerLeft.bind(this);
    this.networkManager.onPlayerMoved = this.handlePlayerMoved.bind(this);
    this.networkManager.onProjectile = this.handleProjectile.bind(this);
    this.networkManager.onRemoveProjectile = this.handleRemoveProjectile.bind(this);
    this.networkManager.onPlayerHit = this.handlePlayerHit.bind(this);
    this.networkManager.onPlayerDefeated = this.handlePlayerDefeated.bind(this);
    this.networkManager.onPlayerRespawned = this.handlePlayerRespawned.bind(this);
    
    // Initialize flight model
    this.flightModel = new FlightModel();
  }
  
  /**
   * Add scene lighting
   */
  addLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    // Directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(100, 100, 50);
    directionalLight.castShadow = true;
    
    // Configure shadows
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    
    this.scene.add(directionalLight);
    this.directionalLight = directionalLight;
  }
  
  /**
   * Initialize debug tools
   */
  initDebugTools() {
    // Add orbit controls for debug camera
    this.controls = new OrbitControls(this.camera.object, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    
    // Add axes helper
    const axesHelper = new THREE.AxesHelper(5);
    this.scene.add(axesHelper);
    
    // Add stats display
    this.statsElement = document.createElement('div');
    this.statsElement.className = 'game-stats';
    this.statsElement.style.position = 'absolute';
    this.statsElement.style.top = '10px';
    this.statsElement.style.left = '10px';
    this.statsElement.style.color = 'white';
    this.statsElement.style.fontFamily = 'monospace';
    this.statsElement.style.fontSize = '12px';
    this.statsElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    this.statsElement.style.padding = '5px';
    this.statsElement.style.borderRadius = '3px';
    this.container.appendChild(this.statsElement);
  }
  
  /**
   * Initialize event listeners
   */
  initEventListeners() {
    // Resize handler
    window.addEventListener('resize', this.handleResize.bind(this));
    
    // Keyboard controls
    this.keys = {};
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      
      // Handle special keys
      if (e.code === 'Space') {
        this.shoot();
      }
    });
    
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    
    // Mouse controls for plane orientation
    this.mouse = new THREE.Vector2();
    this.isMouseDown = false;
    
    this.container.addEventListener('mousemove', (e) => {
      // Calculate normalized mouse coordinates
      const rect = this.container.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / this.container.clientWidth) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / this.container.clientHeight) * 2 + 1;
      
      // Use mouse for plane banking when not in debug mode
      if (!this.options.debug && this.localPlayer) {
        // Map mouse X position to roll
        this.localPlayer.setRoll(this.mouse.x * 0.5);
      }
    });
    
    this.container.addEventListener('mousedown', () => {
      this.isMouseDown = true;
    });
    
    this.container.addEventListener('mouseup', () => {
      this.isMouseDown = false;
    });
    
    // Mobile touch controls
    this.touchController = {
      active: false,
      startPosition: new THREE.Vector2(),
      currentPosition: new THREE.Vector2(),
      delta: new THREE.Vector2()
    };
    
    this.container.addEventListener('touchstart', (e) => {
      e.preventDefault();
      
      if (e.touches.length === 1) {
        this.touchController.active = true;
        this.touchController.startPosition.set(
          e.touches[0].clientX,
          e.touches[0].clientY
        );
        this.touchController.currentPosition.copy(this.touchController.startPosition);
        this.touchController.delta.set(0, 0);
      }
    });
    
    this.container.addEventListener('touchmove', (e) => {
      e.preventDefault();
      
      if (this.touchController.active && e.touches.length === 1) {
        this.touchController.currentPosition.set(
          e.touches[0].clientX,
          e.touches[0].clientY
        );
        
        this.touchController.delta.set(
          (this.touchController.currentPosition.x - this.touchController.startPosition.x) / 100,
          (this.touchController.currentPosition.y - this.touchController.startPosition.y) / 100
        );
      }
    });
    
    this.container.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.touchController.active = false;
      this.touchController.delta.set(0, 0);
    });
  }
  
  /**
   * Handle window resize
   */
  handleResize() {
    this.camera.resize();
    this.renderer.resize();
  }
  
  /**
   * Start the game
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.clock.start();
    
    // Connect to server
    this.networkManager.connect({
      username: this.options.username,
      model: this.options.model,
      roomId: this.options.roomId,
      walletAddress: this.options.walletAddress
    });
    
    // Start animation loop
    this.animate();
    
    console.log('Game started');
  }
  
  /**
   * Stop the game
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.clock.stop();
    
    // Disconnect from server
    this.networkManager.disconnect();
    
    console.log('Game stopped');
  }
  
  /**
   * Animation loop
   */
  animate() {
    if (!this.isRunning) return;
    
    // Request next frame
    requestAnimationFrame(this.animate.bind(this));
    
    // Calculate delta time
    this.deltaTime = this.clock.getDelta();
    this.elapsedTime = this.clock.getElapsedTime();
    
    // Update FPS counter
    this.frameCount++;
    if (this.elapsedTime - this.lastFpsUpdate >= 1) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsUpdate = this.elapsedTime;
      
      // Update debug stats
      if (this.options.debug) {
        this.updateDebugStats();
      }
    }
    
    // Update player controls
    this.updateControls();
    
    // Update physics
    this.updatePhysics();
    
    // Update camera
    this.updateCamera();
    
    // Update world
    this.world.update(this.deltaTime, this.elapsedTime);
    
    // Update projectiles
    this.updateProjectiles();
    
    // Update debug controls
    if (this.options.debug && this.controls) {
      this.controls.update();
    }
    
    // Render scene
    this.renderer.render(this.scene, this.camera.object);
  }
  
  /**
   * Update player controls based on input
   */
  updateControls() {
    if (!this.localPlayer) return;
    
    // Default control values
    let throttle = 0;  // Forward/backward
    let roll = 0;      // Roll left/right
    let pitch = 0;     // Pitch up/down
    let yaw = 0;       // Yaw left/right
    
    // Process keyboard inputs
    if (this.keys['KeyW'] || this.keys['ArrowUp']) {
      throttle += 1;
    }
    
    if (this.keys['KeyS'] || this.keys['ArrowDown']) {
      throttle -= 0.5;
    }
    
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
      yaw -= 1;
    }
    
    if (this.keys['KeyD'] || this.keys['ArrowRight']) {
      yaw += 1;
    }
    
    if (this.keys['KeyQ']) {
      roll -= 1;
    }
    
    if (this.keys['KeyE']) {
      roll += 1;
    }
    
    if (this.keys['KeyR']) {
      pitch -= 1;  // Pitch up
    }
    
    if (this.keys['KeyF']) {
      pitch += 1;  // Pitch down
    }
    
    // Process touch inputs for mobile
    if (this.touchController.active) {
      // Throttle is always positive on mobile for simplicity
      throttle = 1;
      
      // Use touch delta for control surfaces
      yaw = this.touchController.delta.x * 2;
      pitch = this.touchController.delta.y * 2;
      
      // Roll based on yaw for coordinated turns
      roll = yaw * 0.5;
    }
    
    // Apply controls to flight model
    this.flightModel.setControls(throttle, roll, pitch, yaw);
    
    // Update flight physics
    const position = this.localPlayer.getPosition();
    const rotation = this.localPlayer.getRotation();
    const velocity = this.localPlayer.getVelocity();
    
    // Calculate new physics state
    const physics = this.flightModel.update(
      position, 
      rotation, 
      velocity, 
      this.deltaTime
    );
    
    // Apply updated physics to player
    this.localPlayer.setPosition(physics.position);
    this.localPlayer.setRotation(physics.rotation);
    this.localPlayer.setVelocity(physics.velocity);
    
    // Send position update to server
    this.networkManager.sendPositionUpdate({
      position: physics.position,
      rotation: physics.rotation,
      velocity: physics.velocity
    });
  }
  
  /**
   * Update physics for all game objects
   */
  updatePhysics() {
    // Apply world physics (like gravity, wind, etc.)
    // Update other players' positions with interpolation
    for (const player of this.players.values()) {
      if (player.id !== this.playerId) {
        player.update(this.deltaTime);
      }
    }
  }
  
  /**
   * Update camera position and orientation
   */
  updateCamera() {
    if (!this.localPlayer) return;
    
    if (!this.options.debug) {
      // Follow local player
      this.camera.follow(
        this.localPlayer.getObject(),
        this.localPlayer.getVelocity(),
        this.deltaTime
      );
    }
  }
  
  /**
   * Update projectiles
   */
  updateProjectiles() {
    for (const [id, projectile] of this.projectiles) {
      // Update projectile position
      projectile.position.add(projectile.velocity.clone().multiplyScalar(this.deltaTime));
      projectile.object.position.copy(projectile.position);
      
      // Check lifetime
      projectile.lifetime -= this.deltaTime;
      
      // Remove expired projectiles
      if (projectile.lifetime <= 0) {
        this.scene.remove(projectile.object);
        this.projectiles.delete(id);
      }
    }
  }
  
  /**
   * Update debug stats display
   */
  updateDebugStats() {
    if (!this.statsElement) return;
    
    let stats = `FPS: ${this.fps}\n`;
    
    if (this.localPlayer) {
      const pos = this.localPlayer.getPosition();
      const rot = this.localPlayer.getRotation();
      const vel = this.localPlayer.getVelocity();
      
      stats += `Position: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}\n`;
      stats += `Rotation: ${(rot.x * THREE.MathUtils.RAD2DEG).toFixed(1)}°, ${(rot.y * THREE.MathUtils.RAD2DEG).toFixed(1)}°, ${(rot.z * THREE.MathUtils.RAD2DEG).toFixed(1)}°\n`;
      stats += `Speed: ${vel.length().toFixed(1)} m/s\n`;
      stats += `Players: ${this.players.size}\n`;
      stats += `Projectiles: ${this.projectiles.size}\n`;
    }
    
    this.statsElement.textContent = stats;
  }
  
  /**
   * Fire a projectile
   */
  shoot() {
    if (!this.localPlayer) return;
    
    // Create projectile
    const position = this.localPlayer.getPosition().clone();
    const direction = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.localPlayer.getObject().quaternion)
      .normalize();
    
    // Offset position to start from the front of the plane
    position.add(direction.clone().multiplyScalar(2));
    
    // Create velocity vector based on player's direction and speed
    const velocity = direction.clone().multiplyScalar(100);
    
    // Send to server
    this.networkManager.sendAction('shoot', {
      position: position,
      velocity: velocity
    });
  }
  
  /**
   * Network event handlers
   */
  handleConnect() {
    console.log('Connected to server');
  }
  
  handleDisconnect() {
    console.log('Disconnected from server');
  }
  
  handleGameInit(data) {
    console.log('Game initialized', data);
    
    // Store player ID
    this.playerId = data.playerId;
    
    // Initialize world
    this.world.initialize(data.worldData);
    
    // Create local player
    this.createLocalPlayer(data.players.find(p => p.id === this.playerId));
    
    // Create other players
    for (const playerData of data.players) {
      if (playerData.id !== this.playerId) {
        this.createRemotePlayer(playerData);
      }
    }
    
    // Emit game ready event
    const event = new CustomEvent('game:ready', { detail: { playerId: this.playerId } });
    window.dispatchEvent(event);
  }
  
  handlePlayerJoined(playerData) {
    console.log('Player joined', playerData);
    this.createRemotePlayer(playerData);
  }
  
  handlePlayerLeft(data) {
    console.log('Player left', data);
    
    // Remove player from scene
    const player = this.players.get(data.id);
    if (player) {
      this.scene.remove(player.getObject());
      this.players.delete(data.id);
    }
  }
  
  handlePlayerMoved(data) {
    // Update remote player position
    const player = this.players.get(data.id);
    if (player) {
      player.setTargetPosition(data.position);
      player.setTargetRotation(data.rotation);
      player.setVelocity(data.velocity);
    }
  }
  
  handleProjectile(data) {
    // Create visual projectile
    const geometry = new THREE.SphereGeometry(0.2, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sphere = new THREE.Mesh(geometry, material);
    
    // Set initial position
    sphere.position.copy(data.position);
    
    // Add to scene
    this.scene.add(sphere);
    
    // Add to projectiles map
    this.projectiles.set(data.id, {
      id: data.id,
      ownerId: data.ownerId,
      position: new THREE.Vector3().copy(data.position),
      velocity: new THREE.Vector3().copy(data.velocity),
      object: sphere,
      lifetime: 5 // 5 seconds lifetime
    });
  }
  
  handleRemoveProjectile(data) {
    // Remove projectile from scene
    const projectile = this.projectiles.get(data.id);
    if (projectile) {
      this.scene.remove(projectile.object);
      this.projectiles.delete(data.id);
    }
  }
  
  handlePlayerHit(data) {
    // Visual feedback for hit
    const player = this.players.get(data.id);
    if (player) {
      // Update health
      player.setHealth(data.health);
      
      // Create hit effect
      this.createHitEffect(player.getPosition());
    }
    
    // If local player was hit, add screen effect
    if (data.id === this.playerId) {
      // Add damage overlay
      this.camera.addDamageEffect(data.damage);
      
      // Update UI health
      const event = new CustomEvent('game:healthChanged', { 
        detail: { health: data.health }
      });
      window.dispatchEvent(event);
    }
  }
  
  handlePlayerDefeated(data) {
    const player = this.players.get(data.id);
    if (player) {
      // Create explosion effect
      this.createExplosionEffect(player.getPosition());
      
      // Hide player model temporarily
      player.setVisible(false);
    }
    
    // If local player was defeated
    if (data.id === this.playerId) {
      // Show defeat screen
      const event = new CustomEvent('game:playerDefeated', {
        detail: { attackerId: data.attackerId }
      });
      window.dispatchEvent(event);
    }
    
    // If player defeated someone else
    if (data.attackerId === this.playerId) {
      // Show victory notification
      const event = new CustomEvent('game:playerVictory', {
        detail: { defeatedId: data.id }
      });
      window.dispatchEvent(event);
    }
  }
  
  handlePlayerRespawned(data) {
    const player = this.players.get(data.id);
    if (player) {
      // Update position
      player.setPosition(data.position);
      
      // Reset health
      player.setHealth(data.health);
      
      // Make visible again
      player.setVisible(true);
    }
    
    // If local player respawned
    if (data.id === this.playerId) {
      // Update UI
      const event = new CustomEvent('game:playerRespawned', {
        detail: { position: data.position, health: data.health }
      });
      window.dispatchEvent(event);
    }
  }
  
  /**
   * Create local player
   */
  createLocalPlayer(playerData) {
    const player = new Player(playerData.id, playerData.model, {
      isLocal: true,
      username: playerData.username
    });
    
    // Add to scene
    this.scene.add(player.getObject());
    
    // Set initial position
    player.setPosition(playerData.position);
    player.setRotation(playerData.rotation);
    
    // Store player
    this.players.set(playerData.id, player);
    this.localPlayer = player;
    
    return player;
  }
  
  /**
   * Create remote player
   */
  createRemotePlayer(playerData) {
    const player = new Player(playerData.id, playerData.model, {
      isLocal: false,
      username: playerData.username
    });
    
    // Add to scene
    this.scene.add(player.getObject());
    
    // Set initial position
    player.setPosition(playerData.position);
    player.setRotation(playerData.rotation);
    
    // Store player
    this.players.set(playerData.id, player);
    
    return player;
  }
  
  /**
   * Create hit effect
   */
  createHitEffect(position) {
    // Create spark particles
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    
    for (let i = 0; i < particleCount; i++) {
      vertices.push(
        position.x + (Math.random() - 0.5) * 2,
        position.y + (Math.random() - 0.5) * 2,
        position.z + (Math.random() - 0.5) * 2
      );
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    
    const material = new THREE.PointsMaterial({
      color: 0xffff00,
      size: 0.5,
      blending: THREE.AdditiveBlending
    });
    
    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);
    
    // Remove after animation
    setTimeout(() => {
      this.scene.remove(particles);
    }, 1000);
  }
  
  /**
   * Create explosion effect
   */
  createExplosionEffect(position) {
    // Create explosion particles
    const particleCount = 50;
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    
    for (let i = 0; i < particleCount; i++) {
      vertices.push(
        position.x, position.y, position.z
      );
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    
    const material = new THREE.PointsMaterial({
      color: 0xff5500,
      size: 1.5,
      blending: THREE.AdditiveBlending
    });
    
    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);
    
    // Animate explosion
    const velocities = [];
    for (let i = 0; i < particleCount; i++) {
      velocities.push(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
      );
    }
    
    // Animation loop
    let animationId;
    const animate = () => {
      const positions = particles.geometry.attributes.position.array;
      
      for (let i = 0; i < particleCount; i++) {
        const idx = i * 3;
        
        positions[idx] += velocities[idx] * 0.01;
        positions[idx + 1] += velocities[idx + 1] * 0.01;
        positions[idx + 2] += velocities[idx + 2] * 0.01;
      }
      
      particles.geometry.attributes.position.needsUpdate = true;
      
      animationId = requestAnimationFrame(animate);
    };
    
    animate();
    
    // Remove after animation
    setTimeout(() => {
      cancelAnimationFrame(animationId);
      this.scene.remove(particles);
    }, 2000);
  }
}