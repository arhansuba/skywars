/**
 * Collision Detection System
 * 
 * Efficient spatial partitioning and collision detection for a multiplayer plane game.
 * Uses octree for terrain collisions and grid-based partitioning for dynamic objects.
 * 
 * @module collisionSystem
 */

const THREE = require('three');

/**
 * Object types for collision system
 * @enum {number}
 */
const OBJECT_TYPES = {
  TERRAIN: 1,
  AIRCRAFT: 2,
  PROJECTILE: 3,
  STATIC_OBJECT: 4,
  PICKUP: 5
};

/**
 * Octree node for efficient space partitioning
 */
class OctreeNode {
  /**
   * Create an octree node
   * @param {THREE.Box3} bounds - Bounding box for this node
   * @param {number} depth - Current depth of the node
   * @param {number} maxDepth - Maximum depth of the octree
   * @param {number} maxObjects - Maximum objects before subdivision
   */
  constructor(bounds, depth = 0, maxDepth = 8, maxObjects = 10) {
    this.bounds = bounds;
    this.depth = depth;
    this.maxDepth = maxDepth;
    this.maxObjects = maxObjects;
    this.objects = [];
    this.children = null;
    this.isLeaf = true;
  }

  /**
   * Clear all objects from this node and its children
   */
  clear() {
    this.objects = [];
    
    if (this.children) {
      for (let i = 0; i < 8; i++) {
        this.children[i].clear();
      }
    }
    
    this.isLeaf = true;
    this.children = null;
  }

  /**
   * Subdivide this node into eight children
   */
  subdivide() {
    if (!this.isLeaf) return;
    
    const min = this.bounds.min;
    const max = this.bounds.max;
    const midX = (min.x + max.x) / 2;
    const midY = (min.y + max.y) / 2;
    const midZ = (min.z + max.z) / 2;
    
    // Create 8 children nodes
    this.children = [
      // Bottom layer (y < midY)
      new OctreeNode(
        new THREE.Box3(
          new THREE.Vector3(min.x, min.y, min.z),
          new THREE.Vector3(midX, midY, midZ)
        ),
        this.depth + 1,
        this.maxDepth,
        this.maxObjects
      ),
      new OctreeNode(
        new THREE.Box3(
          new THREE.Vector3(midX, min.y, min.z),
          new THREE.Vector3(max.x, midY, midZ)
        ),
        this.depth + 1,
        this.maxDepth,
        this.maxObjects
      ),
      new OctreeNode(
        new THREE.Box3(
          new THREE.Vector3(min.x, min.y, midZ),
          new THREE.Vector3(midX, midY, max.z)
        ),
        this.depth + 1,
        this.maxDepth,
        this.maxObjects
      ),
      new OctreeNode(
        new THREE.Box3(
          new THREE.Vector3(midX, min.y, midZ),
          new THREE.Vector3(max.x, midY, max.z)
        ),
        this.depth + 1,
        this.maxDepth,
        this.maxObjects
      ),
      
      // Top layer (y >= midY)
      new OctreeNode(
        new THREE.Box3(
          new THREE.Vector3(min.x, midY, min.z),
          new THREE.Vector3(midX, max.y, midZ)
        ),
        this.depth + 1,
        this.maxDepth,
        this.maxObjects
      ),
      new OctreeNode(
        new THREE.Box3(
          new THREE.Vector3(midX, midY, min.z),
          new THREE.Vector3(max.x, max.y, midZ)
        ),
        this.depth + 1,
        this.maxDepth,
        this.maxObjects
      ),
      new OctreeNode(
        new THREE.Box3(
          new THREE.Vector3(min.x, midY, midZ),
          new THREE.Vector3(midX, max.y, max.z)
        ),
        this.depth + 1,
        this.maxDepth,
        this.maxObjects
      ),
      new OctreeNode(
        new THREE.Box3(
          new THREE.Vector3(midX, midY, midZ),
          new THREE.Vector3(max.x, max.y, max.z)
        ),
        this.depth + 1,
        this.maxDepth,
        this.maxObjects
      )
    ];
    
    this.isLeaf = false;
    
    // Redistribute existing objects to children
    for (const obj of this.objects) {
      this._addToChildren(obj);
    }
    
    // Clear objects from this node
    this.objects = [];
  }

  /**
   * Add object to appropriate child nodes
   * @param {object} obj - Object with bounds property
   * @private
   */
  _addToChildren(obj) {
    for (const child of this.children) {
      if (child.bounds.intersectsBox(obj.bounds)) {
        child.insert(obj);
      }
    }
  }

