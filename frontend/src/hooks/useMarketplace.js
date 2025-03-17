import { useState, useEffect, useCallback } from 'react';
import { useWallet } from './useWallet';
import { NFTService } from '../services/NFTService';
import { ethers } from 'ethers';

/**
 * Hook to interact with NFT marketplace
 * @returns {Object} Marketplace methods and state
 */
export const useMarketplace = () => {
  const { provider, signer } = useWallet();
  const [nftService, setNftService] = useState(null);
  const [listedAircraft, setListedAircraft] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Initialize NFT service when provider and signer are available
  useEffect(() => {
    if (provider && signer) {
      setNftService(new NFTService(signer, provider));
    }
  }, [provider, signer]);
  
  // Fetch all aircraft listed for sale
  const fetchListedAircraft = useCallback(async () => {
    if (!nftService) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // This is a mock implementation
      // In a real implementation, we would fetch all active listings from the contract
      
      const marketplaceAddress = process.env.VITE_MARKETPLACE_CONTRACT_ADDRESS;
      const nftAddress = process.env.VITE_NFT_CONTRACT_ADDRESS;
      
      // Create marketplace contract instance (read-only)
      const marketplaceABI = [
        "function getActiveListings() external view returns (uint256[] memory)"
      ];
      const marketplaceContract = new ethers.Contract(
        marketplaceAddress,
        marketplaceABI,
        provider
      );
      
      // Get active listing IDs
      const activeListingIds = await marketplaceContract.getActiveListings();
      
      // Fetch metadata for each listed NFT
      const listedItems = await Promise.all(
        activeListingIds.map(async (tokenId) => {
          return await nftService.getNFTMetadata(tokenId);
        })
      );
      
      setListedAircraft(listedItems);
      return listedItems;
    } catch (err) {
      console.error('Error fetching listed aircraft:', err);
      setError(err.message || 'Failed to fetch listed aircraft');
    } finally {
      setLoading(false);
    }
  }, [nftService, provider]);
  
  // Buy aircraft
  const buyAircraft = useCallback(async (tokenId, price) => {
    if (!nftService) {
      throw new Error('NFT service not initialized');
    }
    
    try {
      const tx = await nftService.buyNFT(tokenId, price);
      await tx.wait();
      
      // Refresh marketplace after purchase
      await fetchListedAircraft();
      
      return tx;
    } catch (err) {
      console.error('Error buying aircraft:', err);
      throw err;
    }
  }, [nftService, fetchListedAircraft]);
  
  // Initial fetch of listed aircraft
  useEffect(() => {
    if (nftService) {
      fetchListedAircraft();
    }
  }, [nftService, fetchListedAircraft]);
  
  return {
    listedAircraft,
    loading,
    error,
    fetchListedAircraft,
    buyAircraft
  };
};