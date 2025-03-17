/**
   * Process inputs into controls
   * @param {number} deltaTime - Time since last update in seconds
   * @private
   */
_processInputs(deltaTime) {
    // Mouse and keyboard controls
    if (this.viewMode === VIEW_MODES.COCKPIT || this.viewMode === VIEW_MODES.CHASE) {
      // Pitch (up/down)
      if (this.inputState.keyboard.forward) {
        this.controls.pitch = Math.min(1, this.controls.pitch + deltaTime * 2);
      } else if (this.inputState.keyboard.backward) {
        this.controls.pitch = Math.max(-1, this.controls.pitch - deltaTime * 2);
      } else if (!this.inputState.mouse.leftButton && !this.inputState.mouse.rightButton) {
        // Let mouse control pitch if no keyboard input
        // Otherwise, keep the current pitch from keyboard
      }

      // Yaw (left/right)
      if (this.inputState.keyboard.left) {
        this.controls.yaw = Math.max(-1, this.controls.yaw - deltaTime * 2);
      } else if (this.inputState.keyboard.right) {
        this.controls.yaw = Math.min(1, this.controls.yaw + deltaTime * 2);
      } else if (!this.inputState.mouse.leftButton && !this.inputState.mouse.rightButton) {
        // Let mouse control yaw if no keyboard input
        // Otherwise, keep the current yaw from keyboard
      }

      // Roll (tilt)
      if (this.inputState.keyboard.rollLeft) {
        this.controls.roll = Math.max(-1, this.controls.roll - deltaTime * 2);
      } else if (this.inputState.keyboard.rollRight) {
        this.controls.roll = Math.min(1, this.controls.roll + deltaTime * 2);
      } else {
        // Auto-center roll when no input
        this.controls.roll *= 0.95;
      }

      // Throttle
      if (this.inputState.keyboard.throttleUp) {
        this.controls.throttle = Math.min(1, this.controls.throttle + deltaTime * 0.5);
      } else if (this.inputState.keyboard.throttleDown) {
        this.controls.throttle = Math.max(0, this.controls.throttle - deltaTime * 0.5);
      }

      // Weapons
      this.controls.fire = this.inputState.keyboard.primaryFire || this.inputState.mouse.leftButton;
      this.controls.secondaryFire = this.inputState.keyboard.secondaryFire || this.inputState.mouse.rightButton;
    }
  }

  /**
   * Update local player based on controls
   * @param {number} deltaTime - Time since last update in seconds
   * @private
   */
  _updateLocalPlayer(deltaTime) {
    if (!this.localPlayer || !this.socket) return;

    // Create controls packet to send to server
    const controlsPacket = {
      throttle: this.controls.throttle,
      pitch: this.controls.pitch,
      roll: this.controls.roll,
      yaw: this.controls.yaw,
      timestamp: Date.now()
    };

    // Send controls to server
    this.socket.emit('player_controls', controlsPacket);

    // Store for prediction
    this.pendingInputs.push(controlsPacket);

    // Handle weapons
    if (this.controls.fire) {
      this._firePrimaryWeapon();
    }

    if (this.controls.secondaryFire) {
      this._fireSecondaryWeapon();
    }

    // Client-side prediction if enabled
    if (this.clientPrediction) {
      // Apply controls to predict movement
      // This would implement simplified physics matching the server
      // For a full implementation, would need to sync with server physics model
      this._predictPlayerMovement(deltaTime);
    }
  }

  /**
   * Predict player movement based on controls
   * @param {number} deltaTime - Time since last update in seconds
   * @private
   */
  _predictPlayerMovement(deltaTime) {
    // Simple prediction model
    // In a full implementation, would match server physics
    const player = this.localPlayer;
    if (!player || !player.isAlive) return;

    // Apply throttle to speed
    const maxSpeed = 40; // m/s (~144 km/h)
    const targetSpeed = maxSpeed * this.controls.throttle;
    
    // Convert Euler rotations to direction
    const rotationY = player.rotation.y;
    const rotationX = player.rotation.x;
    
    // Direction vector
    const direction = new THREE.Vector3(
      Math.sin(rotationY) * Math.cos(rotationX),
      Math.sin(rotationX),
      Math.cos(rotationY) * Math.cos(rotationX)
    );
    
    // Calculate current speed
    const currentSpeed = new THREE.Vector3(
      player.velocity.x,
      player.velocity.y,
      player.velocity.z
    ).length();
    
    // Smoothly adjust speed
    const speedDiff = targetSpeed - currentSpeed;
    const acceleration = speedDiff > 0 ? 5 : 10; // Faster deceleration
    const speedChange = Math.min(Math.abs(speedDiff), acceleration * deltaTime) * Math.sign(speedDiff);
    
    const newSpeed = currentSpeed + speedChange;
    
    // Apply to velocity
    player.velocity = {
      x: direction.x * newSpeed,
      y: direction.y * newSpeed,
      z: direction.z * newSpeed
    };
    
    // Apply controls to rotation
    const rotationSpeed = Math.PI * deltaTime; // Radians per second
    
    player.rotation = {
      x: player.rotation.x + this.controls.pitch * rotationSpeed * 0.5, // Pitch
      y: player.rotation.y + this.controls.yaw * rotationSpeed * 0.5,   // Yaw
      z: player.rotation.z + this.controls.roll * rotationSpeed         // Roll
    };
    
    // Apply velocity to position
    player.position = {
      x: player.position.x + player.velocity.x * deltaTime,
      y: player.position.y + player.velocity.y * deltaTime,
      z: player.position.z + player.velocity.z * deltaTime
    };
    
    // Update model
    if (player.model) {
      player.model.position.copy(player.position);
      
      // Update rotation
      player.model.quaternion.setFromEuler(
        new THREE.Euler(
          player.rotation.x,
          player.rotation.y,
          player.rotation.z,
          'YXZ'
        )
      );
    }
    
    // Update exhaust effect based on throttle
    if (player.exhaustData) {
      this._updateExhaustEffect(player, this.controls.throttle);
    }
  }

  /**
   * Fire primary weapon
   * @private
   */
  _firePrimaryWeapon() {
    // Check cooldown
    const now = Date.now();
    if (this.lastPrimaryFire && now - this.lastPrimaryFire < 200) {
      return; // Still on cooldown
    }
    
    // Send fire event to server
    this.socket.emit('fire_weapon', {
      type: 'primary',
      timestamp: now
    });
    
    // Set cooldown
    this.lastPrimaryFire = now;
    
    // Play sound
    if (this.options.enableSound) {
      this._playSound('gun');
    }
  }

  /**
   * Fire secondary weapon
   * @private
   */
  _fireSecondaryWeapon() {
    // Check cooldown
    const now = Date.now();
    if (this.lastSecondaryFire && now - this.lastSecondaryFire < 2000) {
      return; // Still on cooldown
    }
    
    // Get target information if any
    let targetData = null;
    
    // Find nearest enemy in front for targeting
    if (this.localPlayer) {
      const maxTargetAngle = 30 * (Math.PI / 180); // 30 degrees in radians
      const maxTargetDistance = 1000; // meters
      
      // Get local player forward direction
      const playerQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          this.localPlayer.rotation.x,
          this.localPlayer.rotation.y,
          this.localPlayer.rotation.z,
          'YXZ'
        )
      );
      
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerQuat);
      
      let bestTarget = null;
      let bestAngle = maxTargetAngle;
      
      // Check all players
      for (const [id, player] of this.players) {
        // Skip local player and non-alive players
        if (player.isLocal || !player.isAlive) continue;
        
        // Direction to target
        const direction = new THREE.Vector3(
          player.position.x - this.localPlayer.position.x,
          player.position.y - this.localPlayer.position.y,
          player.position.z - this.localPlayer.position.z
        );
        
        // Distance to target
        const distance = direction.length();
        if (distance > maxTargetDistance) continue;
        
        // Normalize direction
        direction.normalize();
        
        // Angle between forward and direction
        const angle = Math.acos(forward.dot(direction));
        
        // If better than current best, update
        if (angle < bestAngle) {
          bestAngle = angle;
          bestTarget = player;
        }
      }
      
      // If target found, use it
      if (bestTarget) {
        targetData = {
          id: bestTarget.id,
          position: bestTarget.position
        };
      }
    }
    
    // Send fire event to server
    this.socket.emit('fire_weapon', {
      type: 'secondary',
      timestamp: now,
      target: targetData
    });
    
    // Set cooldown
    this.lastSecondaryFire = now;
    
    // Play sound
    if (this.options.enableSound) {
      this._playSound('missile');
    }
  }

  /**
   * Update camera based on view mode
   * @param {number} deltaTime - Time since last update in seconds
   * @private
   */
  _updateCamera(deltaTime) {
    // Skip if no local player
    if (!this.localPlayer) return;
    
    // Position of local player
    const playerPos = this.localPlayer.position;
    
    // Set up camera based on view mode
    switch (this.viewMode) {
      case VIEW_MODES.COCKPIT:
        this._updateCockpitCamera(playerPos, this.localPlayer.rotation);
        break;
        
      case VIEW_MODES.CHASE:
        this._updateChaseCamera(playerPos, this.localPlayer.rotation);
        break;
        
      case VIEW_MODES.ORBIT:
        // Orbit controls handle camera updates
        this.cameraControls.target.copy(playerPos);
        this.cameraControls.update();
        break;
        
      case VIEW_MODES.TACTICAL:
        this._updateTacticalCamera(playerPos);
        break;
    }
  }

  /**
   * Update camera in cockpit view
   * @param {Object} playerPos - Player position
   * @param {Object} playerRot - Player rotation
   * @private
   */
  _updateCockpitCamera(playerPos, playerRot) {
    // Create quaternion from player rotation
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        playerRot.x,
        playerRot.y,
        playerRot.z,
        'YXZ'
      )
    );
    
    // Position camera slightly above player model's center
    const offsetPosition = new THREE.Vector3(0, 0.5, 0);
    offsetPosition.applyQuaternion(quaternion);
    
    this.mainCamera.position.x = playerPos.x + offsetPosition.x;
    this.mainCamera.position.y = playerPos.y + offsetPosition.y;
    this.mainCamera.position.z = playerPos.z + offsetPosition.z;
    
    // Slight forward offset to see front of aircraft
    const forwardOffset = new THREE.Vector3(0, 0, -0.5);
    forwardOffset.applyQuaternion(quaternion);
    
    // Look-at point
    const lookAt = new THREE.Vector3(
      playerPos.x + forwardOffset.x,
      playerPos.y + forwardOffset.y,
      playerPos.z + forwardOffset.z
    );
    
    this.mainCamera.lookAt(lookAt);
    
    // Apply quaternion directly for better control
    this.mainCamera.quaternion.copy(quaternion);
  }

  /**
   * Update camera in chase view
   * @param {Object} playerPos - Player position
   * @param {Object} playerRot - Player rotation
   * @private
   */
  _updateChaseCamera(playerPos, playerRot) {
    // Create quaternion from player rotation
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        playerRot.x,
        playerRot.y,
        playerRot.z,
        'YXZ'
      )
    );
    
    // Position camera behind and above player
    const offset = new THREE.Vector3(0, 3, 12);
    offset.applyQuaternion(quaternion);
    
    // Target position
    const targetPos = new THREE.Vector3(
      playerPos.x,
      playerPos.y,
      playerPos.z
    );
    
    // Camera position
    const cameraPos = new THREE.Vector3(
      targetPos.x - offset.x,
      targetPos.y - offset.y,
      targetPos.z - offset.z
    );
    
    // Smoothly interpolate camera position
    this.mainCamera.position.lerp(cameraPos, 0.1);
    
    // Look at player
    this.mainCamera.lookAt(targetPos);
  }

  /**
   * Update camera in tactical view
   * @param {Object} playerPos - Player position
   * @private
   */
  _updateTacticalCamera(playerPos) {
    // Position camera high above player
    const height = 300;
    const distance = 100;
    
    this.mainCamera.position.set(
      playerPos.x,
      playerPos.y + height,
      playerPos.z + distance
    );
    
    // Look at player
    this.mainCamera.lookAt(
      playerPos.x,
      playerPos.y,
      playerPos.z
    );
  }

  /**
   * Update projectiles
   * @param {number} deltaTime - Time since last update in seconds
   * @private
   */
  _updateProjectiles(deltaTime) {
    // Update each projectile
    for (const [id, projectile] of this.projectiles.entries()) {
      // Update position based on velocity
      const newPosition = {
        x: projectile.position.x + projectile.velocity.x * deltaTime,
        y: projectile.position.y + projectile.velocity.y * deltaTime,
        z: projectile.position.z + projectile.velocity.z * deltaTime
      };
      
      projectile.position = newPosition;
      
      // Update model position
      if (projectile.model) {
        projectile.model.position.copy(newPosition);
      }
      
      // Check lifetime
      const age = Date.now() - projectile.created;
      if (age > projectile.lifetime) {
        // Remove expired projectile
        if (projectile.model) {
          this.scene.remove(projectile.model);
        }
        
        this.projectiles.delete(id);
      }
    }
  }

  /**
   * Update explosions
   * @param {number} deltaTime - Time since last update in seconds
   * @private
   */
  _updateExplosions(deltaTime) {
    // Update each explosion
    for (const [id, explosion] of this.explosions.entries()) {
      // Get age as fraction of lifetime
      const age = Date.now() - explosion.created;
      const lifeFraction = age / explosion.lifetime;
      
      // Scale based on life fraction (grow then shrink)
      let scale = explosion.scale;
      if (lifeFraction < 0.3) {
        // Grow to full size
        scale = explosion.scale * (lifeFraction / 0.3);
      } else {
        // Shrink gradually
        scale = explosion.scale * (1 - ((lifeFraction - 0.3) / 0.7));
      }
      
      // Apply scale
      if (explosion.model) {
        explosion.model.scale.set(scale, scale, scale);
      }
      
      // Remove if expired
      if (lifeFraction >= 1) {
        if (explosion.model) {
          this.scene.remove(explosion.model);
        }
        
        this.explosions.delete(id);
      }
    }
  }

  /**
   * Update weather effects
   * @param {number} deltaTime - Time since last update in seconds
   * @private
   */
  _updateWeatherEffects(deltaTime) {
    if (!this.weatherEffect) return;
    
    // Update particles based on type
    if (this.weatherEffect.userData.type === 'rain') {
      this._updateRainEffect(deltaTime);
    } else if (this.weatherEffect.userData.type === 'snow') {
      this._updateSnowEffect(deltaTime);
    }
  }

  /**
   * Update rain particles
   * @param {number} deltaTime - Time since last update in seconds
   * @private
   */
  _updateRainEffect(deltaTime) {
    const positions = this.weatherEffect.userData.positions;
    const velocity = this.weatherEffect.userData.velocity;
    const cameraPos = this.mainCamera.position;
    
    for (let i = 0; i < positions.length / 3; i++) {
      // Move particles down
      positions[i * 3 + 1] -= velocity * deltaTime * 50;
      
      // Reset if below camera or too far away
      const dx = positions[i * 3] - cameraPos.x;
      const dy = positions[i * 3 + 1] - cameraPos.y;
      const dz = positions[i * 3 + 2] - cameraPos.z;
      
      const distSq = dx * dx + dy * dy + dz * dz;
      
      if (positions[i * 3 + 1] < cameraPos.y - 50 || distSq > 40000) {
        // Reset particle above camera
        positions[i * 3] = cameraPos.x + (Math.random() - 0.5) * 200;
        positions[i * 3 + 1] = cameraPos.y + Math.random() * 100 + 50;
        positions[i * 3 + 2] = cameraPos.z + (Math.random() - 0.5) * 200;
      }
    }
    
    // Update geometry
    this.weatherEffect.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Update snow particles
   * @param {number} deltaTime - Time since last update in seconds
   * @private
   */
  _updateSnowEffect(deltaTime) {
    const positions = this.weatherEffect.userData.positions;
    const velocity = this.weatherEffect.userData.velocity;
    const horizontalMovement = this.weatherEffect.userData.horizontalMovement;
    const cameraPos = this.mainCamera.position;
    
    // Use time for oscillating movement
    const time = Date.now() / 1000;
    
    for (let i = 0; i < positions.length / 3; i++) {
      // Move particles down with some horizontal drift
      positions[i * 3 + 1] -= velocity * deltaTime * 50;
      positions[i * 3] += Math.sin(time + i * 0.1) * horizontalMovement * deltaTime * 10;
      positions[i * 3 + 2] += Math.cos(time + i * 0.1) * horizontalMovement * deltaTime * 10;
      
      // Reset if below camera or too far away
      const dx = positions[i * 3] - cameraPos.x;
      const dy = positions[i * 3 + 1] - cameraPos.y;
      const dz = positions[i * 3 + 2] - cameraPos.z;
      
      const distSq = dx * dx + dy * dy + dz * dz;
      
      if (positions[i * 3 + 1] < cameraPos.y - 50 || distSq > 40000) {
        // Reset particle above camera
        positions[i * 3] = cameraPos.x + (Math.random() - 0.5) * 150;
        positions[i * 3 + 1] = cameraPos.y + Math.random() * 100 + 50;
        positions[i * 3 + 2] = cameraPos.z + (Math.random() - 0.5) * 150;
      }
    }
    
    // Update geometry
    this.weatherEffect.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Interpolate entities for smooth movement
   * @param {number} deltaTime - Time since last update in seconds
   * @private
   */
  _interpolateEntities(deltaTime) {
    // Interpolate remote players
    for (const [id, player] of this.players.entries()) {
      // Skip local player (handled by prediction)
      if (player.isLocal) continue;
      
      // Skip if no model
      if (!player.model) continue;
      
      // Smooth position and rotation
      this._interpolateObject(player, deltaTime);
    }
  }

  /**
   * Interpolate object position and rotation
   * @param {Object} object - Object to interpolate
   * @param {number} deltaTime - Time since last update in seconds
   * @private
   */
  _interpolateObject(object, deltaTime) {
    // Skip if no model
    if (!object.model) return;
    
    // Interpolation factor (adjust for desired smoothness)
    const factor = Math.min(1, deltaTime * 10);
    
    // Smoothly interpolate position
    object.model.position.lerp(
      new THREE.Vector3(
        object.position.x,
        object.position.y,
        object.position.z
      ),
      factor
    );
    
    // Smoothly interpolate rotation
    const targetQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        object.rotation.x,
        object.rotation.y,
        object.rotation.z,
        'YXZ'
      )
    );
    
    object.model.quaternion.slerp(targetQuat, factor);
  }

  /**
   * Update minimap/radar
   * @private
   */
  _updateMinimap() {
    // Skip if minimap is not visible
    if (!this.minimap.visible || !this.minimap.context) return;
    
    // Get local player
    if (!this.localPlayer) return;
    
    const ctx = this.minimap.context;
    const canvas = this.minimap.canvas;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = this.minimap.radius;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw radar background
    ctx.fillStyle = 'rgba(0, 20, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw radar grid
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
    ctx.lineWidth = 1;
    
    // Draw concentric circles
    for (let r = radius / 3; r <= radius; r += radius / 3) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Draw crosshairs
    ctx.beginPath();
    ctx.moveTo(centerX - radius, centerY);
    ctx.lineTo(centerX + radius, centerY);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - radius);
    ctx.lineTo(centerX, centerY + radius);
    ctx.stroke();
    
    // Local player position and rotation
    const playerPos = this.localPlayer.position;
    const playerRot = this.localPlayer.rotation;
    
    // Draw entities relative to local player
    for (const [id, player] of this.players.entries()) {
      // Skip non-alive players
      if (!player.isAlive) continue;
      
      // Calculate relative position
      const dx = player.position.x - playerPos.x;
      const dz = player.position.z - playerPos.z;
      
      // Rotate based on player heading
      const sin = Math.sin(-playerRot.y);
      const cos = Math.cos(-playerRot.y);
      const rotatedX = dx * cos - dz * sin;
      const rotatedZ = dx * sin + dz * cos;
      
      // Scale position to fit radar
      const scaledX = rotatedX * this.minimap.scale;
      const scaledZ = rotatedZ * this.minimap.scale;
      
      // Skip if outside radar range
      if (Math.abs(scaledX) > radius || Math.abs(scaledZ) > radius) continue;
      
      // Position on radar
      const radarX = centerX + scaledX;
      const radarY = centerY + scaledZ;
      
      // Determine color based on player type
      let color = player.isLocal ? '#00FF00' : '#FF0000';
      
      // Draw player dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(radarX, radarY, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw direction indicator
      if (!player.isLocal) {
        const relativeAngle = Math.atan2(dz, dx) - playerRot.y;
        const indicatorLength = 6;
        
        ctx.beginPath();
        ctx.moveTo(radarX, radarY);
        ctx.lineTo(
          radarX + Math.cos(player.rotation.y - playerRot.y) * indicatorLength,
          radarY + Math.sin(player.rotation.y - playerRot.y) * indicatorLength
        );
        ctx.stroke();
      }
    }
    
    // Draw projectiles
    for (const [id, projectile] of this.projectiles.entries()) {
      // Calculate relative position
      const dx = projectile.position.x - playerPos.x;
      const dz = projectile.position.z - playerPos.z;
      
      // Rotate based on player heading
      const sin = Math.sin(-playerRot.y);
      const cos = Math.cos(-playerRot.y);
      const rotatedX = dx * cos - dz * sin;
      const rotatedZ = dx * sin + dz * cos;
      
      // Scale position to fit radar
      const scaledX = rotatedX * this.minimap.scale;
      const scaledZ = rotatedZ * this.minimap.scale;
      
      // Skip if outside radar range
      if (Math.abs(scaledX) > radius || Math.abs(scaledZ) > radius) continue;
      
      // Position on radar
      const radarX = centerX + scaledX;
      const radarY = centerY + scaledZ;
      
      // Determine color based on owner
      const color = projectile.ownerId === this.playerId ? '#FFFF00' : '#FF6600';
      
      // Draw projectile dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(radarX, radarY, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Render the scene
   * @private
   */
  _render() {
    // If post-processing is enabled
    if (this.options.enablePostProcessing && this.composer) {
      this.composer.render();
    } else {
      // Standard rendering
      this.renderer.render(this.scene, this.activeCamera);
    }
  }

  /**
   * Clean up resources
   */
  dispose() {
    // Stop any running processes
    this.stop();
    
    // Disconnect from server
    if (this.socket) {
      this.socket.disconnect();
    }
    
    // Remove event listeners
    window.removeEventListener('resize', this._onWindowResize);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('mousemove', this._onMouseMove);
      this.renderer.domElement.removeEventListener('mousedown', this._onMouseDown);
      this.renderer.domElement.removeEventListener('mouseup', this._onMouseUp);
      this.renderer.domElement.removeEventListener('touchstart', this._onTouchStart);
      this.renderer.domElement.removeEventListener('touchmove', this._onTouchMove);
      this.renderer.domElement.removeEventListener('touchend', this._onTouchEnd);
    }
    
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    
    // Dispose renderer
    if (this.renderer) {
      this.renderer.dispose();
    }
    
    // Dispose meshes and materials
    this._disposeMeshes(this.scene);
    
    // Clear references
    this.scene = null;
    this.mainCamera = null;
    this.renderer = null;
    this.players.clear();
    this.projectiles.clear();
    this.explosions.clear();
    
    this._logDebug('Game resources disposed');
  }

  /**
   * Dispose all meshes in scene
   * @param {THREE.Object3D} obj - Object to dispose
   * @private
   */
  _disposeMeshes(obj) {
    if (!obj) return;
    
    // Recursively dispose all meshes and materials
    if (obj.children) {
      for (let i = obj.children.length - 1; i >= 0; i--) {
        this._disposeMeshes(obj.children[i]);
      }
    }
    
    // Dispose geometry and materials
    if (obj.geometry) {
      obj.geometry.dispose();
    }
    
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(material => {
          if (material.map) material.map.dispose();
          material.dispose();
        });
      } else {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    }
  }
}