  /**
   * Insert an object into the octree
   * @param {object} obj - Object with bounds property
   */
  insert(obj) {
    // If this node is a leaf and has space, add the object here
    if (this.isLeaf) {
      this.objects.push(obj);
      
      // Subdivide if needed and not at max depth
      if (this.objects.length > this.maxObjects && this.depth < this.maxDepth) {
        this.subdivide();
      }
      return;
    }
    
    // Otherwise, add to children
    this._addToChildren(obj);
  }

  /**
   * Find all objects that could potentially collide with the given bounds
   * @param {THREE.Box3} bounds - Bounds to check for potential collisions
   * @param {Array} result - Array to store the results
   */
  queryPotentialCollisions(bounds, result) {
    // Check if the bounds intersect with this node
    if (!this.bounds.intersectsBox(bounds)) {
      return;
    }
    
    // If this is a leaf node, add all objects to the result
    if (this.isLeaf) {
      for (const obj of this.objects) {
        result.push(obj);
      }
      return;
    }
    
    // Otherwise, check children
    for (const child of this.children) {
      child.queryPotentialCollisions(bounds, result);
    }
  }
}

/**
 * Spatial hash grid for fast dynamic object collision detection
 */
class SpatialHashGrid {
  /**
   * Create a spatial hash grid
   * @param {number} cellSize - Size of each cell
   * @param {number} worldSize - Size of the world (assumed square)
   */
  constructor(cellSize = 100, worldSize = 10000) {
    this.cellSize = cellSize;
    this.worldSize = worldSize;
    this.grid = new Map();
    
    // For optimization: avoid creating new objects in hot loops
    this._tempCellIds = [];
  }

  /**
   * Clear all objects from the grid
   */
  clear() {
    this.grid.clear();
  }

  /**
   * Get cell ID from position
   * @param {THREE.Vector3} position - Position to get cell ID for
   * @returns {string} Cell ID string
   * @private
   */
  _getCellId(position) {
    const x = Math.floor(position.x / this.cellSize);
    const y = Math.floor(position.y / this.cellSize);
    const z = Math.floor(position.z / this.cellSize);
    return `${x},${y},${z}`;
  }

  /**
   * Get all cell IDs that an object occupies
   * @param {THREE.Box3} bounds - Bounding box of the object
   * @returns {Array} Array of cell IDs
   * @private
   */
  _getCellIdsForBounds(bounds) {
    this._tempCellIds.length = 0;
    
    const minX = Math.floor(bounds.min.x / this.cellSize);
    const minY = Math.floor(bounds.min.y / this.cellSize);
    const minZ = Math.floor(bounds.min.z / this.cellSize);
    
    const maxX = Math.floor(bounds.max.x / this.cellSize);
    const maxY = Math.floor(bounds.max.y / this.cellSize);
    const maxZ = Math.floor(bounds.max.z / this.cellSize);
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          this._tempCellIds.push(`${x},${y},${z}`);
        }
      }
    }
    
    return this._tempCellIds;
  }

  /**
   * Insert an object into the grid
   * @param {object} obj - Object with id, position, and bounds properties
   */
  insertObject(obj) {
    const cellIds = this._getCellIdsForBounds(obj.bounds);
    
    for (const cellId of cellIds) {
      if (!this.grid.has(cellId)) {
        this.grid.set(cellId, new Set());
      }
      
      this.grid.get(cellId).add(obj.id);
    }
  }

  /**
   * Remove an object from the grid
   * @param {object} obj - Object with id and bounds properties
   */
  removeObject(obj) {
    const cellIds = this._getCellIdsForBounds(obj.bounds);
    
    for (const cellId of cellIds) {
      const cell = this.grid.get(cellId);
      if (cell) {
        cell.delete(obj.id);
        
        // Clean up empty cells
        if (cell.size === 0) {
          this.grid.delete(cellId);
        }
      }
    }
  }

  /**
   * Update an object's position in the grid
   * @param {object} obj - Object with id, position, and bounds properties
   * @param {THREE.Box3} oldBounds - Previous bounds of the object
   */
  updateObject(obj, oldBounds) {
    // Get old and new cell IDs
    const oldCellIds = this._getCellIdsForBounds(oldBounds);
    const newCellIds = this._getCellIdsForBounds(obj.bounds);
    
    // Find cells to remove from
    for (const cellId of oldCellIds) {
      if (!newCellIds.includes(cellId)) {
        const cell = this.grid.get(cellId);
        if (cell) {
          cell.delete(obj.id);
          
          // Clean up empty cells
          if (cell.size === 0) {
            this.grid.delete(cellId);
          }
        }
      }
    }
    
    // Find cells to add to
    for (const cellId of newCellIds) {
      if (!oldCellIds.includes(cellId)) {
        if (!this.grid.has(cellId)) {
          this.grid.set(cellId, new Set());
        }
        
        this.grid.get(cellId).add(obj.id);
      }
    }
  }

  /**
   * Find potential collisions for an object
   * @param {object} obj - Object with id and bounds properties
   * @returns {Set} Set of object IDs that could potentially collide
   */
  findPotentialCollisions(obj) {
    const cellIds = this._getCellIdsForBounds(obj.bounds);
    const potentialCollisions = new Set();
    
    for (const cellId of cellIds) {
      const cell = this.grid.get(cellId);
      if (cell) {
        for (const otherId of cell) {
          if (otherId !== obj.id) {
            potentialCollisions.add(otherId);
          }
        }
      }
    }
    
    return potentialCollisions;
  }
}

