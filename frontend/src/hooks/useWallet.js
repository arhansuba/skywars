import { useContext } from 'react';
import { WalletContext } from '../../contexts/WalletContext';

/**
 * Hook to access wallet connection and state
 * @returns {Object} Wallet context values and methods
 */
export const useWallet = () => {
  const context = useContext(WalletContext);
  
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  
  return context;
};