export { GameClient, VIEW_MODES };      projectile.velocity.x,
      projectile.velocity.y,
      projectile.velocity.z
    );
    
    if (velocity.length() > 0) {
      // Create a rotation that points in the direction of movement
      const direction = velocity.clone().normalize();
      const axis = new THREE.Vector3(0, 0, 1);
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(axis, direction);
      
      // Apply rotation
      projectile.model.quaternion.copy(quaternion);
    }
    
    // Add to scene
    this.scene.add(projectile.model);
    
    // Add to projectiles map
    this.projectiles.set(projectile.id, projectile);
    
    // Play sound if it's a local player projectile
    if (data.ownerId === this.playerId && this.options.enableSound) {
      this._playSound(projectile.type === 'missile' ? 'missile' : 'gun');
    }
  }
  
  /**
   * Handle projectile impact
   * @param {Object} data - Impact data
   * @private
   */
  _handleProjectileImpact(data) {
    // Get projectile
    const projectile = this.projectiles.get(data.projectileId);
    
    if (projectile) {
      // Create explosion at impact point
      this._createExplosion({
        position: data.position,
        scale: projectile.type === 'missile' ? 2.0 : 0.5
      });
      
      // Remove projectile model from scene
      if (projectile.model) {
        this.scene.remove(projectile.model);
      }
      
      // Remove from projectiles map
      this.projectiles.delete(data.projectileId);
      
      // Play impact sound
      if (this.options.enableSound) {
        this._playSound(projectile.type === 'missile' ? 'explosion' : 'impact');
      }
    } else {
      // Projectile not found, still create explosion
      this._createExplosion({
        position: data.position,
        scale: data.type === 'missile' ? 2.0 : 0.5
      });
    }
    
    // If the projectile hit a player, show hit marker for local player
    if (data.ownerId === this.playerId && data.targetId) {
      this._showHitMarker(data.damage || 10);
    }
  }
  
  /**
   * Create an explosion
   * @param {Object} data - Explosion data
   * @private
   */
  _createExplosion(data) {
    // Create explosion object
    const explosion = {
      id: data.id || `explosion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: data.position || { x: 0, y: 0, z: 0 },
      scale: data.scale || 1.0,
      created: Date.now(),
      lifetime: data.lifetime || 2000, // 2 seconds default
      model: null
    };
    
    // Create 3D model
    explosion.model = this.models.explosion.clone();
    
    // Scale model based on explosion size
    explosion.model.scale.set(explosion.scale, explosion.scale, explosion.scale);
    
    // Position model
    explosion.model.position.copy(explosion.position);
    
    // Add to scene
    this.scene.add(explosion.model);
    
    // Add to explosions map
    this.explosions.set(explosion.id, explosion);
    
    // Play sound if enabled
    if (this.options.enableSound) {
      this._playSound('explosion');
    }
    
    // Auto-remove after lifetime
    setTimeout(() => {
      this._removeExplosion(explosion.id);
    }, explosion.lifetime);
  }
  
  /**
   * Remove an explosion
   * @param {string} explosionId - Explosion ID
   * @private
   */
  _removeExplosion(explosionId) {
    // Get explosion
    const explosion = this.explosions.get(explosionId);
    if (!explosion) return;
    
    // Remove model from scene
    if (explosion.model) {
      this.scene.remove(explosion.model);
    }
    
    // Remove from explosions map
    this.explosions.delete(explosionId);
  }
  
  /**
   * Play a sound
   * @param {string} soundName - Sound name
   * @private
   */
  _playSound(soundName) {
    // Skip if sound is disabled
    if (!this.options.enableSound) return;
    
    // Check if sound exists
    const sound = this.sounds[soundName];
    if (!sound) {
      this._logDebug(`Sound not found: ${soundName}`);
      return;
    }
    
    // Play sound
    // Actual implementation would depend on the audio library used
    // This is a placeholder for demonstration
    sound.play();
  }
  
  /**
   * Show hit marker when player hits an enemy
   * @param {number} damage - Damage amount
   * @private
   */
  _showHitMarker(damage) {
    // Create or update hit marker
    if (!this.hud.elements.hitMarker) {
      this.hud.elements.hitMarker = document.createElement('div');
      this.hud.elements.hitMarker.className = 'hud-hit-marker';
      this.hud.elements.hitMarker.style.position = 'absolute';
      this.hud.elements.hitMarker.style.top = '50%';
      this.hud.elements.hitMarker.style.left = '50%';
      this.hud.elements.hitMarker.style.width = '40px';
      this.hud.elements.hitMarker.style.height = '40px';
      this.hud.elements.hitMarker.style.marginTop = '-20px';
      this.hud.elements.hitMarker.style.marginLeft = '-20px';
      this.hud.elements.hitMarker.style.backgroundColor = 'transparent';
      this.hud.elements.hitMarker.style.opacity = '0';
      this.hud.elements.hitMarker.style.transition = 'opacity 0.2s ease-out';
      
      // Create X shape
      const line1 = document.createElement('div');
      line1.style.position = 'absolute';
      line1.style.top = '0';
      line1.style.left = '50%';
      line1.style.width = '2px';
      line1.style.height = '100%';
      line1.style.backgroundColor = '#FF0000';
      line1.style.transform = 'translateX(-50%) rotate(45deg)';
      
      const line2 = document.createElement('div');
      line2.style.position = 'absolute';
      line2.style.top = '0';
      line2.style.left = '50%';
      line2.style.width = '2px';
      line2.style.height = '100%';
      line2.style.backgroundColor = '#FF0000';
      line2.style.transform = 'translateX(-50%) rotate(-45deg)';
      
      this.hud.elements.hitMarker.appendChild(line1);
      this.hud.elements.hitMarker.appendChild(line2);
      this.hud.container.appendChild(this.hud.elements.hitMarker);
    }
    
    // Show hit marker
    this.hud.elements.hitMarker.style.opacity = '0.8';
    
    // Make it larger for higher damage
    const scale = 1 + Math.min(1, damage / 50);
    this.hud.elements.hitMarker.style.transform = `scale(${scale})`;
    
    // Hide after short delay
    clearTimeout(this.hitMarkerTimeout);
    this.hitMarkerTimeout = setTimeout(() => {
      if (this.hud.elements.hitMarker) {
        this.hud.elements.hitMarker.style.opacity = '0';
      }
    }, 200);
    
    // Play hit sound
    if (this.options.enableSound) {
      this._playSound('hit');
    }
  }
  
  /**
   * Handle player spawn
   * @param {Object} data - Spawn data
   * @private
   */
  _handlePlayerSpawn(data) {
    // Get player
    let player = this.players.get(data.playerId);
    
    // Create player if not exists
    if (!player) {
      this._createPlayer({
        playerId: data.playerId,
        position: data.position,
        aircraftType: data.aircraftType
      });
      player = this.players.get(data.playerId);
      if (!player) return;
    } else {
      // Update player position
      player.position = data.position;
      if (player.model) {
        player.model.position.copy(data.position);
      }
      
      // Make model visible
      if (player.model) {
        player.model.visible = true;
      }
      
      // Reset player state
      player.isAlive = true;
      player.health = 100;
    }
    
    // Play spawn sound for local player
    if (player.isLocal && this.options.enableSound) {
      this._playSound('spawn');
    }
    
    // Show spawn message
    if (player.isLocal) {
      this._showMessage('You have spawned!', 2000);
    }
  }
  
  /**
   * Handle player death
   * @param {Object} data - Death data
   * @private
   */
  _handlePlayerDeath(data) {
    // Get player
    const player = this.players.get(data.playerId);
    if (!player) return;
    
    // Update player state
    player.isAlive = false;
    
    // Create explosion at player position
    this._createExplosion({
      position: data.position || player.position,
      scale: 3.0
    });
    
    // Hide player model
    if (player.model) {
      player.model.visible = false;
    }
    
    // Show death message
    if (player.isLocal) {
      let message = 'You were killed';
      
      // Add killer info if available
      if (data.source && data.source.playerId) {
        const killer = this.players.get(data.source.playerId);
        if (killer) {
          message += ` by ${killer.username}`;
        }
      }
      
      this._showMessage(message, 3000);
      
      // Play death sound
      if (this.options.enableSound) {
        this._playSound('death');
      }
    } else {
      // If local player killed someone, show message
      if (data.source && data.source.playerId === this.playerId) {
        this._showMessage(`You killed ${player.username}!`, 2000);
        
        // Play kill sound
        if (this.options.enableSound) {
          this._playSound('kill');
        }
      }
    }
  }
  
  /**
   * Handle player respawn
   * @param {Object} data - Respawn data
   * @private
   */
  _handlePlayerRespawn(data) {
    // Essentially same as spawn, but with different messaging
    this._handlePlayerSpawn(data);
    
    // Get player
    const player = this.players.get(data.playerId);
    if (!player) return;
    
    // Show respawn message for local player
    if (player.isLocal) {
      this._showMessage('Respawned! Get back in the fight!', 2000);
    }
  }
  
  /**
   * Handle token reward
   * @param {Object} data - Token reward data
   * @private
   */
  _handleTokenReward(data) {
    // Update token balance
    if (data.playerId === this.playerId) {
      this.tokenBalance += data.amount;
      
      // Update tokens display
      if (this.hud.elements.tokens) {
        this.hud.elements.tokens.textContent = `Tokens: ${this.tokenBalance}`;
      }
      
      // Show message
      this._showMessage(`Earned ${data.amount} tokens: ${data.reason}`, 3000);
      
      // Play token sound
      if (this.options.enableSound) {
        this._playSound('token');
      }
      
      // Notify listeners
      this.emit('tokens_received', {
        amount: data.amount,
        reason: data.reason,
        balance: this.tokenBalance
      });
    }
  }
  
  /**
   * Handle achievement completion
   * @param {Object} data - Achievement data
   * @private
   */
  _handleAchievement(data) {
    // Only process for local player
    if (data.playerId !== this.playerId) return;
    
    // Show achievement notification
    this._showAchievementNotification(data.achievement);
    
    // Emit achievement event
    this.emit('achievement_completed', data);
  }
  
  /**
   * Show achievement notification
   * @param {Object} achievement - Achievement data
   * @private
   */
  _showAchievementNotification(achievement) {
    // Create notification element if not exists
    if (!this.hud.elements.achievementNotification) {
      const notification = document.createElement('div');
      notification.className = 'achievement-notification';
      notification.style.position = 'absolute';
      notification.style.top = '100px';
      notification.style.left = '50%';
      notification.style.transform = 'translateX(-50%)';
      notification.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      notification.style.color = '#FFD700'; // Gold color
      notification.style.padding = '10px 20px';
      notification.style.borderRadius = '5px';
      notification.style.display = 'none';
      notification.style.textAlign = 'center';
      notification.style.zIndex = '100';
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.5s ease-in-out';
      
      this.hud.container.appendChild(notification);
      this.hud.elements.achievementNotification = notification;
    }
    
    // Set content
    const notification = this.hud.elements.achievementNotification;
    notification.innerHTML = `
      <div style="font-size: 18px; margin-bottom: 5px;">Achievement Unlocked!</div>
      <div style="font-size: 22px; margin-bottom: 5px;">${achievement.name}</div>
      <div style="font-size: 14px;">${achievement.description}</div>
    `;
    
    // Show notification
    notification.style.display = 'block';
    
    // Animate in
    setTimeout(() => {
      notification.style.opacity = '1';
    }, 10);
    
    // Play achievement sound
    if (this.options.enableSound) {
      this._playSound('achievement');
    }
    
    // Hide after delay
    clearTimeout(this.achievementTimeout);
    this.achievementTimeout = setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        notification.style.display = 'none';
      }, 500);
    }, 5000);
  }
  
  /**
   * Handle game ending
   * @param {Object} data - Game ending data
   * @private
   */
  _handleGameEnding(data) {
    // Show message that game is ending
    this._showMessage(`Game ending in ${data.countdown} seconds. Reason: ${data.reason}`, 5000);
    
    // Update leaderboard and show it
    if (data.leaderboard) {
      this._updateLeaderboard(data.leaderboard);
      this._toggleScoreboard(true);
    }
    
    // Start countdown
    this._startGameEndCountdown(data.countdown);
  }
  
  /**
   * Start game end countdown
   * @param {number} seconds - Countdown in seconds
   * @private
   */
  _startGameEndCountdown(seconds) {
    // Create countdown element if not exists
    if (!this.hud.elements.countdown) {
      const countdown = document.createElement('div');
      countdown.className = 'game-countdown';
      countdown.style.position = 'absolute';
      countdown.style.top = '20%';
      countdown.style.left = '50%';
      countdown.style.transform = 'translateX(-50%)';
      countdown.style.fontSize = '48px';
      countdown.style.color = '#FF0000';
      countdown.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.7)';
      countdown.style.display = 'none';
      
      this.hud.container.appendChild(countdown);
      this.hud.elements.countdown = countdown;
    }
    
    // Show countdown
    this.hud.elements.countdown.style.display = 'block';
    
    // Clear existing interval
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
    
    // Start countdown
    let remainingSeconds = seconds;
    
    const updateCountdown = () => {
      this.hud.elements.countdown.textContent = remainingSeconds;
      
      if (remainingSeconds <= 0) {
        clearInterval(this.countdownInterval);
        this.hud.elements.countdown.style.display = 'none';
      }
      
      remainingSeconds--;
    };
    
    // Update immediately
    updateCountdown();
    
    // Update every second
    this.countdownInterval = setInterval(updateCountdown, 1000);
  }
  
  /**
   * Handle session ended
   * @param {Object} data - Session data
   * @private
   */
  _handleSessionEnded(data) {
    // Show game over message
    this._showMessage('Game Over!', 5000);
    
    // Update and show final leaderboard
    if (data.leaderboard) {
      this._updateLeaderboard(data.leaderboard);
      this._toggleScoreboard(true);
    }
    
    // Stop the game
    this.stop();
    
    // Show game over overlay
    this._showGameOverScreen(data);
  }
  
  /**
   * Show game over screen
   * @param {Object} data - Session end data
   * @private
   */
  _showGameOverScreen(data) {
    // Create overlay if not exists
    if (!this.gameOverOverlay) {
      const overlay = document.createElement('div');
      overlay.className = 'game-over-overlay';
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      overlay.style.display = 'flex';
      overlay.style.flexDirection = 'column';
      overlay.style.justifyContent = 'center';
      overlay.style.alignItems = 'center';
      overlay.style.zIndex = '1000';
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 1s ease-in-out';
      
      this.container.appendChild(overlay);
      this.gameOverOverlay = overlay;
    }
    
    // Create content
    let content = `
      <div style="color: white; font-size: 48px; margin-bottom: 20px;">Game Over</div>
      <div style="color: white; font-size: 24px; margin-bottom: 40px;">Session time: ${this._formatTime(data.duration)}</div>
    `;
    
    // Add leaderboard if available
    if (data.leaderboard) {
      if (Array.isArray(data.leaderboard)) {
        // Individual leaderboard
        content += '<div style="background-color: rgba(0, 0, 0, 0.5); padding: 20px; max-width: 80%;">';
        content += '<h2 style="color: white; text-align: center;">Final Results</h2>';
        content += '<table style="color: white; margin: 0 auto;">';
        content += '<tr><th>Rank</th><th>Player</th><th>Score</th><th>Kills</th><th>Deaths</th></tr>';
        
        data.leaderboard.slice(0, 10).forEach((player, index) => {
          const isLocalPlayer = player.id === this.playerId;
          content += `<tr style="${isLocalPlayer ? 'color: #00FF00;' : ''}">`;
          content += `<td>${index + 1}</td>`;
          content += `<td>${player.username}</td>`;
          content += `<td>${player.score}</td>`;
          content += `<td>${player.kills}</td>`;
          content += `<td>${player.deaths}</td>`;
          content += '</tr>';
        });
        
        content += '</table>';
        content += '</div>';
      } else if (data.leaderboard.teams) {
        // Team leaderboard
        content += '<div style="background-color: rgba(0, 0, 0, 0.5); padding: 20px; max-width: 80%;">';
        content += '<h2 style="color: white; text-align: center;">Team Results</h2>';
        content += '<table style="color: white; margin: 0 auto; margin-bottom: 20px;">';
        content += '<tr><th>Rank</th><th>Team</th><th>Score</th></tr>';
        
        data.leaderboard.teams.forEach((team, index) => {
          content += `<tr style="color: ${team.color};">`;
          content += `<td>${index + 1}</td>`;
          content += `<td>${team.name}</td>`;
          content += `<td>${team.score}</td>`;
          content += '</tr>';
        });
        
        content += '</table>';
        
        content += '<h2 style="color: white; text-align: center;">Player Results</h2>';
        content += '<table style="color: white; margin: 0 auto;">';
        content += '<tr><th>Rank</th><th>Player</th><th>Team</th><th>Score</th><th>Kills</th><th>Deaths</th></tr>';
        
        data.leaderboard.players.slice(0, 10).forEach((player, index) => {
          const isLocalPlayer = player.id === this.playerId;
          const team = data.leaderboard.teams.find(t => t.id === player.teamId) || {};
          
          content += `<tr style="${isLocalPlayer ? 'color: #00FF00;' : ''}">`;
          content += `<td>${index + 1}</td>`;
          content += `<td>${player.username}</td>`;
          content += `<td style="color: ${team.color || '#FFFFFF'}">${team.name || 'N/A'}</td>`;
          content += `<td>${player.score}</td>`;
          content += `<td>${player.kills}</td>`;
          content += `<td>${player.deaths}</td>`;
          content += '</tr>';
        });
        
        content += '</table>';
        content += '</div>';
      }
    }
    
    // Add buttons
    content += `
      <div style="margin-top: 40px;">
        <button class="play-again-btn" style="padding: 10px 20px; font-size: 18px; margin-right: 20px;">Play Again</button>
        <button class="main-menu-btn" style="padding: 10px 20px; font-size: 18px;">Main Menu</button>
      </div>
    `;
    
    // Set content
    this.gameOverOverlay.innerHTML = content;
    
    // Show overlay
    this.gameOverOverlay.style.display = 'flex';
    setTimeout(() => {
      this.gameOverOverlay.style.opacity = '1';
    }, 10);
    
    // Add button event listeners
    const playAgainBtn = this.gameOverOverlay.querySelector('.play-again-btn');
    const mainMenuBtn = this.gameOverOverlay.querySelector('.main-menu-btn');
    
    if (playAgainBtn) {
      playAgainBtn.addEventListener('click', () => {
        this.emit('play_again');
        this._hideGameOverScreen();
      });
    }
    
    if (mainMenuBtn) {
      mainMenuBtn.addEventListener('click', () => {
        this.emit('main_menu');
        this._hideGameOverScreen();
      });
    }
  }
  
  /**
   * Hide game over screen
   * @private
   */
  _hideGameOverScreen() {
    if (!this.gameOverOverlay) return;
    
    // Fade out
    this.gameOverOverlay.style.opacity = '0';
    
    // Remove after animation
    setTimeout(() => {
      this.gameOverOverlay.style.display = 'none';
    }, 1000);
  }
  
  /**
   * Format time in milliseconds to MM:SS format
   * @param {number} ms - Time in milliseconds
   * @returns {string} Formatted time
   * @private
   */
  _formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  
  /**
   * Start the game
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.clock.start();
    
    // Request animation frame for rendering loop
    this._updateFrameLoop();
    
    // Emit started event
    this.emit('started');
    
    this._logDebug('Game started');
  }
  
  /**
   * Stop the game
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.clock.stop();
    
    // Emit stopped event
    this.emit('stopped');
    
    this._logDebug('Game stopped');
  }
  
  /**
   * Pause the game
   * @private
   */
  _pauseGame() {
    if (!this.isRunning) return;
    
    this.isPaused = true;
    this.clock.stop();
    
    // Show pause message
    this._showMessage('Game Paused', 0);
    
    // Emit paused event
    this.emit('paused');
    
    this._logDebug('Game paused');
  }
  
  /**
   * Resume the game
   * @private
   */
  _resumeGame() {
    if (!this.isPaused) return;
    
    this.isPaused = false;
    this.clock.start();
    
    // Clear pause message
    this._showMessage('', 0);
    
    // Emit resumed event
    this.emit('resumed');
    
    this._logDebug('Game resumed');
  }
  
  /**
   * Main update loop
   * @private
   */
  _updateFrameLoop() {
    // Request next frame
    if (this.isRunning) {
      requestAnimationFrame(this._updateFrameLoop);
    }
    
    // Skip if paused
    if (this.isPaused) return;
    
    // Calculate delta time
    this.deltaTime = this.clock.getDelta();
    
    // Cap delta time to prevent large jumps
    this.deltaTime = Math.min(this.deltaTime, 0.1);
    
    // Increment frame counter
    this.frameCount++;
    
    // Track frame time for performance metrics
    const frameStartTime = performance.now();
    
    // Update game state
    this._update(this.deltaTime);
    
    // Render scene
    this._render();
    
    // Update minimap
    if (this.options.enableMinimapRadar && this.minimap.visible) {
      this._updateMinimap();
    }
    
    // Update analytics
    const frameEndTime = performance.now();
    const frameTime = frameEndTime - frameStartTime;
    
    this.analytics.frameTimeTotal += frameTime;
    this.analytics.frameTimeCount++;
    this.analytics.frameTimeMin = Math.min(this.analytics.frameTimeMin, frameTime);
    this.analytics.frameTimeMax = Math.max(this.analytics.frameTimeMax, frameTime);
    this.analytics.frameTimeAvg = this.analytics.frameTimeTotal / this.analytics.frameTimeCount;
    
    // Calculate FPS every second
    const now = Date.now();
    if (now - this.lastFrameTime >= 1000) {
      this.analytics.fps = Math.round((this.frameCount * 1000) / (now - this.lastFrameTime));
      this.frameCount = 0;
      this.lastFrameTime = now;
      
      // Update debug info
      if (this.debug && this.debugConsole.container) {
        this._updateDebugInfo();
      }
    }
  }
  
  /**
   * Update debug information
   * @private
   */
  _updateDebugInfo() {
    const debugInfo = [
      `FPS: ${this.analytics.fps}`,
      `Frame Time: ${this.analytics.frameTimeAvg.toFixed(2)}ms`,
      `Entities: ${this.players.size} players, ${this.projectiles.size} projectiles, ${this.explosions.size} explosions`,
      `Local Player: ${this.localPlayer ? `${this.localPlayer.username} (${this.localPlayer.id})` : 'None'}`,
      `Position: ${this.localPlayer ? `X: ${this.localPlayer.position.x.toFixed(1)}, Y: ${this.localPlayer.position.y.toFixed(1)}, Z: ${this.localPlayer.position.z.toFixed(1)}` : 'N/A'}`,
      `Health: ${this.localPlayer ? this.localPlayer.health.toFixed(0) : 'N/A'}`,
      `Score: ${this.localPlayer ? this.localPlayer.score : 'N/A'}`
    ];
    
    this._logDebug(debugInfo.join(' | '));
  }
  
  /**
   * Update game state
   * @param {number} deltaTime - Time since last update in seconds
   * @private
   */
  _update(deltaTime) {
    // Update input - gamepad if available
    if (this._pollGamepads) {
      this._updateGamepadInput();
    }
    
    // Process input into controls
    this._processInputs(deltaTime);
    
    // Handle local player controls
    if (this.localPlayer && this.localPlayer.isAlive) {
      this._updateLocalPlayer(deltaTime);
    }
    
    // Update camera
    this._updateCamera(deltaTime);
    
    // Update projectiles
    this._updateProjectiles(deltaTime);
    
    // Update explosions
    this._updateExplosions(deltaTime);
    
    // Update weather effects
    this._updateWeatherEffects(deltaTime);
    
    // Update interpolation for remote players
    if (this.entityInterpolation) {
      this._interpolateEntities(deltaTime);
    }
  }/**
 * Game Client
 * 
 * Client-side implementation of the multiplayer plane game.
 * Handles rendering, input, networking, and client-side prediction.
 * 
 * @module GameClient
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { io } from 'socket.io-client';
import { PlayerState } from './playerState';
import { EventEmitter } from 'events';

/**
 * Client-side view modes
 * @enum {string}
 */
const VIEW_MODES = {
  COCKPIT: 'cockpit',
  CHASE: 'chase',
  ORBIT: 'orbit',
  TACTICAL: 'tactical'
};

/**
 * Client-side game implementation
 */
class GameClient extends EventEmitter {
  /**
   * Create a new game client
   * @param {Object} options - Client options
   */
  constructor(options = {}) {
    super();
    
    this.options = Object.assign({
      containerId: 'game-container',
      serverUrl: 'http://localhost:3000',
      playerName: 'Player',
      aircraftType: 'FIGHTER',
      viewMode: VIEW_MODES.CHASE,
      debug: false,
      enablePostProcessing: true,
      enableSound: true,
      enableHUD: true,
      enableMinimapRadar: true,
      sensitivityMouse: 1.0,
      sensitivityKeyboard: 1.0
    }, options);
    
    // DOM elements
    this.container = document.getElementById(this.options.containerId);
    if (!this.container) {
      throw new Error(`Container element with id "${this.options.containerId}" not found`);
    }
    
    // Initialize properties
    this.isInitialized = false;
    this.isConnected = false;
    this.isRunning = false;
    
    // Game state
    this.sessionId = null;
    this.playerId = null;
    this.players = new Map();
    this.localPlayer = null;
    this.projectiles = new Map();
    this.explosions = new Map();
    this.worldObjects = new Map();
    this.aiEntities = new Map();
    
    // Time and simulation
    this.clock = new THREE.Clock();
    this.deltaTime = 0;
    this.lastFrameTime = 0;
    this.frameCount = 0;
    
    // Rendering and graphics
    this.renderer = null;
    this.scene = null;
    this.mainCamera = null;
    this.cameraControls = null;
    this.activeCamera = null;
    this.viewMode = this.options.viewMode;
    
    // HUD and UI
    this.hud = {
      container: null,
      elements: {},
      visible: this.options.enableHUD
    };
    
    // Input state
    this.inputState = {
      keyboard: {
        forward: false,
        backward: false,
        left: false,
        right: false,
        up: false,
        down: false,
        rollLeft: false,
        rollRight: false,
        throttleUp: false,
        throttleDown: false,
        primaryFire: false,
        secondaryFire: false,
        boost: false,
        brake: false
      },
      mouse: {
        x: 0,
        y: 0,
        leftButton: false,
        rightButton: false
      },
      touch: [],
      gamepad: null
    };
    
    // Control values
    this.controls = {
      throttle: 0.5,  // Default to 50% throttle
      pitch: 0,
      roll: 0,
      yaw: 0,
      fire: false,
      secondaryFire: false
    };
    
    // Network state
    this.socket = null;
    this.lastServerUpdate = null;
    this.latency = 0;
    this.pendingInputs = [];
    this.serverReconciliation = true;
    this.clientPrediction = true;
    this.entityInterpolation = true;
    
    // Model and asset references
    this.models = {};
    this.textures = {};
    this.sounds = {};
    
    // Particle systems
    this.particleSystems = [];
    
    // Analytics
    this.analytics = {
      fps: 0,
      frameTimeAvg: 0,
      frameTimeMin: Infinity,
      frameTimeMax: 0,
      frameTimeTotal: 0,
      frameTimeCount: 0,
      pingAvg: 0,
      pingTotal: 0,
      pingCount: 0,
      pingMin: Infinity,
      pingMax: 0
    };
    
    // Token and blockchain integration
    this.walletConnected = false;
    this.walletAddress = null;
    this.tokenBalance = 0;
    
    // Minimap/Radar
    this.minimap = {
      container: null,
      canvas: null,
      context: null,
      visible: this.options.enableMinimapRadar,
      radius: 100,
      scale: 0.001, // World scale to minimap scale
    };
    
    // Bind methods to preserve context
    this._onWindowResize = this._onWindowResize.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
    this._onVisibilityChange = this._onVisibilityChange.bind(this);
    this._updateFrameLoop = this._updateFrameLoop.bind(this);
    
    // Debug console
    this.debug = this.options.debug;
    if (this.debug) {
      this.debugConsole = {
        container: null,
        lines: [],
        maxLines: 20
      };
    }
  }
  
  /**
   * Initialize the game client
   * @returns {Promise} Resolves when initialization is complete
   */
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      // Initialize renderer
      await this._initRenderer();
      
      // Initialize scene
      await this._initScene();
      
      // Initialize cameras
      await this._initCameras();
      
      // Initialize HUD
      if (this.options.enableHUD) {
        await this._initHUD();
      }
      
      // Initialize minimap/radar
      if (this.options.enableMinimapRadar) {
        await this._initMinimap();
      }
      
      // Initialize debug console
      if (this.debug) {
        await this._initDebugConsole();
      }
      
      // Load models and assets
      await this._loadAssets();
      
      // Initialize input handlers
      this._initInputHandlers();
      
      // Initialize window resize handler
      window.addEventListener('resize', this._onWindowResize);
      
      // Initialize visibility change handler
      document.addEventListener('visibilitychange', this._onVisibilityChange);
      
      // Mark as initialized
      this.isInitialized = true;
      this.emit('initialized');
      
      if (this.debug) {
        this._logDebug('Game client initialized');
      }
      
      return true;
      
    } catch (error) {
      console.error('Failed to initialize game client:', error);
      this.emit('error', { error, context: 'initialize' });
      throw error;
    }
  }
  
  /**
   * Initialize the WebGL renderer
   * @private
   */
  async _initRenderer() {
    // Create renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      stencil: true,
      powerPreference: 'high-performance'
    });
    
    // Configure renderer
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Add to DOM
    this.container.appendChild(this.renderer.domElement);
    
    // Enable post-processing if requested
    if (this.options.enablePostProcessing) {
      await this._initPostProcessing();
    }
  }
  
  /**
   * Initialize post-processing effects
   * @private
   */
  async _initPostProcessing() {
    // Implement post-processing setup here (e.g., using EffectComposer)
    // Left as a stub for now as it depends on specific visual requirements
  }
  
  /**
   * Initialize the 3D scene
   * @private
   */
  async _initScene() {
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
    
    // Add fog for distance culling and atmosphere
    this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.0002);
    
    // Create lighting
    const ambientLight = new THREE.AmbientLight(0x666666);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xFFFFFF, 1);
    directionalLight.position.set(100, 100, 50);
    directionalLight.castShadow = true;
    
    // Configure shadow properties
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    
    this.scene.add(directionalLight);
    
    // Store lights for easy access
    this.lights = {
      ambient: ambientLight,
      directional: directionalLight
    };
    
    // Create skybox
    await this._createSkybox();
    
    // Create ground plane (temporary until terrain is loaded)
    const groundGeometry = new THREE.PlaneGeometry(10000, 10000);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x3D9140,
      roughness: 0.8,
      metalness: 0.2
    });
    
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -10;
    ground.receiveShadow = true;
    this.scene.add(ground);
    
    // Store for later access
    this.ground = ground;
  }
  
  /**
   * Create skybox for the scene
   * @private
   */
  async _createSkybox() {
    // Simple color gradient skybox for now
    // This would be replaced with a proper skybox using environment mapping
    
    // Create a larger sphere for the sky
    const skyGeometry = new THREE.SphereGeometry(5000, 32, 32);
    
    // Create a vertex shader for gradient sky
    const skyVertexShader = `
    varying vec3 vWorldPosition;
    
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
    `;
    
    // Create a fragment shader for gradient sky
    const skyFragmentShader = `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    
    varying vec3 vWorldPosition;
    
    void main() {
      float h = normalize(vWorldPosition + offset).y;
      gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
    }
    `;
    
    // Create shader material
    const skyMaterial = new THREE.ShaderMaterial({
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      uniforms: {
        topColor: { value: new THREE.Color(0x0077FF) },
        bottomColor: { value: new THREE.Color(0xFFFFFF) },
        offset: { value: 33 },
        exponent: { value: 0.6 }
      },
      side: THREE.BackSide
    });
    
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(sky);
    this.sky = sky;
  }
  
  /**
   * Initialize cameras
   * @private
   */
  async _initCameras() {
    // Create main perspective camera
    this.mainCamera = new THREE.PerspectiveCamera(
      75, // Field of view
      this.container.clientWidth / this.container.clientHeight, // Aspect ratio
      0.1, // Near clipping plane
      10000 // Far clipping plane
    );
    
    // Position camera initially
    this.mainCamera.position.set(0, 10, 10);
    this.mainCamera.lookAt(0, 0, 0);
    
    // Create camera rig for smooth following
    this.cameraRig = new THREE.Object3D();
    this.cameraRig.add(this.mainCamera);
    this.scene.add(this.cameraRig);
    
    // Create different camera setups
    this.cameras = {
      [VIEW_MODES.COCKPIT]: this.mainCamera,
      [VIEW_MODES.CHASE]: this.mainCamera,
      [VIEW_MODES.ORBIT]: this.mainCamera,
      [VIEW_MODES.TACTICAL]: this.mainCamera
    };
    
    // Set active camera
    this.activeCamera = this.mainCamera;
    
    // Create orbit controls for free camera mode
    this.cameraControls = new OrbitControls(this.mainCamera, this.renderer.domElement);
    this.cameraControls.enableDamping = true;
    this.cameraControls.dampingFactor = 0.1;
    this.cameraControls.rotateSpeed = 0.5;
    this.cameraControls.enabled = false; // Disabled by default, enabled in orbit mode
  }
  
  /**
   * Initialize HUD elements
   * @private
   */
  async _initHUD() {
    // Create HUD container
    this.hud.container = document.createElement('div');
    this.hud.container.className = 'game-hud';
    this.hud.container.style.position = 'absolute';
    this.hud.container.style.top = '0';
    this.hud.container.style.left = '0';
    this.hud.container.style.width = '100%';
    this.hud.container.style.height = '100%';
    this.hud.container.style.pointerEvents = 'none';
    this.hud.container.style.zIndex = '10';
    
    // Add to DOM
    this.container.appendChild(this.hud.container);
    
    // Create basic HUD elements
    this.hud.elements.speedometer = this._createHUDElement('div', 'hud-speedometer', 'Speed: 0 km/h');
    this.hud.elements.altitude = this._createHUDElement('div', 'hud-altitude', 'Alt: 0 m');
    this.hud.elements.heading = this._createHUDElement('div', 'hud-heading', 'Heading: 0°');
    this.hud.elements.throttle = this._createHUDElement('div', 'hud-throttle', 'Throttle: 50%');
    this.hud.elements.health = this._createHUDElement('div', 'hud-health', 'Health: 100%');
    this.hud.elements.weapons = this._createHUDElement('div', 'hud-weapons', 'Weapons: Ready');
    this.hud.elements.message = this._createHUDElement('div', 'hud-message', '');
    this.hud.elements.score = this._createHUDElement('div', 'hud-score', 'Score: 0');
    this.hud.elements.tokens = this._createHUDElement('div', 'hud-tokens', 'Tokens: 0');
    
    // Create crosshair
    this.hud.elements.crosshair = document.createElement('div');
    this.hud.elements.crosshair.className = 'hud-crosshair';
    this.hud.elements.crosshair.style.position = 'absolute';
    this.hud.elements.crosshair.style.top = '50%';
    this.hud.elements.crosshair.style.left = '50%';
    this.hud.elements.crosshair.style.width = '20px';
    this.hud.elements.crosshair.style.height = '20px';
    this.hud.elements.crosshair.style.marginTop = '-10px';
    this.hud.elements.crosshair.style.marginLeft = '-10px';
    this.hud.elements.crosshair.style.backgroundColor = 'transparent';
    this.hud.elements.crosshair.style.border = '2px solid rgba(0, 255, 0, 0.7)';
    this.hud.elements.crosshair.style.borderRadius = '50%';
    this.hud.container.appendChild(this.hud.elements.crosshair);
    
    // Position elements
    this.hud.elements.speedometer.style.bottom = '20px';
    this.hud.elements.speedometer.style.left = '20px';
    
    this.hud.elements.altitude.style.bottom = '50px';
    this.hud.elements.altitude.style.left = '20px';
    
    this.hud.elements.heading.style.top = '20px';
    this.hud.elements.heading.style.left = '50%';
    this.hud.elements.heading.style.transform = 'translateX(-50%)';
    
    this.hud.elements.throttle.style.bottom = '20px';
    this.hud.elements.throttle.style.right = '20px';
    
    this.hud.elements.health.style.top = '20px';
    this.hud.elements.health.style.left = '20px';
    
    this.hud.elements.weapons.style.bottom = '80px';
    this.hud.elements.weapons.style.right = '20px';
    
    this.hud.elements.message.style.top = '50%';
    this.hud.elements.message.style.left = '50%';
    this.hud.elements.message.style.transform = 'translate(-50%, -50%)';
    this.hud.elements.message.style.fontSize = '24px';
    this.hud.elements.message.style.textAlign = 'center';
    this.hud.elements.message.style.opacity = '0';
    this.hud.elements.message.style.transition = 'opacity 0.3s ease-in-out';
    
    this.hud.elements.score.style.top = '20px';
    this.hud.elements.score.style.right = '20px';
    
    this.hud.elements.tokens.style.top = '50px';
    this.hud.elements.tokens.style.right = '20px';
  }
  
  /**
   * Create a HUD element
   * @param {string} type - Element type (div, span, etc.)
   * @param {string} className - CSS class name
   * @param {string} text - Initial text content
   * @returns {HTMLElement} Created element
   * @private
   */
  _createHUDElement(type, className, text) {
    const element = document.createElement(type);
    element.className = className;
    element.textContent = text;
    element.style.position = 'absolute';
    element.style.color = 'rgba(0, 255, 0, 0.8)';
    element.style.fontFamily = 'monospace';
    element.style.fontSize = '16px';
    element.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.7)';
    element.style.padding = '5px';
    element.style.pointerEvents = 'none';
    this.hud.container.appendChild(element);
    return element;
  }
  
  /**
   * Initialize minimap/radar
   * @private
   */
  async _initMinimap() {
    // Create minimap container
    this.minimap.container = document.createElement('div');
    this.minimap.container.className = 'game-minimap';
    this.minimap.container.style.position = 'absolute';
    this.minimap.container.style.bottom = '20px';
    this.minimap.container.style.right = '20px';
    this.minimap.container.style.width = '200px';
    this.minimap.container.style.height = '200px';
    this.minimap.container.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
    this.minimap.container.style.border = '2px solid rgba(0, 255, 0, 0.5)';
    this.minimap.container.style.borderRadius = '50%';
    this.minimap.container.style.overflow = 'hidden';
    this.minimap.container.style.zIndex = '9';
    
    // Create minimap canvas
    this.minimap.canvas = document.createElement('canvas');
    this.minimap.canvas.width = 200;
    this.minimap.canvas.height = 200;
    this.minimap.canvas.style.width = '100%';
    this.minimap.canvas.style.height = '100%';
    
    // Add to DOM
    this.minimap.container.appendChild(this.minimap.canvas);
    this.container.appendChild(this.minimap.container);
    
    // Get context
    this.minimap.context = this.minimap.canvas.getContext('2d');
  }
  
  /**
   * Initialize debug console
   * @private
   */
  async _initDebugConsole() {
    // Create debug console container
    this.debugConsole.container = document.createElement('div');
    this.debugConsole.container.className = 'game-debug-console';
    this.debugConsole.container.style.position = 'absolute';
    this.debugConsole.container.style.top = '10px';
    this.debugConsole.container.style.left = '10px';
    this.debugConsole.container.style.width = '300px';
    this.debugConsole.container.style.maxHeight = '200px';
    this.debugConsole.container.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    this.debugConsole.container.style.color = 'rgba(0, 255, 0, 0.8)';
    this.debugConsole.container.style.fontFamily = 'monospace';
    this.debugConsole.container.style.fontSize = '12px';
    this.debugConsole.container.style.padding = '5px';
    this.debugConsole.container.style.overflow = 'hidden';
    this.debugConsole.container.style.zIndex = '100';
    
    // Add to DOM
    this.container.appendChild(this.debugConsole.container);
    
    // Log initial message
    this._logDebug('Debug console initialized');
  }
  
  /**
   * Log a debug message
   * @param {string} message - Message to log
   * @private
   */
  _logDebug(message) {
    if (!this.debug) return;
    
    // Add timestamp
    const timestamp = new Date().toISOString().substr(11, 8);
    const formattedMessage = `[${timestamp}] ${message}`;
    
    // Add to lines
    this.debugConsole.lines.push(formattedMessage);
    
    // Trim to max lines
    if (this.debugConsole.lines.length > this.debugConsole.maxLines) {
      this.debugConsole.lines.shift();
    }
    
    // Update display
    this.debugConsole.container.innerHTML = this.debugConsole.lines.join('<br>');
    
    // Scroll to bottom
    this.debugConsole.container.scrollTop = this.debugConsole.container.scrollHeight;
    
    // Log to console as well
    console.log(`[DEBUG] ${message}`);
  }
  
  /**
   * Load game assets (models, textures, sounds)
   * @private
   */
  async _loadAssets() {
    // In a full implementation, this would load all required assets
    // For now, we'll create placeholder geometric models
    
    this._logDebug('Loading assets...');
    
    // Create placeholder aircraft models
    this.models.fighter = this._createPlaceholderAircraft('FIGHTER', 0xFF0000);
    this.models.bomber = this._createPlaceholderAircraft('BOMBER', 0x0000FF);
    this.models.light = this._createPlaceholderAircraft('LIGHT', 0x00FF00);
    
    // Create placeholder projectile models
    this.models.bullet = this._createPlaceholderProjectile(0xFFFF00);
    this.models.missile = this._createPlaceholderProjectile(0xFF0000, true);
    
    // Create placeholder explosion
    this.models.explosion = this._createPlaceholderExplosion();
    
    this._logDebug('Assets loaded');
  }
  
  /**
   * Create a placeholder aircraft model
   * @param {string} type - Aircraft type
   * @param {number} color - Model color
   * @returns {THREE.Group} Aircraft model
   * @private
   */
  _createPlaceholderAircraft(type, color) {
    const group = new THREE.Group();
    
    // Different shapes for different aircraft types
    let fuselageGeometry, wingGeometry, tailGeometry;
    
    switch (type) {
      case 'FIGHTER':
        fuselageGeometry = new THREE.ConeGeometry(0.5, 4, 8);
        wingGeometry = new THREE.BoxGeometry(6, 0.1, 1.5);
        tailGeometry = new THREE.BoxGeometry(1.5, 0.8, 0.1);
        break;
      case 'BOMBER':
        fuselageGeometry = new THREE.CylinderGeometry(0.8, 0.8, 6, 8);
        wingGeometry = new THREE.BoxGeometry(8, 0.1, 2);
        tailGeometry = new THREE.BoxGeometry(2, 1.2, 0.1);
        break;
      case 'LIGHT':
        fuselageGeometry = new THREE.CylinderGeometry(0.4, 0.4, 3, 8);
        wingGeometry = new THREE.BoxGeometry(4, 0.1, 1);
        tailGeometry = new THREE.BoxGeometry(1, 0.6, 0.1);
        break;
      default:
        fuselageGeometry = new THREE.ConeGeometry(0.5, 4, 8);
        wingGeometry = new THREE.BoxGeometry(6, 0.1, 1.5);
        tailGeometry = new THREE.BoxGeometry(1.5, 0.8, 0.1);
    }
    
    const material = new THREE.MeshPhongMaterial({ color });
    
    // Create fuselage
    const fuselage = new THREE.Mesh(fuselageGeometry, material);
    fuselage.rotation.x = Math.PI / 2;
    group.add(fuselage);
    
    // Create wings
    const wings = new THREE.Mesh(wingGeometry, material);
    wings.position.set(0, 0, 0);
    group.add(wings);
    
    // Create tail
    const tail = new THREE.Mesh(tailGeometry, material);
    tail.position.set(0, 0.5, -1.5);
    group.add(tail);
    
    // Set shadow properties
    group.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    
    return group;
  }
  
  /**
   * Create a placeholder projectile model
   * @param {number} color - Projectile color
   * @param {boolean} isMissile - If true, creates a missile shape instead of a bullet
   * @returns {THREE.Object3D} Projectile model
   * @private
   */
  _createPlaceholderProjectile(color, isMissile = false) {
    let geometry;
    
    if (isMissile) {
      const group = new THREE.Group();
      
      // Missile body
      const bodyGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
      const bodyMaterial = new THREE.MeshPhongMaterial({ color });
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      body.rotation.x = Math.PI / 2;
      group.add(body);
      
      // Missile nose
      const noseGeometry = new THREE.ConeGeometry(0.1, 0.3, 8);
      const noseMaterial = new THREE.MeshPhongMaterial({ color: 0xCCCCCC });
      const nose = new THREE.Mesh(noseGeometry, noseMaterial);
      nose.position.set(0, 0, 0.65);
      nose.rotation.x = Math.PI / 2;
      group.add(nose);
      
      // Small fins
      const finGeometry = new THREE.BoxGeometry(0.5, 0.05, 0.2);
      const finMaterial = new THREE.MeshPhongMaterial({ color: 0xAAAAAA });
      
      // Add 4 fins
      for (let i = 0; i < 4; i++) {
        const fin = new THREE.Mesh(finGeometry, finMaterial);
        fin.position.set(0, 0, 0);
        fin.rotation.z = (Math.PI / 2) * i;
        group.add(fin);
      }
      
      group.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      
      return group;
    } else {
      // Simple bullet
      geometry = new THREE.SphereGeometry(0.1, 8, 8);
      const material = new THREE.MeshBasicMaterial({ color });
      const bullet = new THREE.Mesh(geometry, material);
      
      // Add trail effect using points
      const particleCount = 20;
      const particleGeometry = new THREE.BufferGeometry();
      const particlePositions = new Float32Array(particleCount * 3);
      
      for (let i = 0; i < particleCount; i++) {
        particlePositions[i * 3 + 0] = 0;
        particlePositions[i * 3 + 1] = 0;
        particlePositions[i * 3 + 2] = -i * 0.05;
      }
      
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
      
      const particleMaterial = new THREE.PointsMaterial({
        color,
        size: 0.05,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
      });
      
      const particles = new THREE.Points(particleGeometry, particleMaterial);
      bullet.add(particles);
      
      bullet.userData.isProjectile = true;
      bullet.userData.type = 'bullet';
      bullet.userData.trail = particles;
      
      return bullet;
    }
  }
  
  /**
   * Create a placeholder explosion effect
   * @returns {THREE.Object3D} Explosion model
   * @private
   */
  _createPlaceholderExplosion() {
    // Create particle system for explosion
    const particleCount = 100;
    const geometry = new THREE.BufferGeometry();
    
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    const color = new THREE.Color();
    
    for (let i = 0; i < particleCount; i++) {
      // Random position in sphere
      const radius = Math.random() * 2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      
      // Color gradient: center is white, edges are orange/red
      const distance = radius / 2;
      if (distance < 0.5) {
        color.setRGB(1, 1, 1); // White
      } else if (distance < 1) {
        color.setRGB(1, 1 - (distance - 0.5) * 2, 0); // Yellow to orange
      } else {
        color.setRGB(1, 0, 0); // Red
      }
      
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      
      // Random sizes
      sizes[i] = Math.random() * 0.5 + 0.1;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const material = new THREE.PointsMaterial({
      size: 0.25,
      transparent: true,
      opacity: 0.8,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    
    const particleSystem = new THREE.Points(geometry, material);
    particleSystem.userData.isExplosion = true;
    particleSystem.userData.created = Date.now();
    particleSystem.userData.lifetime = 2000; // 2 seconds
    
    return particleSystem;
  }
  
  /**
   * Initialize input handlers
   * @private
   */
  _initInputHandlers() {
    // Keyboard
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    
    // Mouse
    this.renderer.domElement.addEventListener('mousemove', this._onMouseMove);
    this.renderer.domElement.addEventListener('mousedown', this._onMouseDown);
    this.renderer.domElement.addEventListener('mouseup', this._onMouseUp);
    
    // Touch (for mobile)
    this.renderer.domElement.addEventListener('touchstart', this._onTouchStart);
    this.renderer.domElement.addEventListener('touchmove', this._onTouchMove);
    this.renderer.domElement.addEventListener('touchend', this._onTouchEnd);
    
    // Gamepad
    if (navigator.getGamepads) {
      // Poll for gamepad input during updates
      this._pollGamepads = true;
    }
    
    this._logDebug('Input handlers initialized');
  }
  
  /**
   * Handle window resize event
   * @private
   */
  _onWindowResize() {
    // Update camera aspect ratio
    this.mainCamera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.mainCamera.updateProjectionMatrix();
    
    // Update renderer size
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    
    // Update post-processing if enabled
    if (this.options.enablePostProcessing && this.composer) {
      this.composer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
    
    this._logDebug(`Resized to ${this.container.clientWidth}x${this.container.clientHeight}`);
  }
  
  /**
   * Handle key down event
   * @param {KeyboardEvent} event - Key event
   * @private
   */
  _onKeyDown(event) {
    // Only process if running
    if (!this.isRunning) return;
    
    // Prevent default for game control keys
    if (this._isGameControlKey(event.code)) {
      event.preventDefault();
    }
    
    // Update input state based on key
    this._updateKeyboardState(event.code, true);
  }
  
  /**
   * Handle key up event
   * @param {KeyboardEvent} event - Key event
   * @private
   */
  _onKeyUp(event) {
    // Update input state based on key
    this._updateKeyboardState(event.code, false);
  }
  
  /**
   * Check if a key is used for game controls
   * @param {string} keyCode - Key code
   * @returns {boolean} Whether the key is a game control key
   * @private
   */
  _isGameControlKey(keyCode) {
    const controlKeys = [
      'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyQ',
      'KeyR', 'KeyF', 'Tab'
    ];
    
    return controlKeys.includes(keyCode);
  }
  
  /**
   * Update keyboard state based on key
   * @param {string} keyCode - Key code
   * @param {boolean} isPressed - Whether the key is pressed
   * @private
   */
  _updateKeyboardState(keyCode, isPressed) {
    switch (keyCode) {
      // Movement controls
      case 'KeyW':
      case 'ArrowUp':
        this.inputState.keyboard.forward = isPressed;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.inputState.keyboard.backward = isPressed;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.inputState.keyboard.left = isPressed;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.inputState.keyboard.right = isPressed;
        break;
        
      // Roll controls
      case 'KeyQ':
        this.inputState.keyboard.rollLeft = isPressed;
        break;
      case 'KeyE':
        this.inputState.keyboard.rollRight = isPressed;
        break;
        
      // Throttle controls
      case 'ShiftLeft':
      case 'ShiftRight':
        this.inputState.keyboard.throttleUp = isPressed;
        break;
      case 'ControlLeft':
      case 'ControlRight':
        this.inputState.keyboard.throttleDown = isPressed;
        break;
        
      // Weapon controls
      case 'Space':
        this.inputState.keyboard.primaryFire = isPressed;
        break;
      case 'KeyF':
        this.inputState.keyboard.secondaryFire = isPressed;
        break;
        
      // Special controls
      case 'KeyR':
        if (isPressed) this._toggleView();
        break;
      case 'Tab':
        if (isPressed) this._toggleScoreboard(true);
        else this._toggleScoreboard(false);
        break;
        
      // Other controls can be added here
    }
  }
  
  /**
   * Handle mouse move event
   * @param {MouseEvent} event - Mouse event
   * @private
   */
  _onMouseMove(event) {
    // Only process if running
    if (!this.isRunning) return;
    
    // Calculate mouse position relative to canvas
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.inputState.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.inputState.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Use mouse movement for flight controls in appropriate view modes
    if (this.viewMode === VIEW_MODES.COCKPIT || this.viewMode === VIEW_MODES.CHASE) {
      // Apply sensitivity factor
      const sensitivityFactor = this.options.sensitivityMouse;
      
      // Use mouse position for flight controls (simplified)
      // In a real implementation, would use delta movements with pointer lock
      this.controls.pitch = -this.inputState.mouse.y * sensitivityFactor;
      this.controls.yaw = this.inputState.mouse.x * sensitivityFactor;
    }
  }
  
  /**
   * Handle mouse down event
   * @param {MouseEvent} event - Mouse event
   * @private
   */
  _onMouseDown(event) {
    // Only process if running
    if (!this.isRunning) return;
    
    // Update button state
    if (event.button === 0) {
      this.inputState.mouse.leftButton = true;
      
      // Left button usually fires primary weapon
      this.controls.fire = true;
    } else if (event.button === 2) {
      this.inputState.mouse.rightButton = true;
      
      // Right button usually fires secondary weapon
      this.controls.secondaryFire = true;
    }
  }
  
  /**
   * Handle mouse up event
   * @param {MouseEvent} event - Mouse event
   * @private
   */
  _onMouseUp(event) {
    // Update button state
    if (event.button === 0) {
      this.inputState.mouse.leftButton = false;
      this.controls.fire = false;
    } else if (event.button === 2) {
      this.inputState.mouse.rightButton = false;
      this.controls.secondaryFire = false;
    }
  }
  
  /**
   * Handle touch start event
   * @param {TouchEvent} event - Touch event
   * @private
   */
  _onTouchStart(event) {
    // Only process if running
    if (!this.isRunning) return;
    
    // Prevent default to avoid scrolling
    event.preventDefault();
    
    // Store touch information
    this.inputState.touch = Array.from(event.touches).map(touch => ({
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      startX: touch.clientX,
      startY: touch.clientY
    }));
    
    // Implement virtual joystick or touch controls here
    this._processTouchControls();
  }
  
  /**
   * Handle touch move event
   * @param {TouchEvent} event - Touch event
   * @private
   */
  _onTouchMove(event) {
    // Only process if running
    if (!this.isRunning) return;
    
    // Prevent default to avoid scrolling
    event.preventDefault();
    
    // Update touch information
    for (const touch of event.changedTouches) {
      const index = this.inputState.touch.findIndex(t => t.id === touch.identifier);
      if (index !== -1) {
        this.inputState.touch[index].x = touch.clientX;
        this.inputState.touch[index].y = touch.clientY;
      }
    }
    
    // Process updated touch information
    this._processTouchControls();
  }
  
  /**
   * Handle touch end event
   * @param {TouchEvent} event - Touch event
   * @private
   */
  _onTouchEnd(event) {
    // Prevent default
    event.preventDefault();
    
    // Remove ended touches
    for (const touch of event.changedTouches) {
      const index = this.inputState.touch.findIndex(t => t.id === touch.identifier);
      if (index !== -1) {
        this.inputState.touch.splice(index, 1);
      }
    }
    
    // Reset controls if no touches remain
    if (this.inputState.touch.length === 0) {
      this.controls.pitch = 0;
      this.controls.roll = 0;
      this.controls.yaw = 0;
      this.controls.fire = false;
      this.controls.secondaryFire = false;
    } else {
      // Process remaining touches
      this._processTouchControls();
    }
  }
  
  /**
   * Process touch inputs for flight controls
   * @private
   */
  _processTouchControls() {
    // Simple implementation - in a full game would use virtual joysticks
    
    // Use first touch for movement controls if available
    if (this.inputState.touch.length > 0) {
      const primaryTouch = this.inputState.touch[0];
      const rect = this.renderer.domElement.getBoundingClientRect();
      
      // Calculate normalized position and delta
      const normalizedX = ((primaryTouch.x - rect.left) / rect.width) * 2 - 1;
      const normalizedY = -((primaryTouch.y - rect.top) / rect.height) * 2 + 1;
      
      const deltaX = primaryTouch.x - primaryTouch.startX;
      const deltaY = primaryTouch.y - primaryTouch.startY;
      
      // Convert to flight controls
      const sensitivity = this.options.sensitivityMouse * 0.5; // Reduced for touch
      this.controls.pitch = -normalizedY * sensitivity;
      this.controls.yaw = normalizedX * sensitivity;
      
      // Detect if touch is in the right region for throttle control
      const isRightRegion = primaryTouch.startX > rect.width * 0.7;
      
      if (isRightRegion) {
        // Vertical movement controls throttle
        this.controls.throttle = Math.max(0, Math.min(1, 0.5 - (deltaY / rect.height)));
      }
    }
    
    // Use second touch for weapons if available
    if (this.inputState.touch.length > 1) {
      const weaponTouch = this.inputState.touch[1];
      const rect = this.renderer.domElement.getBoundingClientRect();
      
      // Fire primary weapon if touch is in the bottom right quadrant
      if (weaponTouch.x > rect.width * 0.5 && weaponTouch.y > rect.height * 0.5) {
        this.controls.fire = true;
      }
      
      // Fire secondary weapon if touch is in the bottom left quadrant
      if (weaponTouch.x < rect.width * 0.5 && weaponTouch.y > rect.height * 0.5) {
        this.controls.secondaryFire = true;
      }
    }
  }
  
  /**
   * Handle visibility change event
   * @private
   */
  _onVisibilityChange() {
    if (document.hidden) {
      // Pause game when tab is not visible
      this._pauseGame();
    } else {
      // Resume game when tab becomes visible again
      this._resumeGame();
    }
  }
  
  /**
   * Poll for gamepad input
   * @private
   */
  _updateGamepadInput() {
    // Skip if not supported or polling disabled
    if (!navigator.getGamepads || !this._pollGamepads) return;
    
    // Get gamepads
    const gamepads = navigator.getGamepads();
    if (!gamepads) return;
    
    // Use first connected gamepad
    let gamepad = null;
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i] && gamepads[i].connected) {
        gamepad = gamepads[i];
        break;
      }
    }
    
    if (!gamepad) return;
    
    // Store for reference
    this.inputState.gamepad = gamepad;
    
    // Process gamepad inputs
    // Left stick - flight controls
    const leftX = gamepad.axes[0]; // -1 (left) to 1 (right)
    const leftY = gamepad.axes[1]; // -1 (up) to 1 (down)
    
    // Apply deadzone
    const deadzone = 0.15;
    const applyDeadzone = value => Math.abs(value) < deadzone ? 0 : value;
    
    const normalizedLeftX = applyDeadzone(leftX);
    const normalizedLeftY = applyDeadzone(leftY);
    
    // Map to flight controls
    this.controls.roll = normalizedLeftX;
    this.controls.pitch = -normalizedLeftY; // Invert Y axis
    
    // Right stick - camera or additional controls
    const rightX = gamepad.axes[2];
    const rightY = gamepad.axes[3];
    
    const normalizedRightX = applyDeadzone(rightX);
    const normalizedRightY = applyDeadzone(rightY);
    
    // In cockpit/chase view, use for looking around
    if (this.viewMode === VIEW_MODES.COCKPIT || this.viewMode === VIEW_MODES.CHASE) {
      this.controls.yaw = normalizedRightX * 0.5; // Reduced sensitivity for yaw
    }
    
    // Triggers - throttle control
    // Most gamepads report triggers as buttons (pressed or not)
    // Some report them as axes (-1 to 1)
    const leftTrigger = gamepad.buttons[6]?.value || 0;
    const rightTrigger = gamepad.buttons[7]?.value || 0;
    
    // Increase/decrease throttle based on triggers
    if (rightTrigger > 0.1) {
      this.controls.throttle = Math.min(1, this.controls.throttle + 0.01);
    }
    
    if (leftTrigger > 0.1) {
      this.controls.throttle = Math.max(0, this.controls.throttle - 0.01);
    }
    
    // Buttons - weapons and actions
    this.controls.fire = gamepad.buttons[0]?.pressed || false;
    this.controls.secondaryFire = gamepad.buttons[1]?.pressed || false;
    
    // Change view with Y button
    if (gamepad.buttons[3]?.pressed && !this._lastGamepadState?.buttons[3]?.pressed) {
      this._toggleView();
    }
    
    // Toggle scoreboard with select button
    this._toggleScoreboard(gamepad.buttons[8]?.pressed || false);
    
    // Store current state for next frame
    this._lastGamepadState = gamepad;
  }
  
  /**
   * Toggle through view modes
   * @private
   */
  _toggleView() {
    // Cycle through view modes
    const modes = Object.values(VIEW_MODES);
    const currentIndex = modes.indexOf(this.viewMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.viewMode = modes[nextIndex];
    
    // Enable/disable orbit controls based on view mode
    this.cameraControls.enabled = this.viewMode === VIEW_MODES.ORBIT;
    
    this._logDebug(`View changed to ${this.viewMode}`);
    
    // Show HUD message
    this._showMessage(`View: ${this.viewMode}`, 1500);
  }
  
  /**
   * Toggle scoreboard display
   * @param {boolean} show - Whether to show the scoreboard
   * @private
   */
  _toggleScoreboard(show) {
    // Implement scoreboard display logic
    if (this.hud.elements.scoreboard) {
      this.hud.elements.scoreboard.style.display = show ? 'block' : 'none';
    }
  }
  
  /**
   * Show a temporary HUD message
   * @param {string} text - Message text
   * @param {number} duration - Message duration in milliseconds
   * @private
   */
  _showMessage(text, duration = 3000) {
    if (!this.hud.elements.message) return;
    
    // Set message text
    this.hud.elements.message.textContent = text;
    
    // Show message
    this.hud.elements.message.style.opacity = '1';
    
    // Clear any existing timeout
    if (this._messageTimeout) {
      clearTimeout(this._messageTimeout);
    }
    
    // Hide after duration
    this._messageTimeout = setTimeout(() => {
      this.hud.elements.message.style.opacity = '0';
    }, duration);
  }
  
  /**
   * Connect to game server
   * @param {Object} authData - Authentication data
   * @returns {Promise} Resolves when connected
   */
  async connect(authData) {
    if (this.isConnected) {
      this._logDebug('Already connected to server');
      return;
    }
    
    this._logDebug(`Connecting to server: ${this.options.serverUrl}`);
    
    try {
      // Create socket connection
      this.socket = io(this.options.serverUrl, {
        transports: ['websocket'],
        auth: authData
      });
      
      // Set up socket event handlers
      this._setupSocketHandlers();
      
      // Wait for connection
      await new Promise((resolve, reject) => {
        // Success handler
        this.socket.on('connect', () => {
          this.isConnected = true;
          this._logDebug('Connected to server');
          resolve();
        });
        
        // Error handler
        this.socket.on('connect_error', (error) => {
          this._logDebug(`Connection error: ${error.message}`);
          reject(error);
        });
        
        // Set connection timeout
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);
        
        // Clear timeout on success or error
        this.socket.once('connect', () => clearTimeout(timeout));
        this.socket.once('connect_error', () => clearTimeout(timeout));
      });
      
      return true;
      
    } catch (error) {
      this._logDebug(`Failed to connect: ${error.message}`);
      this.emit('error', { error, context: 'connect' });
      throw error;
    }
  }
  
  /**
   * Set up socket event handlers
   * @private
   */
  _setupSocketHandlers() {
    // Connection events
    this.socket.on('disconnect', () => {
      this.isConnected = false;
      this._logDebug('Disconnected from server');
      this.emit('disconnected');
      
      // Show message
      this._showMessage('Disconnected from server', 5000);
      
      // Pause game
      this._pauseGame();
    });
    
    this.socket.on('reconnect', () => {
      this.isConnected = true;
      this._logDebug('Reconnected to server');
      this.emit('reconnected');
      
      // Show message
      this._showMessage('Reconnected to server', 2000);
      
      // Resume game if it was running
      if (this.isRunning) {
        this._resumeGame();
      }
    });
    
    // Game session events
    this.socket.on('session_created', (data) => {
      this.sessionId = data.sessionId;
      this._logDebug(`Joined session: ${this.sessionId}`);
      this.emit('session_joined', data);
      
      // Show message
      this._showMessage(`Joined game: ${data.gameMode}`, 3000);
    });
    
    this.socket.on('player_joined', (data) => {
      this._logDebug(`Player joined: ${data.username} (${data.playerId})`);
      
      // Create player if not exists
      if (!this.players.has(data.playerId)) {
        this._createPlayer(data);
      }
      
      // Show message
      this._showMessage(`${data.username} joined the game`, 2000);
    });
    
    this.socket.on('player_left', (data) => {
      this._logDebug(`Player left: ${data.playerId}`);
      
      // Remove player
      this._removePlayer(data.playerId);
      
      // Show message if we have the player's data
      const player = this.players.get(data.playerId);
      if (player) {
        this._showMessage(`${player.username} left the game`, 2000);
      }
    });
    
    // Player state updates
    this.socket.on('player_state', (data) => {
      this._updatePlayerState(data);
    });
    
    this.socket.on('game_state', (data) => {
      this._updateGameState(data);
    });
    
    // Handle entity events
    this.socket.on('projectile_created', (data) => {
      this._createProjectile(data);
    });
    
    this.socket.on('projectile_impact', (data) => {
      this._handleProjectileImpact(data);
    });
    
    this.socket.on('explosion', (data) => {
      this._createExplosion(data);
    });
    
    // Player events
    this.socket.on('player_spawned', (data) => {
      this._handlePlayerSpawn(data);
    });
    
    this.socket.on('player_death', (data) => {
      this._handlePlayerDeath(data);
    });
    
    this.socket.on('player_respawn', (data) => {
      this._handlePlayerRespawn(data);
    });
    
    // Token and achievement events
    this.socket.on('token_rewarded', (data) => {
      this._handleTokenReward(data);
    });
    
    this.socket.on('achievement_completed', (data) => {
      this._handleAchievement(data);
    });
    
    // Environment events
    this.socket.on('weather_changed', (data) => {
      this._updateWeather(data);
    });
    
    // Game end events
    this.socket.on('game_ending', (data) => {
      this._handleGameEnding(data);
    });
    
    this.socket.on('session_ended', (data) => {
      this._handleSessionEnded(data);
    });
    
    // Error events
    this.socket.on('error', (error) => {
      this._logDebug(`Socket error: ${error.message}`);
      this.emit('error', { error, context: 'socket' });
    });
  }
  
  /**
   * Join a game session
   * @param {Object} options - Join options
   * @returns {Promise} Resolves when joined
   */
  async joinGame(options = {}) {
    if (!this.isConnected) {
      throw new Error('Not connected to server');
    }
    
    const joinOptions = {
      playerName: this.options.playerName,
      aircraftType: this.options.aircraftType,
      ...options
    };
    
    try {
      this._logDebug('Joining game...');
      
      // Request to join game
      const response = await this._emitWithAck('join_game', joinOptions);
      
      // Set player ID
      this.playerId = response.playerId;
      
      // Create local player
      this._createLocalPlayer(response);
      
      // Show message
      this._showMessage('Game joined. Prepare for takeoff!', 3000);
      
      return response;
      
    } catch (error) {
      this._logDebug(`Failed to join game: ${error.message}`);
      this.emit('error', { error, context: 'join_game' });
      throw error;
    }
  }
  
  /**
   * Emit an event and wait for acknowledgement
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @returns {Promise} Resolves with response
   * @private
   */
  _emitWithAck(event, data) {
    return new Promise((resolve, reject) => {
      this.socket.emit(event, data, (response) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
      
      // Set timeout
      setTimeout(() => {
        reject(new Error(`Timeout waiting for ${event} response`));
      }, 5000);
    });
  }
  
  /**
   * Create local player
   * @param {Object} data - Player data
   * @private
   */
  _createLocalPlayer(data) {
    // Create player object
    this.localPlayer = {
      id: data.playerId,
      username: data.username || this.options.playerName,
      aircraftType: data.aircraftType || this.options.aircraftType,
      position: data.position || { x: 0, y: 100, z: 0 },
      rotation: data.rotation || { x: 0, y: 0, z: 0 },
      velocity: data.velocity || { x: 0, y: 0, z: 0 },
      health: data.health || 100,
      score: data.score || 0,
      kills: data.kills || 0,
      deaths: data.deaths || 0,
      isLocal: true,
      isAlive: true,
      model: null
    };
    
    // Create 3D model
    this._createPlayerModel(this.localPlayer);
    
    // Add to players map
    this.players.set(this.localPlayer.id, this.localPlayer);
    
    this._logDebug(`Local player created: ${this.localPlayer.username} (${this.localPlayer.id})`);
  }
  
  /**
   * Create a player
   * @param {Object} data - Player data
   * @private
   */
  _createPlayer(data) {
    // Skip if player already exists
    if (this.players.has(data.playerId)) {
      this._updatePlayerState({
        playerId: data.playerId,
        ...data
      });
      return;
    }
    
    // Create player object
    const player = {
      id: data.playerId,
      username: data.username || 'Unknown',
      aircraftType: data.aircraftType || 'FIGHTER',
      position: data.position || { x: 0, y: 100, z: 0 },
      rotation: data.rotation || { x: 0, y: 0, z: 0 },
      velocity: data.velocity || { x: 0, y: 0, z: 0 },
      health: data.health || 100,
      score: data.score || 0,
      kills: data.kills || 0,
      deaths: data.deaths || 0,
      isLocal: false,
      isAlive: true,
      model: null
    };
    
    // Create 3D model
    this._createPlayerModel(player);
    
    // Add to players map
    this.players.set(player.id, player);
    
    this._logDebug(`Player created: ${player.username} (${player.id})`);
  }
  
  /**
   * Create player 3D model
   * @param {Object} player - Player object
   * @private
   */
  _createPlayerModel(player) {
    // Get model based on aircraft type
    const modelType = player.aircraftType.toUpperCase();
    const modelTemplate = this.models[modelType.toLowerCase()] || this.models.fighter;
    
    // Clone model
    player.model = modelTemplate.clone();
    player.model.position.copy(player.position);
    
    // Set up model quaternion for rotation
    player.model.quaternion = new THREE.Quaternion();
    player.model.quaternion.setFromEuler(
      new THREE.Euler(
        player.rotation.x,
        player.rotation.y,
        player.rotation.z,
        'YXZ'
      )
    );
    
    // Add player name label
    this._createPlayerLabel(player);
    
    // Add to scene
    this.scene.add(player.model);
    
    // Add exhaust particle effect
    this._createExhaustEffect(player);
    
    return player.model;
  }
  
  /**
   * Create text label for player
   * @param {Object} player - Player object
   * @private
   */
  _createPlayerLabel(player) {
    // Create canvas for text
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size / 4;
    
    // Get context and set properties
    const context = canvas.getContext('2d');
    context.font = '24px Arial';
    context.fillStyle = 'rgba(0, 0, 0, 0.4)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = player.isLocal ? 'rgba(0, 255, 0, 1)' : 'rgba(255, 255, 255, 1)';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(player.username, canvas.width / 2, canvas.height / 2);
    
    // Create texture and material
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true
    });
    
    // Create sprite
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(5, 1.25, 1);
    sprite.position.y = 3;
    
    // Add to player model
    player.model.add(sprite);
    player.label = sprite;
    
    // Store reference
    player.labelCanvas = canvas;
    player.labelContext = context;
  }
  
  /**
   * Create exhaust particle effect for aircraft
   * @param {Object} player - Player object
   * @private
   */
  _createExhaustEffect(player) {
    // Create particle system for exhaust
    const particleCount = 50;
    const geometry = new THREE.BufferGeometry();
    
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    // Initialize particles at origin
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      
      // Color: white/blue center to transparent
      colors[i * 3] = 0.8;
      colors[i * 3 + 1] = 0.8;
      colors[i * 3 + 2] = 1.0;
      
      // Random sizes
      sizes[i] = Math.random() * 0.5 + 0.5;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const material = new THREE.PointsMaterial({
      size: 0.2,
      transparent: true,
      opacity: 0.6,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    
    const exhaust = new THREE.Points(geometry, material);
    exhaust.position.z = -2; // Position behind aircraft
    
    // Add to model
    player.model.add(exhaust);
    player.exhaust = exhaust;
    
    // Store data for animation
    player.exhaustData = {
      positions: positions,
      colors: colors,
      sizes: sizes,
      lastUpdate: 0,
      particleCount: particleCount
    };
  }
  
  /**
   * Update exhaust effect based on throttle
   * @param {Object} player - Player object
   * @param {number} throttle - Throttle value (0-1)
   * @private
   */
  _updateExhaustEffect(player, throttle) {
    if (!player.exhaust || !player.exhaustData) return;
    
    const now = Date.now();
    const positions = player.exhaustData.positions;
    const colors = player.exhaustData.colors;
    const particleCount = player.exhaustData.particleCount;
    
    // Limit update frequency
    if (now - player.exhaustData.lastUpdate < 16) return; // ~60fps
    player.exhaustData.lastUpdate = now;
    
    // Move particles back
    for (let i = 0; i < particleCount; i++) {
      // Move existing particles back
      positions[i * 3 + 2] -= 0.1 * (throttle + 0.5);
      
      // Reset particles that go too far back
      if (positions[i * 3 + 2] < -5) {
        positions[i * 3] = (Math.random() - 0.5) * 0.2;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
        positions[i * 3 + 2] = 0;
        
        // Fade color based on distance
        colors[i * 3] = 0.8; // R
        colors[i * 3 + 1] = 0.8; // G
        colors[i * 3 + 2] = 1.0; // B
      } else {
        // Fade color based on distance
        const distance = Math.abs(positions[i * 3 + 2]);
        const fade = Math.max(0, 1 - distance / 5);
        
        colors[i * 3] = 0.8 * fade; // R
        colors[i * 3 + 1] = 0.8 * fade; // G
        colors[i * 3 + 2] = 1.0 * fade; // B
      }
    }
    
    // Update particle system
    player.exhaust.geometry.attributes.position.needsUpdate = true;
    player.exhaust.geometry.attributes.color.needsUpdate = true;
    
    // Adjust visibility based on throttle
    player.exhaust.material.opacity = 0.2 + throttle * 0.6;
  }
  
  /**
   * Remove a player
   * @param {string} playerId - Player ID
   * @private
   */
  _removePlayer(playerId) {
    // Get player
    const player = this.players.get(playerId);
    if (!player) return;
    
    // Remove model from scene
    if (player.model) {
      this.scene.remove(player.model);
    }
    
    // Remove from players map
    this.players.delete(playerId);
    
    this._logDebug(`Player removed: ${player.username} (${playerId})`);
  }
  
  /**
   * Update player state
   * @param {Object} data - Player state data
   * @private
   */
  _updatePlayerState(data) {
    // Get player
    let player = this.players.get(data.playerId);
    
    // Create player if not exists
    if (!player) {
      this._createPlayer(data);
      player = this.players.get(data.playerId);
      if (!player) return;
    }
    
    // Skip local player updates from server if client prediction is enabled
    if (player.isLocal && this.clientPrediction && !data.forceUpdate) {
      // Still update non-prediction data
      if (data.health !== undefined) player.health = data.health;
      if (data.score !== undefined) player.score = data.score;
      if (data.kills !== undefined) player.kills = data.kills;
      if (data.deaths !== undefined) player.deaths = data.deaths;
      
      return;
    }
    
    // Update player data
    if (data.position) {
      player.position = data.position;
      player.model.position.copy(data.position);
    }
    
    if (data.rotation) {
      player.rotation = data.rotation;
      player.model.quaternion.setFromEuler(
        new THREE.Euler(
          data.rotation.x,
          data.rotation.y,
          data.rotation.z,
          'YXZ'
        )
      );
    }
    
    if (data.velocity) {
      player.velocity = data.velocity;
    }
    
    if (data.health !== undefined) {
      player.health = data.health;
    }
    
    if (data.score !== undefined) {
      player.score = data.score;
    }
    
    if (data.kills !== undefined) {
      player.kills = data.kills;
    }
    
    if (data.deaths !== undefined) {
      player.deaths = data.deaths;
    }
    
    if (data.isAlive !== undefined) {
      player.isAlive = data.isAlive;
      
      // Update model visibility
      if (player.model) {
        player.model.visible = data.isAlive;
      }
    }
    
    if (data.throttle !== undefined && player.exhaustData) {
      this._updateExhaustEffect(player, data.throttle);
    }
    
    // Update HUD if local player
    if (player.isLocal) {
      this._updateHUD(player);
    }
  }
  
  /**
   * Update HUD with player data
   * @param {Object} player - Player object
   * @private
   */
  _updateHUD(player) {
    if (!this.hud.visible || !this.hud.elements) return;
    
    // Update HUD elements with player data
    if (this.hud.elements.health) {
      this.hud.elements.health.textContent = `Health: ${Math.floor(player.health)}%`;
      
      // Change color based on health
      if (player.health < 25) {
        this.hud.elements.health.style.color = 'rgba(255, 0, 0, 0.8)';
      } else if (player.health < 50) {
        this.hud.elements.health.style.color = 'rgba(255, 255, 0, 0.8)';
      } else {
        this.hud.elements.health.style.color = 'rgba(0, 255, 0, 0.8)';
      }
    }
    
    if (this.hud.elements.score) {
      this.hud.elements.score.textContent = `Score: ${player.score}`;
    }
    
    if (this.hud.elements.throttle) {
      this.hud.elements.throttle.textContent = `Throttle: ${Math.floor(this.controls.throttle * 100)}%`;
    }
    
    // Update other HUD elements with flight data
    if (player.flightData) {
      if (this.hud.elements.speedometer) {
        this.hud.elements.speedometer.textContent = `Speed: ${Math.floor(player.flightData.airspeedKph)} km/h`;
      }
      
      if (this.hud.elements.altitude) {
        this.hud.elements.altitude.textContent = `Alt: ${Math.floor(player.flightData.altitude)} m`;
      }
      
      if (this.hud.elements.heading) {
        const heading = Math.floor((player.rotation.y * 180 / Math.PI + 360) % 360);
        this.hud.elements.heading.textContent = `Heading: ${heading}°`;
      }
    }
    
    // Update tokens display
    if (this.hud.elements.tokens) {
      this.hud.elements.tokens.textContent = `Tokens: ${this.tokenBalance}`;
    }
  }
  
  /**
   * Update game state
   * @param {Object} data - Game state data
   * @private
   */
  _updateGameState(data) {
    // Update environment
    if (data.environment) {
      this._updateEnvironment(data.environment);
    }
    
    // Update time remaining
    if (data.timeRemaining !== undefined) {
      // Format time remaining
      const minutes = Math.floor(data.timeRemaining / 60000);
      const seconds = Math.floor((data.timeRemaining % 60000) / 1000);
      const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      // Update HUD
      if (this.hud.elements.timeRemaining) {
        this.hud.elements.timeRemaining.textContent = `Time: ${formattedTime}`;
      }
    }
    
    // Update leaderboard
    if (data.leaderboard) {
      this._updateLeaderboard(data.leaderboard);
    }
  }
  
  /**
   * Update environment based on server data
   * @param {Object} environment - Environment data
   * @private
   */
  _updateEnvironment(environment) {
    // Update time of day
    if (environment.time !== undefined) {
      this._updateTimeOfDay(environment.time);
    }
    
    // Update weather effects
    if (environment.weather) {
      this._updateWeather({
        weather: environment.weather,
        fogDensity: environment.fogDensity,
        windSpeed: environment.windSpeed,
        windDirection: environment.windDirection
      });
    }
  }
  
  /**
   * Update time of day lighting
   * @param {number} time - Time in hours (0-24)
   * @private
   */
  _updateTimeOfDay(time) {
    // Calculate sun position based on time
    const sunAngle = ((time - 6) / 24) * Math.PI * 2; // 0 at 6am, PI at 6pm
    
    // Update directional light position
    const distance = 1000;
    const height = Math.sin(sunAngle) * distance;
    const horizontal = Math.cos(sunAngle) * distance;
    
    this.lights.directional.position.set(horizontal, height, 0);
    
    // Update light intensity based on time
    const dayIntensity = Math.max(0, Math.sin(sunAngle));
    this.lights.directional.intensity = 0.2 + dayIntensity * 0.8;
    
    // Update ambient light based on time
    const ambientIntensity = 0.2 + dayIntensity * 0.3;
    this.lights.ambient.intensity = ambientIntensity;
    
    // Update sky colors
    if (this.sky && this.sky.material.uniforms) {
      // Night sky
      if (time < 6 || time > 18) {
        // Night blue
        this.sky.material.uniforms.topColor.value.setRGB(0.02, 0.05, 0.2);
        this.sky.material.uniforms.bottomColor.value.setRGB(0.05, 0.05, 0.1);
      }
      // Sunrise/sunset
      else if (time < 8 || time > 16) {
        // Orange/pink
        this.sky.material.uniforms.topColor.value.setRGB(0.3, 0.2, 0.5);
        this.sky.material.uniforms.bottomColor.value.setRGB(1.0, 0.5, 0.3);
      }
      // Day
      else {
        // Blue sky
        this.sky.material.uniforms.topColor.value.setRGB(0.0, 0.3, 0.8);
        this.sky.material.uniforms.bottomColor.value.setRGB(0.8, 0.9, 1.0);
      }
    }
    
    // Update fog color to match sky
    if (this.scene.fog) {
      // Use bottom sky color for fog
      if (this.sky && this.sky.material.uniforms) {
        this.scene.fog.color.copy(this.sky.material.uniforms.bottomColor.value);
      }
    }
  }
  
  /**
   * Update weather effects
   * @param {Object} data - Weather data
   * @private
   */
  _updateWeather(data) {
    // Update fog density based on weather
    if (this.scene.fog && data.fogDensity !== undefined) {
      this.scene.fog.density = data.fogDensity;
    }
    
    // Add weather particle effects based on type
    switch (data.weather) {
      case 'rain':
        this._createRainEffect();
        break;
      case 'snow':
        this._createSnowEffect();
        break;
      case 'storm':
        this._createStormEffect();
        break;
      case 'fog':
        // Extra dense fog
        if (this.scene.fog) {
          this.scene.fog.density = 0.003;
        }
        break;
      default:
        // Clear weather - remove particle effects
        this._removeWeatherEffects();
        break;
    }
    
    // Show weather change message
    this._showMessage(`Weather changed to ${data.weather}`, 2000);
  }
  
  /**
   * Create rain particle effect
   * @private
   */
  _createRainEffect() {
    // Remove existing weather effects
    this._removeWeatherEffects();
    
    // Create particle system for rain
    const particleCount = 1000;
    const geometry = new THREE.BufferGeometry();
    
    const positions = new Float32Array(particleCount * 3);
    
    // Create raindrops in a volume above the camera
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = Math.random() * 100 + 50;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // Create rain material
    const material = new THREE.PointsMaterial({
      color: 0xCCCCFF,
      size: 0.5,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
    
    // Create particle system
    const rain = new THREE.Points(geometry, material);
    rain.userData.isWeather = true;
    rain.userData.type = 'rain';
    rain.userData.positions = positions;
    rain.userData.velocity = 2.0; // Rain falls faster
    
    // Add to scene
    this.scene.add(rain);
    
    // Store reference
    this.weatherEffect = rain;
  }
  
  /**
   * Create snow particle effect
   * @private
   */
  _createSnowEffect() {
    // Remove existing weather effects
    this._removeWeatherEffects();
    
    // Create particle system for snow
    const particleCount = 1500;
    const geometry = new THREE.BufferGeometry();
    
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    // Create snowflakes in a volume above the camera
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 150;
      positions[i * 3 + 1] = Math.random() * 100 + 50;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 150;
      
      // Varied snow sizes
      sizes[i] = Math.random() * 2 + 1;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    // Create snow material
    const material = new THREE.PointsMaterial({
      color: 0xFFFFFF,
      size: 1.0,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    
    // Create particle system
    const snow = new THREE.Points(geometry, material);
    snow.userData.isWeather = true;
    snow.userData.type = 'snow';
    snow.userData.positions = positions;
    snow.userData.velocity = 0.2; // Snow falls slower
    snow.userData.horizontalMovement = 0.2; // Snow drifts horizontally
    
    // Add to scene
    this.scene.add(snow);
    
    // Store reference
    this.weatherEffect = snow;
  }
  
  /**
   * Create storm effect (rain + lightning)
   * @private
   */
  _createStormEffect() {
    // Create rain first
    this._createRainEffect();
    
    // Rain falls faster in a storm
    if (this.weatherEffect) {
      this.weatherEffect.userData.velocity = 3.0;
    }
    
    // Add occasional lightning
    this.lightningTimer = setInterval(() => {
      if (!this.isRunning) return;
      
      // Random chance for lightning
      if (Math.random() > 0.1) return;
      
      // Create lightning flash
      this._createLightningFlash();
    }, 1000);
  }
  
  /**
   * Create lightning flash effect
   * @private
   */
  _createLightningFlash() {
    // Store original light values
    const originalAmbientIntensity = this.lights.ambient.intensity;
    const originalDirectionalIntensity = this.lights.directional.intensity;
    
    // Create bright flash
    this.lights.ambient.intensity = 1.5;
    this.lights.directional.intensity = 1.5;
    
    // Revert after short delay
    setTimeout(() => {
      this.lights.ambient.intensity = originalAmbientIntensity;
      this.lights.directional.intensity = originalDirectionalIntensity;
    }, 100);
  }
  
  /**
   * Remove all weather effects
   * @private
   */
  _removeWeatherEffects() {
    // Remove existing weather effect
    if (this.weatherEffect) {
      this.scene.remove(this.weatherEffect);
      this.weatherEffect = null;
    }
    
    // Clear lightning timer
    if (this.lightningTimer) {
      clearInterval(this.lightningTimer);
      this.lightningTimer = null;
    }
  }
  
  /**
   * Update leaderboard
   * @param {Array|Object} leaderboard - Leaderboard data
   * @private
   */
  _updateLeaderboard(leaderboard) {
    // Store leaderboard data
    this.leaderboard = leaderboard;
    
    // Update UI if scoreboard is visible
    if (this.hud.elements.scoreboard && 
        this.hud.elements.scoreboard.style.display !== 'none') {
      this._renderLeaderboard();
    }
  }
  
  /**
   * Render leaderboard to UI
   * @private
   */
  _renderLeaderboard() {
    if (!this.hud.elements.scoreboard || !this.leaderboard) return;
    
    let html = '<div class="leaderboard-container">';
    html += '<h2>Leaderboard</h2>';
    
    // Check if leaderboard is array (deathmatch) or object (team-based)
    if (Array.isArray(this.leaderboard)) {
      // Deathmatch leaderboard
      html += '<table>';
      html += '<tr><th>Rank</th><th>Player</th><th>Score</th><th>Kills</th><th>Deaths</th></tr>';
      
      this.leaderboard.forEach((player, index) => {
        const isLocalPlayer = player.id === this.playerId;
        html += `<tr class="${isLocalPlayer ? 'local-player' : ''}">`;
        html += `<td>${index + 1}</td>`;
        html += `<td>${player.username}</td>`;
        html += `<td>${player.score}</td>`;
        html += `<td>${player.kills}</td>`;
        html += `<td>${player.deaths}</td>`;
        html += '</tr>';
      });
      
      html += '</table>';
    } else if (this.leaderboard.teams && this.leaderboard.players) {
      // Team-based leaderboard
      html += '<h3>Teams</h3>';
      html += '<table class="team-table">';
      html += '<tr><th>Team</th><th>Score</th><th>Players</th></tr>';
      
      this.leaderboard.teams.forEach(team => {
        html += `<tr style="color: ${team.color}">`;
        html += `<td>${team.name}</td>`;
        html += `<td>${team.score}</td>`;
        html += `<td>${team.playerCount}</td>`;
        html += '</tr>';
      });
      
      html += '</table>';
      
      html += '<h3>Players</h3>';
      html += '<table>';
      html += '<tr><th>Rank</th><th>Player</th><th>Team</th><th>Score</th><th>Kills</th><th>Deaths</th></tr>';
      
      this.leaderboard.players.forEach((player, index) => {
        const isLocalPlayer = player.id === this.playerId;
        const team = this.leaderboard.teams.find(t => t.id === player.teamId) || {};
        
        html += `<tr class="${isLocalPlayer ? 'local-player' : ''}">`;
        html += `<td>${index + 1}</td>`;
        html += `<td>${player.username}</td>`;
        html += `<td style="color: ${team.color || '#FFFFFF'}">${team.name || 'N/A'}</td>`;
        html += `<td>${player.score}</td>`;
        html += `<td>${player.kills}</td>`;
        html += `<td>${player.deaths}</td>`;
        html += '</tr>';
      });
      
      html += '</table>';
    }
    
    html += '</div>';
    
    // Update scoreboard
    this.hud.elements.scoreboard.innerHTML = html;
  }
  
  /**
   * Create a projectile
   * @param {Object} data - Projectile data
   * @private
   */
  _createProjectile(data) {
    // Create projectile object
    const projectile = {
      id: data.id,
      ownerId: data.ownerId,
      type: data.type || 'bullet',
      position: data.position || { x: 0, y: 0, z: 0 },
      velocity: data.velocity || { x: 0, y: 0, z: 0 },
      created: Date.now(),
      lifetime: data.lifetime || 5000, // 5 seconds default
      model: null
    };
    
    // Create 3D model based on type
    if (data.type === 'missile') {
      projectile.model = this.models.missile.clone();
    } else {
      projectile.model = this.models.bullet.clone();
    }
    
    // Position model
    projectile.model.position.copy(projectile.position);
    
    // Calculate rotation based on velocity
    const velocity = new THREE.Vector3(
      projectile.velocity.x,
      projectile.velocity.