/**
 * Collision system that manages all collision detection
 */
class CollisionSystem {
  /**
   * Create a new collision system
   * @param {Object} options - Collision system options
   */
  constructor(options = {}) {
    // Default options
    this.options = Object.assign({
      worldSize: 10000,
      terrainMaxDepth: 8,
      dynamicCellSize: 100,
      collisionGroups: {
        // Define which types collide with which
        [OBJECT_TYPES.AIRCRAFT]: [OBJECT_TYPES.TERRAIN, OBJECT_TYPES.AIRCRAFT, OBJECT_TYPES.PROJECTILE, OBJECT_TYPES.STATIC_OBJECT, OBJECT_TYPES.PICKUP],
        [OBJECT_TYPES.PROJECTILE]: [OBJECT_TYPES.TERRAIN, OBJECT_TYPES.AIRCRAFT, OBJECT_TYPES.STATIC_OBJECT],
        [OBJECT_TYPES.STATIC_OBJECT]: [OBJECT_TYPES.AIRCRAFT, OBJECT_TYPES.PROJECTILE],
        [OBJECT_TYPES.PICKUP]: [OBJECT_TYPES.AIRCRAFT]
      }
    }, options);
    
    // Create octree for terrain
    const worldBounds = new THREE.Box3(
      new THREE.Vector3(-this.options.worldSize/2, -this.options.worldSize/2, -this.options.worldSize/2),
      new THREE.Vector3(this.options.worldSize/2, this.options.worldSize/2, this.options.worldSize/2)
    );
    this.terrainOctree = new OctreeNode(worldBounds, 0, this.options.terrainMaxDepth);
    
    // Create spatial hash grid for dynamic objects
    this.dynamicGrid = new SpatialHashGrid(this.options.dynamicCellSize, this.options.worldSize);
    
    // Track all objects
    this.objects = new Map();
    
    // Cached bound boxes for optimization
    this.cachedBounds = new Map();
    
    // Ray for terrain height queries
    this.heightRay = new THREE.Ray(
      new THREE.Vector3(0, 1000, 0),
      new THREE.Vector3(0, -1, 0)
    );
  }

  /**
   * Clear all collision data
   */
  clear() {
    this.terrainOctree.clear();
    this.dynamicGrid.clear();
    this.objects.clear();
    this.cachedBounds.clear();
  }

  /**
   * Add terrain chunk to collision system
   * @param {Object} terrain - Terrain chunk with bounds and heightfield
   */
  addTerrainChunk(terrain) {
    this.terrainOctree.insert({
      id: terrain.id,
      bounds: terrain.bounds,
      heightfield: terrain.heightfield,
      heightfieldScale: terrain.heightfieldScale,
      type: OBJECT_TYPES.TERRAIN
    });
    
    // Store the terrain for later lookup
    this.objects.set(terrain.id, terrain);
  }

