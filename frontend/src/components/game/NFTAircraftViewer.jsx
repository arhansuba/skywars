import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import LoadingSpinner from '../ui/LoadingSpinner';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { useWalletContext } from '../contexts/WalletContext';

/**
 * Component for viewing NFT aircraft details in 3D.
 */
const NFTAircraftViewer = ({
  nft,
  onClose,
  onEquip,
  className = '',
}) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const modelRef = useRef(null);
  
  const { tokenBalance } = useWalletContext();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isEquipping, setIsEquipping] = useState(false);
  
  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current || !nft || !nft.modelUrl) return;
    
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Initialize scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    sceneRef.current = scene;
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    
    // Add opposing directional light
    const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
    backLight.position.set(-1, -1, -1);
    scene.add(backLight);
    
    // Initialize camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(5, 2, 5);
    cameraRef.current = camera;
    
    // Initialize renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Initialize controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1;
    controlsRef.current = controls;
    
    // Load 3D model
    const loader = new GLTFLoader();
    loader.load(
      // URL
      nft.modelUrl,
      // Success callback
      (gltf) => {
        const model = gltf.scene;
        
        // Center model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        
        // Scale model to fit
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 3 / maxDim;
        model.scale.multiplyScalar(scale);
        
        // Add model to scene
        scene.add(model);
        modelRef.current = model;
        
        // Position camera to look at model
        camera.lookAt(0, 0, 0);
        
        setLoading(false);
      },
      // Progress callback
      (xhr) => {
        const progress = (xhr.loaded / xhr.total) * 100;
        console.log(`Loading model: ${progress.toFixed(2)}%`);
      },
      // Error callback
      (error) => {
        console.error('Error loading model:', error);
        setError('Failed to load 3D model');
        setLoading(false);
      }
    );
    
    // Add ground plane with grid
    const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
    scene.add(gridHelper);
    
    // Animation loop
    const animate = () => {
      const animationId = requestAnimationFrame(animate);
      
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      
      if (rendererRef.current && cameraRef.current && sceneRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      
      return animationId;
    };
    
    const animationId = animate();
    
    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      
      rendererRef.current.setSize(width, height);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Clean up
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      
      if (rendererRef.current && rendererRef.current.domElement) {
        container.removeChild(rendererRef.current.domElement);
      }
      
      // Dispose Three.js resources
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      
      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            if (object.geometry) {
              object.geometry.dispose();
            }
            
            if (object.material) {
              if (Array.isArray(object.material)) {
                object.material.forEach((material) => material.dispose());
              } else {
                object.material.dispose();
              }
            }
          }
        });
      }
    };
  }, [nft]);
  
  // Handle equip button click
  const handleEquip = async () => {
    if (!nft || isEquipping) return;
    
    try {
      setIsEquipping(true);
      
      // Call the onEquip callback
      if (onEquip) {
        await onEquip(nft);
      }
    } catch (err) {
      console.error('Error equipping NFT:', err);
      
      // Show error notification
      window.notify.error('Failed to equip aircraft', {
        title: 'Error',
      });
    } finally {
      setIsEquipping(false);
    }
  };
  
  // Toggle auto-rotation
  const toggleAutoRotation = () => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = !controlsRef.current.autoRotate;
    }
  };
  
  // Reset camera view
  const resetCamera = () => {
    if (cameraRef.current && controlsRef.current) {
      // Reset camera position
      cameraRef.current.position.set(5, 2, 5);
      cameraRef.current.lookAt(0, 0, 0);
      
      // Reset controls
      controlsRef.current.reset();
    }
  };
  
  if (!nft) return null;
  
  return (
    <Card 
      title={
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <span>{nft.name}</span>
            <span className="ml-2 text-xs px-2 py-0.5 bg-indigo-900 rounded-full text-indigo-200">
              {nft.rarity}
            </span>
          </div>
          <button
            className="text-slate-400 hover:text-white"
            onClick={onClose}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      }
      variant="nft"
      className={`max-w-5xl w-full mx-auto ${className}`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 3D Viewer */}
        <div className="lg:col-span-2">
          <div 
            ref={containerRef}
            className="relative w-full h-80 lg:h-96 bg-slate-900 rounded-lg overflow-hidden"
          >
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10">
                <LoadingSpinner size="lg" label="Loading 3D model..." />
              </div>
            )}
            
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 z-10">
                <div className="text-red-400 mb-4">{error}</div>
                <img 
                  src={nft.image} 
                  alt={nft.name}
                  className="max-h-40 max-w-full object-contain"
                />
              </div>
            )}
            
            {/* Controls overlay */}
            <div className="absolute bottom-4 right-4 flex space-x-2 z-10">
              <button
                className="p-2 bg-slate-800/80 rounded-full hover:bg-slate-700/80 transition-colors"
                onClick={toggleAutoRotation}
                title="Toggle auto-rotation"
              >
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              
              <button
                className="p-2 bg-slate-800/80 rounded-full hover:bg-slate-700/80 transition-colors"
                onClick={resetCamera}
                title="Reset camera"
              >
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex border-b border-slate-700 mt-4">
            <button
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'overview' 
                  ? 'text-sky-400 border-b-2 border-sky-400' 
                  : 'text-slate-400 hover:text-white'
              }`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            
            <button
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'specs' 
                  ? 'text-sky-400 border-b-2 border-sky-400' 
                  : 'text-slate-400 hover:text-white'
              }`}
              onClick={() => setActiveTab('specs')}
            >
              Specifications
            </button>
            
            <button
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'blockchain' 
                  ? 'text-sky-400 border-b-2 border-sky-400' 
                  : 'text-slate-400 hover:text-white'
              }`}
              onClick={() => setActiveTab('blockchain')}
            >
              Blockchain
            </button>
          </div>
          
          {/* Tab content */}
          <div className="mt-4">
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <p className="text-slate-300">{nft.description}</p>
                
                {nft.history && (
                  <div>
                    <h3 className="text-white font-medium mb-2">History</h3>
                    <p className="text-slate-300">{nft.history}</p>
                  </div>
                )}
              </div>
            )}
            
            {activeTab === 'specs' && (
              <div className="space-y-4">
                {/* Stats */}
                <div>
                  <h3 className="text-white font-medium mb-2">Performance</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(nft.stats || {}).map(([stat, value]) => (
                      <div key={stat} className="flex items-center">
                        <div className="w-32 flex-shrink-0">
                          <span className="text-sm capitalize text-slate-300">
                            {stat}
                          </span>
                        </div>
                        
                        <div className="flex-grow h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${
                              stat === 'speed' ? 'bg-sky-500' :
                              stat === 'maneuverability' ? 'bg-green-500' :
                              stat === 'firepower' ? 'bg-red-500' :
                              stat === 'durability' ? 'bg-yellow-500' :
                              stat === 'stealth' ? 'bg-indigo-500' :
                              'bg-slate-500'
                            }`} 
                            style={{ width: `${value * 10}%` }}
                          ></div>
                        </div>
                        
                        <span className="text-sm text-white ml-2 w-6 text-right">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Weapons */}
                {nft.weapons && nft.weapons.length > 0 && (
                  <div>
                    <h3 className="text-white font-medium mb-2">Weapons</h3>
                    
                    <div className="space-y-2">
                      {nft.weapons.map((weapon, index) => (
                        <div key={index} className="bg-slate-800/50 p-2 rounded-md flex items-center">
                          {weapon.icon && (
                            <img 
                              src={weapon.icon} 
                              alt={weapon.name} 
                              className="w-6 h-6 mr-2"
                            />
                          )}
                          <div className="flex-grow">
                            <div className="text-white">{weapon.name}</div>
                            <div className="text-sm text-slate-400">{weapon.description}</div>
                          </div>
                          <div className="text-sm text-yellow-400">
                            {weapon.damage && `${weapon.damage} dmg`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Special abilities */}
                {nft.abilities && nft.abilities.length > 0 && (
                  <div>
                    <h3 className="text-white font-medium mb-2">Special Abilities</h3>
                    
                    <div className="space-y-2">
                      {nft.abilities.map((ability, index) => (
                        <div key={index} className="bg-slate-800/50 p-2 rounded-md">
                          <div className="text-sky-400">{ability.name}</div>
                          <div className="text-sm text-slate-300">{ability.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {activeTab === 'blockchain' && (
              <div className="space-y-4">
                {/* Token info */}
                <div>
                  <h3 className="text-white font-medium mb-2">Token Information</h3>
                  
                  <div className="bg-slate-800/50 p-3 rounded-md">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-slate-400">Token ID</div>
                        <div className="text-white">{nft.tokenId}</div>
                      </div>
                      
                      <div>
                        <div className="text-sm text-slate-400">Contract</div>
                        <div className="text-white truncate">
                          {nft.contractAddress}
                        </div>
                      </div>
                      
                      <div>
                        <div className="text-sm text-slate-400">Minted</div>
                        <div className="text-white">
                          {new Date(nft.mintedAt).toLocaleDateString()}
                        </div>
                      </div>
                      
                      <div>
                        <div className="text-sm text-slate-400">Rarity</div>
                        <div className="text-white">{nft.rarity}</div>
                      </div>
                    </div>
                    
                    <div className="mt-3">
                      <div className="text-sm text-slate-400">Metadata URI</div>
                      <div className="text-white text-sm truncate">
                        {nft.metadataUri}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Attributes */}
                {nft.attributes && nft.attributes.length > 0 && (
                  <div>
                    <h3 className="text-white font-medium mb-2">Attributes</h3>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {nft.attributes.map((attr, index) => (
                        <div key={index} className="bg-slate-800/50 p-2 rounded-md">
                          <div className="text-xs text-slate-400">{attr.trait_type}</div>
                          <div className="text-white">{attr.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Blockchain explorer link */}
                <div className="text-center">
                  <a 
                    href={`https://etherscan.io/token/${nft.contractAddress}?a=${nft.tokenId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:text-sky-300 text-sm"
                  >
                    View on blockchain explorer →
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Sidebar */}
        <div className="space-y-4">
          {/* Owner info */}
          <div className="bg-slate-800/50 p-4 rounded-lg">
            <h3 className="text-white font-medium mb-2">Owner</h3>
            
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full bg-indigo-900 flex items-center justify-center mr-3">
                <svg className="w-6 h-6 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <div className="text-white">{nft.owner?.name || 'You'}</div>
                <div className="text-xs text-slate-400 truncate">
                  {nft.owner?.address || '0x...'}
                </div>
              </div>
            </div>
          </div>
          
          {/* Action buttons */}
          <Button
            variant="primary"
            fullWidth
            size="lg"
            onClick={handleEquip}
            disabled={isEquipping}
          >
            {isEquipping ? 'Equipping...' : 'Equip Aircraft'}
          </Button>
          
          {/* NFT market info */}
          <div className="bg-slate-800/50 p-4 rounded-lg">
            <h3 className="text-white font-medium mb-2">Market Info</h3>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Floor Price</span>
                <span className="text-white">{nft.floorPrice || 'N/A'} SKY</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-slate-400">Last Sale</span>
                <span className="text-white">{nft.lastSalePrice || 'N/A'} SKY</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-slate-400">Total Supply</span>
                <span className="text-white">{nft.rarity === 'Unique' ? '1' : nft.totalSupply || 'N/A'}</span>
              </div>
            </div>
            
            {/* Market link */}
            <div className="mt-3">
              <a 
                href="https://marketplace.skywars-game.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:text-sky-300 text-sm block text-center"
              >
                View on Marketplace →
              </a>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

NFTAircraftViewer.propTypes = {
  nft: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    image: PropTypes.string.isRequired,
    modelUrl: PropTypes.string,
    tokenId: PropTypes.string.isRequired,
    contractAddress: PropTypes.string,
    rarity: PropTypes.string,
    stats: PropTypes.object,
    weapons: PropTypes.array,
    abilities: PropTypes.array,
    attributes: PropTypes.array,
    history: PropTypes.string,
    owner: PropTypes.object,
    metadataUri: PropTypes.string,
    mintedAt: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    floorPrice: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    lastSalePrice: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    totalSupply: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),
  onClose: PropTypes.func.isRequired,
  onEquip: PropTypes.func,
  className: PropTypes.string,
};

export default NFTAircraftViewer;