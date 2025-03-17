import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import AircraftCard from '../ui/AircraftCard';
import LoadingSpinner from '../ui/LoadingSpinner';
import { useGameContext } from '../contexts/GameContext';
import { useWalletContext } from '../contexts/WalletContext';

/**
 * Component for selecting aircraft before a match.
 */
const AircraftSelector = ({
  onSelect,
  selectedAircraftId = null,
  showNFTsOnly = false,
  className = '',
}) => {
  const { gameInstance } = useGameContext();
  const { isWalletConnected, connectWallet } = useWalletContext();
  
  const [aircraft, setAircraft] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(showNFTsOnly ? 'nft' : 'owned');
  const [purchasingAircraft, setPurchasingAircraft] = useState(null);
  const [rotatingModels, setRotatingModels] = useState(new Set());
  
  // Fetch available aircraft
  useEffect(() => {
    if (!gameInstance) return;
    
    const fetchAircraft = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch aircraft based on active tab
        let aircraftList = [];
        
        if (activeTab === 'owned') {
          // Get owned aircraft from game instance
          aircraftList = await gameInstance.getOwnedAircraft();
        } else if (activeTab === 'nft') {
          // Get NFT aircraft from game instance
          if (!isWalletConnected) {
            // No wallet connected, prompt user to connect
            throw new Error('Please connect your wallet to view NFT aircraft.');
          }
          
          aircraftList = await gameInstance.getNFTAircraft();
        } else if (activeTab === 'store') {
          // Get store aircraft from game instance
          aircraftList = await gameInstance.getStoreAircraft();
        }
        
        setAircraft(aircraftList);
      } catch (err) {
        console.error('Error fetching aircraft:', err);
        setError(err.message || 'Failed to load aircraft.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchAircraft();
  }, [gameInstance, activeTab, isWalletConnected]);
  
  // Handle aircraft selection
  const handleSelectAircraft = (aircraft) => {
    if (onSelect) {
      onSelect(aircraft);
    }
  };
  
  // Handle aircraft view details
  const handleViewAircraft = (aircraft) => {
    // Start rotating model
    setRotatingModels(prev => new Set(prev).add(aircraft.id));
  };
  
  // Handle aircraft purchase
  const handlePurchaseAircraft = async (aircraft) => {
    if (!gameInstance) return;
    
    try {
      setPurchasingAircraft(aircraft.id);
      
      // Check if wallet is connected for NFT aircraft
      if (aircraft.isNFT && !isWalletConnected) {
        await connectWallet();
      }
      
      // Purchase aircraft
      const result = await gameInstance.purchaseAircraft(aircraft.id);
      
      if (result.success) {
        // Show success notification
        window.notify.success(`Successfully purchased ${aircraft.name}!`, {
          title: 'Purchase Successful',
        });
        
        // Refresh aircraft list
        setActiveTab('owned');
      } else {
        throw new Error(result.error || 'Purchase failed');
      }
    } catch (err) {
      console.error('Error purchasing aircraft:', err);
      
      // Show error notification
      window.notify.error(err.message || 'Failed to purchase aircraft.', {
        title: 'Purchase Failed',
      });
    } finally {
      setPurchasingAircraft(null);
    }
  };
  
  // Filter aircraft for display
  const filteredAircraft = aircraft;
  
  // Group aircraft by type
  const groupedAircraft = filteredAircraft.reduce((groups, aircraft) => {
    const type = aircraft.type || 'Unknown';
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(aircraft);
    return groups;
  }, {});
  
  return (
    <Card 
      title="Select Aircraft" 
      className={`${className}`}
    >
      {/* Tabs for different aircraft categories */}
      <div className="flex border-b border-slate-700 mb-4 -mt-2">
        <button
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'owned' 
              ? 'text-sky-400 border-b-2 border-sky-400' 
              : 'text-slate-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('owned')}
          disabled={showNFTsOnly}
        >
          Your Aircraft
        </button>
        
        <button
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'nft' 
              ? 'text-sky-400 border-b-2 border-sky-400' 
              : 'text-slate-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('nft')}
        >
          NFT Collection
        </button>
        
        <button
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'store' 
              ? 'text-sky-400 border-b-2 border-sky-400' 
              : 'text-slate-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('store')}
          disabled={showNFTsOnly}
        >
          Aircraft Store
        </button>
      </div>
      
      {/* Loading state */}
      {loading && (
        <div className="py-12 flex justify-center">
          <LoadingSpinner size="lg" label="Loading aircraft..." />
        </div>
      )}
      
      {/* Error state */}
      {error && !loading && (
        <div className="py-8 text-center">
          <div className="text-red-400 mb-4">{error}</div>
          
          {activeTab === 'nft' && !isWalletConnected && (
            <Button 
              variant="primary"
              onClick={connectWallet}
            >
              Connect Wallet
            </Button>
          )}
        </div>
      )}
      
      {/* Empty state */}
      {!loading && !error && filteredAircraft.length === 0 && (
        <div className="py-8 text-center text-slate-400">
          {activeTab === 'owned' && 'You don\'t own any aircraft yet.'}
          {activeTab === 'nft' && 'You don\'t own any NFT aircraft yet.'}
          {activeTab === 'store' && 'No aircraft available in the store.'}
          
          {activeTab === 'owned' && (
            <div className="mt-4">
              <Button 
                variant="primary"
                onClick={() => setActiveTab('store')}
              >
                Browse Aircraft Store
              </Button>
            </div>
          )}
          
          {activeTab === 'nft' && (
            <div className="mt-4">
              <Button 
                variant="primary"
                onClick={() => window.open('https://marketplace.skywars-game.com', '_blank')}
              >
                Visit NFT Marketplace
              </Button>
            </div>
          )}
        </div>
      )}
      
      {/* Aircraft list */}
      {!loading && !error && Object.keys(groupedAircraft).length > 0 && (
        <div className="space-y-6">
          {Object.entries(groupedAircraft).map(([type, typeAircraft]) => (
            <div key={type}>
              <h3 className="text-lg font-medium text-white mb-3">{type}</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {typeAircraft.map((aircraft) => (
                  <AircraftCard
                    key={aircraft.id}
                    aircraft={aircraft}
                    isOwned={activeTab !== 'store'}
                    isEquipped={aircraft.id === selectedAircraftId}
                    isNFT={aircraft.isNFT || activeTab === 'nft'}
                    onEquip={() => handleSelectAircraft(aircraft)}
                    onView={() => handleViewAircraft(aircraft)}
                    onPurchase={() => handlePurchaseAircraft(aircraft)}
                    tokenSymbol="SKY"
                    disabled={false}
                    loading={purchasingAircraft === aircraft.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

AircraftSelector.propTypes = {
  onSelect: PropTypes.func.isRequired,
  selectedAircraftId: PropTypes.string,
  showNFTsOnly: PropTypes.bool,
  className: PropTypes.string,
};

export default AircraftSelector;