  /**
   * Add or update an object in the collision system
   * @param {Object} obj - Object with id, position, dimensions, and type
   */
  updateObject(obj) {
    // Calculate bounding box if not provided
    if (!obj.bounds) {
      // Create a box around the object based on its dimensions
      const halfWidth = obj.dimensions.x / 2;
      const halfHeight = obj.dimensions.y / 2;
      const halfDepth = obj.dimensions.z / 2;
      
      const bounds = new THREE.Box3(
        new THREE.Vector3(
          obj.position.x - halfWidth,
          obj.position.y - halfHeight,
          obj.position.z - halfDepth
        ),
        new THREE.Vector3(
          obj.position.x + halfWidth,
          obj.position.y + halfHeight,
          obj.position.z + halfDepth
        )
      );
      
      obj.bounds = bounds;
    }
    
    // Check if object is already in the system
    if (this.objects.has(obj.id)) {
      const oldBounds = this.cachedBounds.get(obj.id);
      
      // Update spatial hash grid
      this.dynamicGrid.updateObject(obj, oldBounds);
    } else {
      // Add to spatial hash grid
      this.dynamicGrid.insertObject(obj);
    }
    
    // Update cached bounds
    this.cachedBounds.set(obj.id, obj.bounds.clone());
    
    // Store the object
    this.objects.set(obj.id, obj);
  }

  /**
   * Remove an object from the collision system
   * @param {string} objectId - ID of the object to remove
   */
  removeObject(objectId) {
    const obj = this.objects.get(objectId);
    if (obj) {
      this.dynamicGrid.removeObject(obj);
      this.objects.delete(objectId);
      this.cachedBounds.delete(objectId);
    }
  }

  /**
   * Check for collision between an object and terrain
   * @param {Object} obj - Object to check
   * @returns {Object|null} Collision data if collision occurred, null otherwise
   * @private
   */
  _checkTerrainCollision(obj) {
    // Get potential terrain chunks
    const potentialChunks = [];
    this.terrainOctree.queryPotentialCollisions(obj.bounds, potentialChunks);
    
    // If no potential chunks, no collision
    if (potentialChunks.length === 0) {
      return null;
    }
    
    // Check against each chunk
    for (const chunk of potentialChunks) {
      // Only check against terrain
      if (chunk.type !== OBJECT_TYPES.TERRAIN) continue;
      
      // Simple check: is the object's bottom below the terrain height?
      // More complex systems would do mesh-based collision
      
      // Get the height at the object's position
      const terrainHeight = this._getTerrainHeight(chunk, obj.position.x, obj.position.z);
      
      if (obj.position.y - obj.dimensions.y/2 <= terrainHeight) {
        // We have a collision
        return {
          type: 'terrain',
          terrainId: chunk.id,
          position: new THREE.Vector3(obj.position.x, terrainHeight, obj.position.z),
          normal: new THREE.Vector3(0, 1, 0) // Simplified normal
        };
      }
    }
    
    return null;
  }

  /**
   * Get terrain height at a specific position
   * @param {Object} terrain - Terrain chunk
   * @param {number} x - X coordinate
   * @param {number} z - Z coordinate
   * @returns {number} Height at the position
   * @private
   */
  _getTerrainHeight(terrain, x, z) {
    // If it's a heightfield, sample it
    if (terrain.heightfield) {
      // Convert world coordinates to heightfield indices
      const scale = terrain.heightfieldScale || { x: 1, z: 1 };
      const bounds = terrain.bounds;
      
      const relX = x - bounds.min.x;
      const relZ = z - bounds.min.z;
      
      const width = terrain.heightfield.width || terrain.heightfield.length;
      const depth = terrain.heightfield.height || terrain.heightfield[0].length;
      
      const xIndex = Math.floor(relX / scale.x);
      const zIndex = Math.floor(relZ / scale.z);
      
      // Check bounds
      if (xIndex >= 0 && xIndex < width && zIndex >= 0 && zIndex < depth) {
        // Get height from heightfield
        let height;
        if (Array.isArray(terrain.heightfield)) {
          height = terrain.heightfield[xIndex][zIndex];
        } else {
          height = terrain.heightfield.get(xIndex, zIndex);
        }
        
        return height;
      }
    }
    
    // Fallback to raycast (for simple terrain)
    if (terrain.raycastFn) {
      return terrain.raycastFn(x, z);
    }
    
    // Fallback to bounds minimum y
    return terrain.bounds.min.y;
  }

