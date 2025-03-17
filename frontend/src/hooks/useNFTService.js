import { useState, useEffect, useCallback } from 'react';
import { useWallet } from './useWallet';
import { NFTService } from '../services/NFTService';

/**
 * Hook to interact with NFT service
 * @returns {Object} NFT service methods and state
 */
export const useNFTService = () => {
  const { provider, signer, account } = useWallet();
  const [nftService, setNftService] = useState(null);
  const [ownedNFTs, setOwnedNFTs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Initialize NFT service when provider and signer are available
  useEffect(() => {
    if (provider && signer) {
      setNftService(new NFTService(signer, provider));
    }
  }, [provider, signer]);
  
  // Fetch owned NFTs
  const fetchOwnedNFTs = useCallback(async () => {
    if (!nftService || !account) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const nfts = await nftService.getOwnedNFTs(account);
      setOwnedNFTs(nfts);
      
      return nfts;
    } catch (err) {
      console.error('Error fetching owned NFTs:', err);
      setError(err.message || 'Failed to fetch owned NFTs');
    } finally {
      setLoading(false);
    }
  }, [nftService, account]);
  
  // Get single NFT metadata
  const getNFTMetadata = useCallback(async (tokenId) => {
    if (!nftService) {
      throw new Error('NFT service not initialized');
    }
    
    try {
      return await nftService.getNFTMetadata(tokenId);
    } catch (err) {
      console.error('Error fetching NFT metadata:', err);
      throw err;
    }
  }, [nftService]);
  
  // List NFT for sale
  const listForSale = useCallback(async (tokenId, price) => {
    if (!nftService) {
      throw new Error('NFT service not initialized');
    }
    
    try {
      const tx = await nftService.listForSale(tokenId, price);
      await tx.wait();
      
      // Refresh owned NFTs after listing
      await fetchOwnedNFTs();
      
      return tx;
    } catch (err) {
      console.error('Error listing NFT for sale:', err);
      throw err;
    }
  }, [nftService, fetchOwnedNFTs]);
  
  // Cancel NFT listing
  const cancelListing = useCallback(async (tokenId) => {
    if (!nftService) {
      throw new Error('NFT service not initialized');
    }
    
    try {
      const tx = await nftService.cancelListing(tokenId);
      await tx.wait();
      
      // Refresh owned NFTs after canceling
      await fetchOwnedNFTs();
      
      return tx;
    } catch (err) {
      console.error('Error canceling NFT listing:', err);
      throw err;
    }
  }, [nftService, fetchOwnedNFTs]);
  
  // Buy NFT
  const buyNFT = useCallback(async (tokenId, price) => {
    if (!nftService) {
      throw new Error('NFT service not initialized');
    }
    
    try {
      const tx = await nftService.buyNFT(tokenId, price);
      await tx.wait();
      
      // Refresh owned NFTs after purchase
      await fetchOwnedNFTs();
      
      return tx;
    } catch (err) {
      console.error('Error buying NFT:', err);
      throw err;
    }
  }, [nftService, fetchOwnedNFTs]);
  
  // Initial fetch of owned NFTs
  useEffect(() => {
    if (account && nftService) {
      fetchOwnedNFTs();
    }
  }, [account, nftService, fetchOwnedNFTs]);
  
  return {
    ownedNFTs,
    loading,
    error,
    fetchOwnedNFTs,
    getNFTMetadata,
    listForSale,
    cancelListing,
    buyNFT
  };
};