import React, { useState, useEffect } from 'react';
import { useMarketplace } from '../../blockchain/hooks/useMarketplace';
import { useWallet } from '../../blockchain/hooks/useWallet';
import { useTokenBalance } from '../../blockchain/hooks/useTokenBalance';
import { formatEther, parseEther } from 'ethers';

const Marketplace = () => {
  const { account, isConnected } = useWallet();
  const { balance } = useTokenBalance(account);
  const { 
    listedAircraft, 
    fetchListedAircraft, 
    buyAircraft, 
    loading, 
    error 
  } = useMarketplace();
  
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [sortOption, setSortOption] = useState('price-asc');
  const [filteredAircraft, setFilteredAircraft] = useState([]);
  const [purchaseStatus, setPurchaseStatus] = useState({ status: '', message: '' });

  // Apply filters and sorting
  useEffect(() => {
    if (!listedAircraft) return;
    
    let filtered = [...listedAircraft];
    
    // Apply type filter
    if (selectedFilter !== 'all') {
      filtered = filtered.filter(aircraft => aircraft.attributes.type === selectedFilter);
    }
    
    // Apply sorting
    switch (sortOption) {
      case 'price-asc':
        filtered.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        break;
      case 'price-desc':
        filtered.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
        break;
      case 'rarity-desc':
        filtered.sort((a, b) => b.attributes.rarity - a.attributes.rarity);
        break;
      case 'speed-desc':
        filtered.sort((a, b) => b.attributes.speed - a.attributes.speed);
        break;
      default:
        break;
    }
    
    setFilteredAircraft(filtered);
  }, [listedAircraft, selectedFilter, sortOption]);

  useEffect(() => {
    fetchListedAircraft();
    // Refresh marketplace data every 30 seconds
    const interval = setInterval(fetchListedAircraft, 30000);
    return () => clearInterval(interval);
  }, [fetchListedAircraft]);

  const handleBuy = async (aircraft) => {
    if (!isConnected) {
      setPurchaseStatus({
        status: 'error',
        message: 'Please connect your wallet first'
      });
      return;
    }

    // Check if user has enough tokens
    if (balance && parseEther(aircraft.price) > balance) {
      setPurchaseStatus({
        status: 'error',
        message: 'Insufficient tokens for purchase'
      });
      return;
    }

    try {
      setPurchaseStatus({
        status: 'loading',
        message: 'Processing purchase...',
        aircraftId: aircraft.tokenId
      });
      
      await buyAircraft(aircraft.tokenId, aircraft.price);
      
      setPurchaseStatus({
        status: 'success',
        message: 'Purchase successful!',
        aircraftId: null
      });
      
      // Refresh marketplace after purchase
      setTimeout(() => {
        fetchListedAircraft();
        setPurchaseStatus({ status: '', message: '' });
      }, 3000);
      
    } catch (err) {
      setPurchaseStatus({
        status: 'error',
        message: err.message || 'Purchase failed',
        aircraftId: null
      });
    }
  };

  return (
    <div className="marketplace">
      <div className="marketplace__header">
        <h2 className="marketplace__title">Aircraft Marketplace</h2>
        
        <div className="marketplace__controls">
          <div className="marketplace__filter">
            <label htmlFor="type-filter">Type:</label>
            <select 
              id="type-filter"
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="fighter">Fighter</option>
              <option value="bomber">Bomber</option>
              <option value="interceptor">Interceptor</option>
              <option value="scout">Scout</option>
            </select>
          </div>
          
          <div className="marketplace__sort">
            <label htmlFor="sort-option">Sort By:</label>
            <select 
              id="sort-option"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
            >
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="rarity-desc">Rarity: Highest</option>
              <option value="speed-desc">Speed: Highest</option>
            </select>
          </div>
        </div>
      </div>
      
      {loading ? (
        <div className="marketplace__loading">Loading marketplace...</div>
      ) : error ? (
        <div className="marketplace__error">
          Error loading marketplace: {error}
          <button onClick={fetchListedAircraft}>Retry</button>
        </div>
      ) : filteredAircraft.length === 0 ? (
        <div className="marketplace__empty">
          No aircraft available matching your criteria
        </div>
      ) : (
        <div className="marketplace__grid">
          {filteredAircraft.map((aircraft) => (
            <div key={aircraft.tokenId} className="marketplace__item">
              <div className="marketplace__item-image">
                <img 
                  src={aircraft.image || '/assets/images/default-aircraft.png'} 
                  alt={aircraft.name}
                />
              </div>
              
              <div className="marketplace__item-details">
                <h3 className="marketplace__item-name">{aircraft.name}</h3>
                <p className="marketplace__item-type">{aircraft.attributes.type}</p>
                
                <div className="marketplace__item-stats">
                  <div className="marketplace__item-stat">
                    <span>Speed:</span>
                    <div className="marketplace__stat-bar">
                      <div 
                        style={{ width: `${aircraft.attributes.speed}%` }}
                        className="marketplace__stat-fill"
                      ></div>
                    </div>
                  </div>
                  
                  <div className="marketplace__item-stat">
                    <span>Armor:</span>
                    <div className="marketplace__stat-bar">
                      <div 
                        style={{ width: `${aircraft.attributes.armor}%` }}
                        className="marketplace__stat-fill"
                      ></div>
                    </div>
                  </div>
                </div>
                
                <div className="marketplace__item-price">
                  <span>{aircraft.price} SKY</span>
                </div>
                
                <button 
                  className="marketplace__buy-button"
                  onClick={() => handleBuy(aircraft)}
                  disabled={
                    purchaseStatus.status === 'loading' && 
                    purchaseStatus.aircraftId === aircraft.tokenId
                  }
                >
                  {purchaseStatus.status === 'loading' && 
                   purchaseStatus.aircraftId === aircraft.tokenId
                    ? 'Processing...'
                    : 'Buy Now'}
                </button>
                
                {purchaseStatus.status && 
                 purchaseStatus.aircraftId === aircraft.tokenId && (
                  <div className={`marketplace__status marketplace__status--${purchaseStatus.status}`}>
                    {purchaseStatus.message}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {purchaseStatus.status && !purchaseStatus.aircraftId && (
        <div className={`marketplace__global-status marketplace__global-status--${purchaseStatus.status}`}>
          {purchaseStatus.message}
        </div>
      )}
    </div>
  );
};

export default Marketplace;