  /**
   * Check for collision between two objects
   * @param {Object} objA - First object
   * @param {Object} objB - Second object
   * @returns {Object|null} Collision data if collision occurred, null otherwise
   * @private
   */
  _checkObjectCollision(objA, objB) {
    // Check if their bounds intersect
    if (!objA.bounds.intersectsBox(objB.bounds)) {
      return null;
    }
    
    // Types of objects determine collision response
    const typeA = objA.type;
    const typeB = objB.type;
    
    // For simple objects, use sphere collision
    if ((typeA === OBJECT_TYPES.AIRCRAFT || typeA === OBJECT_TYPES.PROJECTILE) &&
        (typeB === OBJECT_TYPES.AIRCRAFT || typeB === OBJECT_TYPES.PROJECTILE)) {
      
      // Use sphere-sphere collision test for simplicity
      const posA = objA.position;
      const posB = objB.position;
      
      // Use the largest dimension for sphere radius (simple approximation)
      const radiusA = Math.max(objA.dimensions.x, objA.dimensions.y, objA.dimensions.z) / 2;
      const radiusB = Math.max(objB.dimensions.x, objB.dimensions.y, objB.dimensions.z) / 2;
      
      // Vector from A to B
      const dx = posB.x - posA.x;
      const dy = posB.y - posA.y;
      const dz = posB.z - posA.z;
      
      // Squared distance
      const distSq = dx*dx + dy*dy + dz*dz;
      
      // Sum of radii squared
      const radiiSumSq = (radiusA + radiusB) * (radiusA + radiusB);
      
      if (distSq <= radiiSumSq) {
        // We have a collision
        // Calculate exact collision point and normal
        
        const dist = Math.sqrt(distSq);
        
        // Normalized direction from A to B
        const nx = dist > 0 ? dx / dist : 0;
        const ny = dist > 0 ? dy / dist : 1;
        const nz = dist > 0 ? dz / dist : 0;
        
        // Collision point (on the surface of A's sphere)
        const collisionX = posA.x + nx * radiusA;
        const collisionY = posA.y + ny * radiusA;
        const collisionZ = posA.z + nz * radiusA;
        
        return {
          type: 'object',
          objectA: objA.id,
          objectB: objB.id,
          position: new THREE.Vector3(collisionX, collisionY, collisionZ),
          normal: new THREE.Vector3(nx, ny, nz),
          penetration: radiusA + radiusB - dist
        };
      }
    }
    
    // For static objects or specialized cases, could do more precise collision tests
    
    return null;
  }

  /**
   * Check for collisions for a specific object
   * @param {string} objectId - ID of the object to check
   * @returns {Array} Array of collision data
   */
  checkCollisions(objectId) {
    const obj = this.objects.get(objectId);
    if (!obj) return [];
    
    const collisions = [];
    
    // Check terrain collision if this object collides with terrain
    const collidesWithTypes = this.options.collisionGroups[obj.type] || [];
    
    if (collidesWithTypes.includes(OBJECT_TYPES.TERRAIN)) {
      const terrainCollision = this._checkTerrainCollision(obj);
      if (terrainCollision) {
        collisions.push(terrainCollision);
      }
    }
    
    // Check dynamic object collisions
    const potentialCollisions = this.dynamicGrid.findPotentialCollisions(obj);
    
    for (const otherId of potentialCollisions) {
      const otherObj = this.objects.get(otherId);
      
      // Skip if object doesn't exist anymore or is the same as our object
      if (!otherObj || otherId === objectId) continue;
      
      // Check if these types should collide
      if (!collidesWithTypes.includes(otherObj.type)) continue;
      
      const objectCollision = this._checkObjectCollision(obj, otherObj);
      if (objectCollision) {
        collisions.push(objectCollision);
      }
    }
    
    return collisions;
  }

  /**
   * Check for collisions for all objects
   * @returns {Map} Map of object IDs to collision arrays
   */
  checkAllCollisions() {
    const results = new Map();
    
    // Check each object
    for (const [id, obj] of this.objects) {
      // Skip terrain chunks
      if (obj.type === OBJECT_TYPES.TERRAIN) continue;
      
      const collisions = this.checkCollisions(id);
      
      if (collisions.length > 0) {
        results.set(id, collisions);
      }
    }
    
    return results;
  }

  /**
   * Get approximate height at a position
   * @param {number} x - X coordinate
   * @param {number} z - Z coordinate
   * @returns {number} Height at the position or 0 if no terrain
   */
  getHeightAt(x, z) {
    // Set ray position
    this.heightRay.origin.set(x, 1000, z);
    
    // Get potential terrain chunks
    const testBox = new THREE.Box3(
      new THREE.Vector3(x - 0.1, -1000, z - 0.1),
      new THREE.Vector3(x + 0.1, 1000, z + 0.1)
    );
    
    const potentialChunks = [];
    this.terrainOctree.queryPotentialCollisions(testBox, potentialChunks);
    
    // If no potential chunks, return 0
    if (potentialChunks.length === 0) {
      return 0;
    }
    
    // Find the highest terrain point
    let maxHeight = -Infinity;
    
    for (const chunk of potentialChunks) {
      if (chunk.type === OBJECT_TYPES.TERRAIN) {
        const height = this._getTerrainHeight(chunk, x, z);
        maxHeight = Math.max(maxHeight, height);
      }
    }
    
    return maxHeight !== -Infinity ? maxHeight : 0;
  }

