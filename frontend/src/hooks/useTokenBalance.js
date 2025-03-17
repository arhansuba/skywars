import { useState, useEffect, useCallback } from 'react';
import { useWallet } from './useWallet';
import { TokenService } from '../services/TokenService';

/**
 * Hook to get and manage token balance
 * @param {string} address - Ethereum address to check balance for
 * @returns {Object} Token balance state and methods
 */
export const useTokenBalance = (address) => {
  const { provider, signer } = useWallet();
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tokenService, setTokenService] = useState(null);
  
  // Initialize token service when provider and signer are available
  useEffect(() => {
    if (provider && signer) {
      setTokenService(new TokenService(signer, provider));
    }
  }, [provider, signer]);
  
  // Get token balance
  const fetchBalance = useCallback(async () => {
    if (!tokenService || !address) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const balanceResult = await tokenService.getBalance(address);
      setBalance(balanceResult);
    } catch (err) {
      console.error('Error fetching token balance:', err);
      setError(err.message || 'Failed to fetch token balance');
    } finally {
      setLoading(false);
    }
  }, [tokenService, address]);
  
  // Refresh balance
  const refreshBalance = useCallback(() => {
    return fetchBalance();
  }, [fetchBalance]);
  
  // Initial fetch and setup refresh interval
  useEffect(() => {
    if (address && tokenService) {
      fetchBalance();
      
      // Refresh balance every 30 seconds
      const interval = setInterval(fetchBalance, 30000);
      
      return () => clearInterval(interval);
    }
  }, [address, tokenService, fetchBalance]);
  
  // Transfer tokens to another address
  const transferTokens = useCallback(async (to, amount) => {
    if (!tokenService) {
      throw new Error('Token service not initialized');
    }
    
    try {
      const tx = await tokenService.transfer(to, amount);
      await tx.wait();
      
      // Refresh balance after transfer
      fetchBalance();
      
      return tx;
    } catch (err) {
      console.error('Error transferring tokens:', err);
      throw err;
    }
  }, [tokenService, fetchBalance]);
  
  // Claim daily reward
  const claimDailyReward = useCallback(async () => {
    if (!tokenService) {
      throw new Error('Token service not initialized');
    }
    
    try {
      const tx = await tokenService.claimDailyReward();
      await tx.wait();
      
      // Refresh balance after claiming
      fetchBalance();
      
      return tx;
    } catch (err) {
      console.error('Error claiming daily reward:', err);
      throw err;
    }
  }, [tokenService, fetchBalance]);
  
  // Claim achievement reward
  const claimAchievementReward = useCallback(async (achievementId) => {
    if (!tokenService) {
      throw new Error('Token service not initialized');
    }
    
    try {
      const tx = await tokenService.claimAchievementReward(achievementId);
      await tx.wait();
      
      // Refresh balance after claiming
      fetchBalance();
      
      return tx;
    } catch (err) {
      console.error('Error claiming achievement reward:', err);
      throw err;
    }
  }, [tokenService, fetchBalance]);
  
  // Check if achievement has been claimed
  const hasClaimedAchievement = useCallback(async (achievementId) => {
    if (!tokenService || !address) {
      throw new Error('Token service not initialized or no address provided');
    }
    
    try {
      return await tokenService.hasClaimedAchievement(address, achievementId);
    } catch (err) {
      console.error('Error checking claimed achievement:', err);
      throw err;
    }
  }, [tokenService, address]);
  
  return {
    balance,
    loading,
    error,
    refreshBalance,
    transferTokens,
    claimDailyReward,
    claimAchievementReward,
    hasClaimedAchievement
  };
};