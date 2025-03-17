import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { TAARenderPass } from 'three/examples/jsm/postprocessing/TAARenderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { GameSettings } from '../core/GameSettings';

// Custom shaders
import { MotionBlurShader } from '../shaders/MotionBlurShader';
import { SkyShader } from '../shaders/SkyShader';
import { VolumetricCloudShader } from '../shaders/VolumetricCloudShader';
import { DepthOfFieldShader } from '../shaders/DepthOfFieldShader';

/**
 * Manages post-processing effects for SkyWars
 * Optimized for flight game visuals
 */
export class Effects {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    
    // Get reference to the main composer
    this.composer = renderer.composer;
    
    // Render targets for various effects
    this.renderTargets = {};
    
    // Active effects
    this.activeEffects = {};
    
    // Weather and environment conditions
    this.environmentConditions = {
      fogDensity: 0.0,
      cloudDensity: 0.3,
      precipitation: 0.0,
      lightningProbability: 0.0,
      windSpeed: 0.0
    };
    
    // Initialize post-processing effects
    this.initEffects();
    
    // Apply initial quality settings
    this.applyQualitySettings(GameSettings.get('effectsQuality'));
  }
  
  /**
   * Initialize post-processing effects
   */
  initEffects() {
    // Create basic render pass
    this.renderPass = new RenderPass(this.scene, this.camera.getCamera());
    this.composer.addPass(this.renderPass);
    
    // Initialize effect passes (but don't add them yet)
    this.initAntialiasing();
    this.initBloomPass();
    this.initSkyPass();
    this.initCloudPass();
    this.initDepthOfFieldPass();
    this.initMotionBlurPass();
    this.initSSAOPass();
    
    // Add final output pass
    this.outputPass = new ShaderPass(GammaCorrectionShader);
    this.outputPass.renderToScreen = true;
    this.composer.addPass(this.outputPass);
    
    // Initialize special effects
    this.initExplosionEffect();
    this.initTrailEffects();
    this.initWeatherEffects();
  }
  
  /**
   * Initialize antialiasing passes
   */
  initAntialiasing() {
    // FXAA pass (fast, less GPU intensive)
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.uniforms.resolution.value.set(
      1 / (this.renderer.width * this.renderer.pixelRatio),
      1 / (this.renderer.height * this.renderer.pixelRatio)
    );
    this.fxaaPass.enabled = false;
    
    // TAA pass (better quality but more expensive)
    this.taaPass = new TAARenderPass(this.scene, this.camera.getCamera());
    this.taaPass.sampleLevel = 1; // Default sample level
    this.taaPass.enabled = false;
    
    // Store antialiasing passes
    this.antialiasing = {
      none: null,
      fxaa: this.fxaaPass,
      taa: this.taaPass
    };
  }
  
  /**
   * Initialize bloom effect for highlights (sun glare, afterburners, etc.)
   */
  initBloomPass() {
    const bloomParams = {
      threshold: 0.85,
      strength: 0.7,
      radius: 0.3,
      exposure: 1.0
    };
    
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.renderer.width, this.renderer.height),
      bloomParams.strength,
      bloomParams.radius,
      bloomParams.threshold
    );
    
    this.bloomPass.enabled = false;
    this.activeEffects.bloom = false;
  }
  
  /**
   * Initialize sky rendering with atmospheric scattering
   */
  initSkyPass() {
    // Create sky shader pass
    this.skyPass = new ShaderPass(SkyShader);
    
    // Set sky parameters
    this.skyPass.uniforms.sunPosition.value = new THREE.Vector3(10000, 5000, 0);
    this.skyPass.uniforms.rayleigh.value = 1.0;
    this.skyPass.uniforms.turbidity.value = 10.0;
    this.skyPass.uniforms.mieCoefficient.value = 0.005;
    this.skyPass.uniforms.mieDirectionalG.value = 0.8;
    
    this.skyPass.enabled = false;
    this.activeEffects.sky = false;
  }
  
  /**
   * Initialize volumetric cloud rendering
   */
  initCloudPass() {
    // Create cloud render target
    this.renderTargets.clouds = new THREE.WebGLRenderTarget(
      this.renderer.width * 0.5, // Lower resolution for performance
      this.renderer.height * 0.5
    );
    
    // Create cloud shader pass
    this.cloudPass = new ShaderPass(VolumetricCloudShader);
    this.cloudPass.uniforms.tDepth.value = this.renderTargets.clouds.depthTexture;
    this.cloudPass.uniforms.cloudDensity.value = this.environmentConditions.cloudDensity;
    this.cloudPass.uniforms.cloudSpeed.value = this.environmentConditions.windSpeed;
    this.cloudPass.uniforms.time.value = 0;
    
    this.cloudPass.enabled = false;
    this.activeEffects.clouds = false;
  }
  
  /**
   * Initialize depth of field effect for distance blur
   */
  initDepthOfFieldPass() {
    // Create depth texture
    this.renderTargets.depth = new THREE.WebGLRenderTarget(
      this.renderer.width,
      this.renderer.height
    );
    this.renderTargets.depth.depthTexture = new THREE.DepthTexture();
    
    // Create DoF shader pass
    this.dofPass = new ShaderPass(DepthOfFieldShader);
    this.dofPass.uniforms.tDepth.value = this.renderTargets.depth.depthTexture;
    this.dofPass.uniforms.cameraNear.value = this.camera.getCamera().near;
    this.dofPass.uniforms.cameraFar.value = this.camera.getCamera().far;
    this.dofPass.uniforms.focusDistance.value = 100.0;
    this.dofPass.uniforms.focalLength.value = 150.0;
    this.dofPass.uniforms.fstop.value = 0.1;
    
    this.dofPass.enabled = false;
    this.activeEffects.depthOfField = false;
  }
  
  /**
   * Initialize motion blur for speed effect
   */
  initMotionBlurPass() {
    // Create motion blur shader pass
    this.motionBlurPass = new ShaderPass(MotionBlurShader);
    this.motionBlurPass.uniforms.velocityFactor.value = 0.5;
    this.motionBlurPass.uniforms.delta.value = 1.0 / 60.0; // Default for 60fps
    
    // Previous frame matrices for motion vector calculation
    this.prevViewMatrix = new THREE.Matrix4();
    this.prevProjectionMatrix = new THREE.Matrix4();
    this.prevProjectionViewMatrix = new THREE.Matrix4();
    
    this.motionBlurPass.enabled = false;
    this.activeEffects.motionBlur = false;
  }
  
  /**
   * Initialize ambient occlusion for improved depth perception
   */
  initSSAOPass() {
    this.ssaoPass = new SSAOPass(
      this.scene,
      this.camera.getCamera(),
      this.renderer.width,
      this.renderer.height
    );
    
    this.ssaoPass.kernelRadius = 16;
    this.ssaoPass.minDistance = 0.005;
    this.ssaoPass.maxDistance = 0.1;
    
    this.ssaoPass.enabled = false;
    this.activeEffects.ssao = false;
  }
  
  /**
   * Initialize explosion visual effects
   */
  initExplosionEffect() {
    // Set up render target for explosion effects
    this.renderTargets.explosion = new THREE.WebGLRenderTarget(
      this.renderer.width,
      this.renderer.height
    );
    
    // Explosion shader and particles will be implemented separately
    // This is just the setup for the render target
    
    this.activeEffects.explosions = false;
  }
  
  /**
   * Initialize trail effects (vapor, smoke)
   */
  initTrailEffects() {
    // Trail effects are primarily particle systems
    // This is a placeholder for the effect configuration
    
    this.activeEffects.trails = false;
  }
  
  /**
   * Initialize weather effects (rain, snow, fog)
   */
  initWeatherEffects() {
    // Weather effects combine shader effects and particle systems
    // This is a placeholder for the effect configuration
    
    this.activeEffects.weather = false;
  }
  
  /**
   * Apply quality presets to effects
   */
  applyQualitySettings(quality) {
    switch (quality) {
      case 'low':
        // Disable most effects for performance
        this.setAntialiasingMethod('fxaa');
        this.toggleEffect('bloom', true, { strength: 0.5, radius: 0.1 });
        this.toggleEffect('sky', true);
        this.toggleEffect('clouds', false);
        this.toggleEffect('depthOfField', false);
        this.toggleEffect('motionBlur', false);
        this.toggleEffect('ssao', false);
        this.toggleEffect('explosions', true);
        this.toggleEffect('trails', true);
        this.toggleEffect('weather', false);
        break;
        
      case 'medium':
        // Balance between performance and quality
        this.setAntialiasingMethod('fxaa');
        this.toggleEffect('bloom', true, { strength: 0.7, radius: 0.3 });
        this.toggleEffect('sky', true);
        this.toggleEffect('clouds', true, { resolution: 0.5 });
        this.toggleEffect('depthOfField', false);
        this.toggleEffect('motionBlur', true, { samples: 4 });
        this.toggleEffect('ssao', false);
        this.toggleEffect('explosions', true);
        this.toggleEffect('trails', true);
        this.toggleEffect('weather', true, { particleDensity: 0.5 });
        break;
        
      case 'high':
        // Higher quality with some performance considerations
        this.setAntialiasingMethod('taa');
        this.taaPass.sampleLevel = 2;
        this.toggleEffect('bloom', true, { strength: 0.8, radius: 0.4 });
        this.toggleEffect('sky', true);
        this.toggleEffect('clouds', true, { resolution: 0.75 });
        this.toggleEffect('depthOfField', true, { quality: 'medium' });
        this.toggleEffect('motionBlur', true, { samples: 6 });
        this.toggleEffect('ssao', true, { kernelSize: 8 });
        this.toggleEffect('explosions', true);
        this.toggleEffect('trails', true);
        this.toggleEffect('weather', true, { particleDensity: 0.8 });
        break;
        
      case 'ultra':
        // Maximum quality
        this.setAntialiasingMethod('taa');
        this.taaPass.sampleLevel = 3;
        this.toggleEffect('bloom', true, { strength: 1.0, radius: 0.5 });
        this.toggleEffect('sky', true);
        this.toggleEffect('clouds', true, { resolution: 1.0 });
        this.toggleEffect('depthOfField', true, { quality: 'high' });
        this.toggleEffect('motionBlur', true, { samples: 8 });
        this.toggleEffect('ssao', true, { kernelSize: 16 });
        this.toggleEffect('explosions', true);
        this.toggleEffect('trails', true);
        this.toggleEffect('weather', true, { particleDensity: 1.0 });
        break;
        
      default:
        console.warn(`Unknown quality preset: ${quality}`);
        this.applyQualitySettings('medium');
    }
  }
  
  /**
   * Set antialiasing method
   */
  setAntialiasingMethod(method) {
    // Disable all antialiasing passes first
    Object.values(this.antialiasing).forEach(pass => {
      if (pass) {
        pass.enabled = false;
        
        // Remove from composer if present
        const passIndex = this.composer.passes.indexOf(pass);
        if (passIndex > -1) {
          this.composer.passes.splice(passIndex, 1);
        }
      }
    });
    
    // Enable selected method
    const selectedPass = this.antialiasing[method];
    if (selectedPass) {
      selectedPass.enabled = true;
      
      // Insert after render pass
      this.composer.passes.splice(1, 0, selectedPass);
      
      // Update FXAA resolution if needed
      if (method === 'fxaa') {
        this.fxaaPass.uniforms.resolution.value.set(
          1 / (this.renderer.width * this.renderer.pixelRatio),
          1 / (this.renderer.height * this.renderer.pixelRatio)
        );
      }
    }
  }
  
  /**
   * Toggle an effect on/off with optional parameters
   */
  toggleEffect(effect, enabled, params = {}) {
    // Update active effects tracker
    this.activeEffects[effect] = enabled;
    
    switch (effect) {
      case 'bloom':
        if (enabled) {
          // Add bloom pass if not present
          if (!this.composer.passes.includes(this.bloomPass)) {
            this.composer.insertPass(this.bloomPass, this.composer.passes.length - 1);
          }
          
          // Update parameters if provided
          if (params.strength !== undefined) this.bloomPass.strength = params.strength;
          if (params.radius !== undefined) this.bloomPass.radius = params.radius;
          if (params.threshold !== undefined) this.bloomPass.threshold = params.threshold;
        }
        
        this.bloomPass.enabled = enabled;
        break;
        
      case 'sky':
        if (enabled) {
          // Add sky pass if not present
          if (!this.composer.passes.includes(this.skyPass)) {
            this.composer.insertPass(this.skyPass, this.composer.passes.length - 1);
          }
        }
        
        this.skyPass.enabled = enabled;
        break;
        
      case 'clouds':
        if (enabled) {
          // Add cloud pass if not present
          if (!this.composer.passes.includes(this.cloudPass)) {
            this.composer.insertPass(this.cloudPass, this.composer.passes.length - 1);
          }
          
          // Update cloud resolution if provided
          if (params.resolution !== undefined) {
            const width = this.renderer.width * params.resolution;
            const height = this.renderer.height * params.resolution;
            this.renderTargets.clouds.setSize(width, height);
          }
        }
        
        this.cloudPass.enabled = enabled;
        break;
        
      case 'depthOfField':
        if (enabled) {
          // Add DoF pass if not present
          if (!this.composer.passes.includes(this.dofPass)) {
            this.composer.insertPass(this.dofPass, this.composer.passes.length - 1);
          }
          
          // Update DoF quality if provided
          if (params.quality) {
            switch (params.quality) {
              case 'low':
                this.dofPass.uniforms.samples.value = 4;
                break;
              case 'medium':
                this.dofPass.uniforms.samples.value = 8;
                break;
              case 'high':
                this.dofPass.uniforms.samples.value = 16;
                break;
            }
          }
        }
        
        this.dofPass.enabled = enabled;
        break;
        
      case 'motionBlur':
        if (enabled) {
          // Add motion blur pass if not present
          if (!this.composer.passes.includes(this.motionBlurPass)) {
            this.composer.insertPass(this.motionBlurPass, this.composer.passes.length - 1);
          }
          
          // Update motion blur samples if provided
          if (params.samples !== undefined) {
            this.motionBlurPass.uniforms.samples.value = params.samples;
          }
        }
        
        this.motionBlurPass.enabled = enabled;
        break;
        
      case 'ssao':
        if (enabled) {
          // Add SSAO pass if not present
          if (!this.composer.passes.includes(this.ssaoPass)) {
            this.composer.insertPass(this.ssaoPass, 1); // Add early in the chain
          }
          
          // Update SSAO parameters if provided
          if (params.kernelSize !== undefined) {
            this.ssaoPass.kernelSize = params.kernelSize;
          }
        }
        
        this.ssaoPass.enabled = enabled;
        break;
        
      case 'explosions':
        // Explosion effects are mostly controlled via the game logic
        // This just toggles whether the effect processing is active
        break;
        
      case 'trails':
        // Trail effects are mostly controlled via the game logic
        // This just toggles whether the effect processing is active
        break;
        
      case 'weather':
        // Update weather particle density if provided
        if (params.particleDensity !== undefined) {
          // Apply to relevant weather systems
          // This is a placeholder for the actual implementation
        }
        break;
        
      default:
        console.warn(`Unknown effect: ${effect}`);
    }
  }
  
  /**
   * Update effect parameters based on game state
   */
  update(deltaTime, gameState = {}) {
    // Update time for time-based effects
    if (this.cloudPass.enabled) {
      this.cloudPass.uniforms.time.value += deltaTime;
    }
    
    // Update motion blur based on camera mode and aircraft speed
    if (this.activeEffects.motionBlur) {
      // Get camera and velocity info
      const camera = this.camera.getCamera();
      const cameraMode = this.camera.getMode();
      const aircraftSpeed = gameState.aircraft ? gameState.aircraft.speed : 0;
      
      // Store current projection matrix for next frame's motion vectors
      this.motionBlurPass.uniforms.prevProjectionViewMatrix.value.copy(this.prevProjectionViewMatrix);
      
      // Calculate current projection-view matrix
      this.prevProjectionViewMatrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      
      // Adjust motion blur strength based on speed and camera mode
      let velocityFactor = THREE.MathUtils.mapLinear(aircraftSpeed, 0, 2000, 0.1, 1.0);
      
      // Boost in chase camera mode, reduce in cockpit mode
      if (cameraMode === this.camera.CAMERA_MODES.CHASE) {
        velocityFactor *= 1.2;
      } else if (cameraMode === this.camera.CAMERA_MODES.COCKPIT) {
        velocityFactor *= 0.5;
      }
      
      this.motionBlurPass.uniforms.velocityFactor.value = velocityFactor;
      this.motionBlurPass.uniforms.delta.value = deltaTime;
    }
    
    // Update depth of field focus based on camera and game state
    if (this.activeEffects.depthOfField) {
      const camera = this.camera.getCamera();
      const cameraMode = this.camera.getMode();
      
      // Update DoF shader uniforms
      this.dofPass.uniforms.cameraNear.value = camera.near;
      this.dofPass.uniforms.cameraFar.value = camera.far;
      
      // Adjust focus distance based on camera mode
      if (cameraMode === this.camera.CAMERA_MODES.COCKPIT) {
        // In cockpit, focus on far objects
        this.dofPass.uniforms.focusDistance.value = 1000.0;
        this.dofPass.uniforms.focalLength.value = 60.0;
        this.dofPass.uniforms.fstop.value = 0.3; // More depth of field
      } else if (cameraMode === this.camera.CAMERA_MODES.CHASE) {
        // In chase camera, focus on the aircraft
        this.dofPass.uniforms.focusDistance.value = this.camera.offset[cameraMode].length();
        this.dofPass.uniforms.focalLength.value = 35.0;
        this.dofPass.uniforms.fstop.value = 0.15;
      } else if (cameraMode === this.camera.CAMERA_MODES.CINEMATIC) {
        // In cinematic, use shallow depth of field
        this.dofPass.uniforms.focusDistance.value = 
          gameState.aircraft ? gameState.aircraft.distanceToCamera : 10.0;
        this.dofPass.uniforms.focalLength.value = 85.0;
        this.dofPass.uniforms.fstop.value = 0.05; // Very shallow DoF
      }
    }
    
    // Update environment conditions based on game state
    this.updateEnvironmentConditions(gameState.environment);
  }
  
  /**
   * Update weather and environment visual effects
   */
  updateEnvironmentConditions(environment = {}) {
    // Update internal environment conditions
    if (environment.fogDensity !== undefined) {
      this.environmentConditions.fogDensity = environment.fogDensity;
    }
    
    if (environment.cloudDensity !== undefined) {
      this.environmentConditions.cloudDensity = environment.cloudDensity;
      if (this.cloudPass) {
        this.cloudPass.uniforms.cloudDensity.value = environment.cloudDensity;
      }
    }
    
    if (environment.precipitation !== undefined) {
      this.environmentConditions.precipitation = environment.precipitation;
      // Update precipitation particle systems (not implemented in this file)
    }
    
    if (environment.lightningProbability !== undefined) {
      this.environmentConditions.lightningProbability = environment.lightningProbability;
      // Update lightning effect probability (not implemented in this file)
    }
    
    if (environment.windSpeed !== undefined) {
      this.environmentConditions.windSpeed = environment.windSpeed;
      if (this.cloudPass) {
        this.cloudPass.uniforms.cloudSpeed.value = environment.windSpeed * 0.01;
      }
    }
    
    // Update sky appearance based on time of day (if provided)
    if (environment.timeOfDay !== undefined) {
      // Calculate sun position based on time (0-24)
      const timeNormalized = (environment.timeOfDay % 24) / 24;
      const sunAngle = timeNormalized * Math.PI * 2;
      
      // Position sun (rotated around y-axis)
      const sunDistance = 1000;
      const sunHeight = Math.sin(sunAngle) * sunDistance;
      const sunHorizontal = Math.cos(sunAngle) * sunDistance;
      
      const sunPosition = new THREE.Vector3(sunHorizontal, sunHeight, 0);
      
      // Update sky shader uniforms
      if (this.skyPass) {
        this.skyPass.uniforms.sunPosition.value.copy(sunPosition);
        
        // Adjust sky parameters based on time of day
        // Dawn/dusk
        if (timeNormalized > 0.2 && timeNormalized < 0.3 || 
            timeNormalized > 0.7 && timeNormalized < 0.8) {
          this.skyPass.uniforms.rayleigh.value = 2.0; // More scattering
          this.skyPass.uniforms.turbidity.value = 12.0;
          this.skyPass.uniforms.mieCoefficient.value = 0.008;
        } 
        // Night
        else if (timeNormalized > 0.3 && timeNormalized < 0.7) {
          this.skyPass.uniforms.rayleigh.value = 0.5;
          this.skyPass.uniforms.turbidity.value = 5.0;
          this.skyPass.uniforms.mieCoefficient.value = 0.003;
        }
        // Day
        else {
          this.skyPass.uniforms.rayleigh.value = 1.0;
          this.skyPass.uniforms.turbidity.value = 10.0;
          this.skyPass.uniforms.mieCoefficient.value = 0.005;
        }
      }
    }
  }
  
  /**
   * Trigger a visual effect at a world position
   */
  triggerEffect(effectType, position, params = {}) {
    switch (effectType) {
      case 'explosion':
        // Trigger explosion effect at position
        console.log(`Explosion effect at ${position.x}, ${position.y}, ${position.z}`);
        // Actual implementation would create explosion particle system
        break;
        
      case 'smoke':
        // Trigger smoke trail effect
        console.log(`Smoke effect at ${position.x}, ${position.y}, ${position.z}`);
        // Actual implementation would create smoke particle system
        break;
        
      case 'vapor':
        // Trigger vapor trail (wingtip vortices)
        console.log(`Vapor effect at ${position.x}, ${position.y}, ${position.z}`);
        // Actual implementation would create vapor trail
        break;
        
      case 'bullet':
        // Trigger bullet tracer effect
        console.log(`Bullet tracer from ${position.x}, ${position.y}, ${position.z}`);
        // Actual implementation would create bullet tracer
        break;
        
      case 'flash':
        // Trigger weapon flash effect
        console.log(`Flash effect at ${position.x}, ${position.y}, ${position.z}`);
        // Actual implementation would create muzzle flash
        break;
        
      default:
        console.warn(`Unknown effect type: ${effectType}`);
    }
  }
  
  /**
   * Resize effect passes when renderer size changes
   */
  resize(width, height, pixelRatio) {
    // Update render targets
    Object.values(this.renderTargets).forEach(target => {
      if (target.isWebGLRenderTarget) {
        const targetWidth = target === this.renderTargets.clouds 
          ? width * 0.5 // Lower resolution for clouds
          : width;
          
        const targetHeight = target === this.renderTargets.clouds
          ? height * 0.5
          : height;
          
        target.setSize(targetWidth, targetHeight);
      }
    });
    
    // Update antialiasing resolution
    if (this.fxaaPass) {
      this.fxaaPass.uniforms.resolution.value.set(
        1 / (width * pixelRatio),
        1 / (height * pixelRatio)
      );
    }
    
    // Update bloom resolution
    if (this.bloomPass) {
      this.bloomPass.resolution.set(width, height);
    }
    
    // Update SSAO resolution
    if (this.ssaoPass) {
      this.ssaoPass.setSize(width, height);
    }
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    // Dispose render targets
    Object.values(this.renderTargets).forEach(target => {
      if (target.isWebGLRenderTarget) {
        target.dispose();
      }
    });
    
    // Other cleanup as needed
  }
}