  /**
   * Cast a ray into the world and find what it hits
   * @param {THREE.Ray} ray - Ray to cast
   * @param {number} maxDistance - Maximum distance to cast
   * @param {Array} objectTypes - Types of objects to check against
   * @returns {Object|null} Intersection data or null if no hit
   */
  raycast(ray, maxDistance = Infinity, objectTypes = null) {
    // Default to all object types if not specified
    const types = objectTypes || Object.values(OBJECT_TYPES);
    
    let closestHit = null;
    let closestDistance = maxDistance;
    
    // Create a bounding box along the ray
    const rayBox = new THREE.Box3();
    
    // Expand the box to cover the ray up to max distance
    if (maxDistance < Infinity) {
      const farPoint = ray.origin.clone().add(ray.direction.clone().multiplyScalar(maxDistance));
      rayBox.expandByPoint(ray.origin);
      rayBox.expandByPoint(farPoint);
    } else {
      // For infinite rays, use a large box centered on the origin
      const farPoint = ray.origin.clone().add(ray.direction.clone().multiplyScalar(this.options.worldSize));
      rayBox.expandByPoint(ray.origin);
      rayBox.expandByPoint(farPoint);
    }
    
    // Check against terrain
    if (types.includes(OBJECT_TYPES.TERRAIN)) {
      const potentialChunks = [];
      this.terrainOctree.queryPotentialCollisions(rayBox, potentialChunks);
      
      for (const chunk of potentialChunks) {
        if (chunk.type !== OBJECT_TYPES.TERRAIN) continue;
        
        // Simplified terrain raycast (box intersection)
        const box = chunk.bounds;
        const intersection = ray.intersectBox(box, new THREE.Vector3());
        
        if (intersection && intersection.distanceTo(ray.origin) < closestDistance) {
          // Refine with heightfield if available
          if (chunk.heightfield) {
            // Get height at intersection point
            const height = this._getTerrainHeight(chunk, intersection.x, intersection.z);
            
            // Check if ray hits at this height
            const t = (height - ray.origin.y) / ray.direction.y;
            
            if (t >= 0 && t < closestDistance) {
              const hitPoint = ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));
              
              // Ensure hit point is within chunk bounds (x/z)
              if (hitPoint.x >= box.min.x && hitPoint.x <= box.max.x &&
                  hitPoint.z >= box.min.z && hitPoint.z <= box.max.z) {
                
                closestDistance = t;
                closestHit = {
                  distance: t,
                  point: hitPoint.clone(),
                  normal: new THREE.Vector3(0, 1, 0), // Simplified normal
                  object: chunk
                };
              }
            }
          } else {
            // Simple box hit if no heightfield
            closestDistance = intersection.distanceTo(ray.origin);
            closestHit = {
              distance: closestDistance,
              point: intersection.clone(),
              normal: new THREE.Vector3(0, 1, 0),
              object: chunk
            };
          }
        }
      }
    }
    
    // Check against dynamic objects
    for (const [id, obj] of this.objects) {
      // Skip terrain (already checked) and anything not in our types list
      if (obj.type === OBJECT_TYPES.TERRAIN || !types.includes(obj.type)) continue;
      
      // Skip objects whose bounds don't intersect the ray's box
      if (!obj.bounds.intersectsBox(rayBox)) continue;
      
      // Do sphere intersection test for simplicity
      const sphere = new THREE.Sphere(
        obj.position, 
        Math.max(obj.dimensions.x, obj.dimensions.y, obj.dimensions.z) / 2
      );
      
      const intersection = new THREE.Vector3();
      const didHit = ray.intersectSphere(sphere, intersection);
      
      if (didHit) {
        const distance = intersection.distanceTo(ray.origin);
        
        if (distance < closestDistance) {
          closestDistance = distance;
          
          // Calculate normal at hit point (from center of object to hit point)
          const normal = intersection.clone().sub(obj.position).normalize();
          
          closestHit = {
            distance,
            point: intersection.clone(),
            normal,
            object: obj
          };
        }
      }
    }
    
    return closestHit;
  }
}

module.exports = {
  CollisionSystem,
  OBJECT_TYPES
};