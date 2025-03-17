import React, { useState } from 'react';
import { useNFTService } from '../../blockchain/hooks/useNFTService';

const AircraftNFTCard = ({ nft, onSelect, isSelected }) => {
  const { listForSale } = useNFTService();
  const [price, setPrice] = useState('');
  const [showSellModal, setShowSellModal] = useState(false);
  const [isSelling, setIsSelling] = useState(false);
  const [error, setError] = useState('');

  // NFT properties to display
  const properties = [
    { name: 'Speed', value: nft.attributes.speed, max: 100 },
    { name: 'Handling', value: nft.attributes.handling, max: 100 },
    { name: 'Armor', value: nft.attributes.armor, max: 100 },
    { name: 'Firepower', value: nft.attributes.firepower, max: 100 },
  ];

  const handleSell = async () => {
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      setError('Please enter a valid price');
      return;
    }

    try {
      setIsSelling(true);
      setError('');
      await listForSale(nft.tokenId, price);
      setShowSellModal(false);
    } catch (err) {
      setError(err.message || 'Failed to list aircraft for sale');
    } finally {
      setIsSelling(false);
    }
  };

  return (
    <div className={`aircraft-nft-card ${isSelected ? 'aircraft-nft-card--selected' : ''}`}>
      <div className="aircraft-nft-card__preview" onClick={() => onSelect(nft)}>
        <img 
          src={nft.image || '/assets/images/default-aircraft.png'} 
          alt={nft.name} 
          className="aircraft-nft-card__image" 
        />
        {nft.isForSale && (
          <div className="aircraft-nft-card__for-sale">
            For Sale: {nft.price} SKY
          </div>
        )}
      </div>
      
      <div className="aircraft-nft-card__details">
        <h3 className="aircraft-nft-card__name">{nft.name}</h3>
        
        <div className="aircraft-nft-card__properties">
          {properties.map((prop) => (
            <div key={prop.name} className="aircraft-nft-card__property">
              <span className="aircraft-nft-card__property-name">{prop.name}</span>
              <div className="aircraft-nft-card__property-bar">
                <div 
                  className="aircraft-nft-card__property-fill"
                  style={{ width: `${(prop.value / prop.max) * 100}%` }}
                ></div>
              </div>
              <span className="aircraft-nft-card__property-value">{prop.value}</span>
            </div>
          ))}
        </div>
        
        <div className="aircraft-nft-card__actions">
          <button 
            className="aircraft-nft-card__select-btn"
            onClick={() => onSelect(nft)}
          >
            {isSelected ? 'Selected' : 'Select'}
          </button>
          
          {!nft.isForSale && (
            <button 
              className="aircraft-nft-card__sell-btn"
              onClick={() => setShowSellModal(true)}
            >
              Sell
            </button>
          )}
        </div>
      </div>
      
      {showSellModal && (
        <div className="aircraft-nft-card__sell-modal">
          <div className="aircraft-nft-card__sell-modal-content">
            <h3>List Aircraft for Sale</h3>
            <p>Set a price for your {nft.name}</p>
            
            <div className="aircraft-nft-card__price-input">
              <input
                type="number"
                placeholder="Price in SKY tokens"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                min="0"
                step="0.01"
              />
              <span>SKY</span>
            </div>
            
            {error && <p className="aircraft-nft-card__error">{error}</p>}
            
            <div className="aircraft-nft-card__sell-modal-actions">
              <button 
                className="aircraft-nft-card__cancel-btn"
                onClick={() => setShowSellModal(false)}
                disabled={isSelling}
              >
                Cancel
              </button>
              <button 
                className="aircraft-nft-card__confirm-btn"
                onClick={handleSell}
                disabled={isSelling}
              >
                {isSelling ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AircraftNFTCard;