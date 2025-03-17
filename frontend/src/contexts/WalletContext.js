import React, { createContext, useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { WalletService } from '../blockchain/services/WalletService';

export const WalletContext = createContext();

export const WalletProvider = ({ children }) => {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const supportedChainId = process.env.VITE_CHAIN_ID || '1'; // Default to Ethereum mainnet

  // Initialize the wallet service
  const walletService = new WalletService();

  // Connect to MetaMask
  const connectMetaMask = useCallback(async () => {
    try {
      setIsConnecting(true);
      setError(null);
      
      const { provider, signer, account, chainId } = await walletService.connectMetaMask();
      
      setProvider(provider);
      setSigner(signer);
      setAccount(account);
      setChainId(chainId);
      
      localStorage.setItem('walletProvider', 'metamask');
    } catch (err) {
      console.error('Failed to connect MetaMask:', err);
      setError(err.message || 'Failed to connect to MetaMask');
    } finally {
      setIsConnecting(false);
    }
  }, [walletService]);

  // Connect to WalletConnect
  const connectWalletConnect = useCallback(async () => {
    try {
      setIsConnecting(true);
      setError(null);
      
      const { provider, signer, account, chainId } = await walletService.connectWalletConnect();
      
      setProvider(provider);
      setSigner(signer);
      setAccount(account);
      setChainId(chainId);
      
      localStorage.setItem('walletProvider', 'walletconnect');
    } catch (err) {
      console.error('Failed to connect WalletConnect:', err);
      setError(err.message || 'Failed to connect to WalletConnect');
    } finally {
      setIsConnecting(false);
    }
  }, [walletService]);

  // Connect to Coinbase Wallet
  const connectCoinbase = useCallback(async () => {
    try {
      setIsConnecting(true);
      setError(null);
      
      const { provider, signer, account, chainId } = await walletService.connectCoinbase();
      
      setProvider(provider);
      setSigner(signer);
      setAccount(account);
      setChainId(chainId);
      
      localStorage.setItem('walletProvider', 'coinbase');
    } catch (err) {
      console.error('Failed to connect Coinbase Wallet:', err);
      setError(err.message || 'Failed to connect to Coinbase Wallet');
    } finally {
      setIsConnecting(false);
    }
  }, [walletService]);

  // Disconnect wallet
  const disconnect = useCallback(async () => {
    try {
      await walletService.disconnect();
      
      setProvider(null);
      setSigner(null);
      setAccount(null);
      setChainId(null);
      
      localStorage.removeItem('walletProvider');
    } catch (err) {
      console.error('Failed to disconnect wallet:', err);
      setError(err.message || 'Failed to disconnect wallet');
    }
  }, [walletService]);

  // Switch to supported chain
  const switchToSupportedChain = useCallback(async () => {
    if (!provider) return;
    
    try {
      await walletService.switchChain(provider, supportedChainId);
      
      // Update chain ID after switching
      const newChainId = await provider.getNetwork().then(network => network.chainId.toString());
      setChainId(newChainId);
    } catch (err) {
      console.error('Failed to switch network:', err);
      setError(err.message || 'Failed to switch network');
    }
  }, [provider, supportedChainId, walletService]);

  // Auto-reconnect on page load
  useEffect(() => {
    const autoConnect = async () => {
      const savedProvider = localStorage.getItem('walletProvider');
      
      if (savedProvider) {
        try {
          setIsConnecting(true);
          
          if (savedProvider === 'metamask') {
            await connectMetaMask();
          } else if (savedProvider === 'walletconnect') {
            await connectWalletConnect();
          } else if (savedProvider === 'coinbase') {
            await connectCoinbase();
          }
        } catch (err) {
          console.error('Auto-connect failed:', err);
          localStorage.removeItem('walletProvider');
        } finally {
          setIsConnecting(false);
        }
      }
    };
    
    autoConnect();
  }, [connectMetaMask, connectWalletConnect, connectCoinbase]);

  // Setup event listeners for wallet changes
  useEffect(() => {
    if (!provider) return;

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        // User disconnected their wallet
        disconnect();
      } else {
        // Account changed
        setAccount(accounts[0]);
      }
    };

    const handleChainChanged = (chainIdHex) => {
      // Network changed
      const newChainId = parseInt(chainIdHex, 16).toString();
      setChainId(newChainId);
      
      // Update signer with new chain
      const newSigner = provider.getSigner();
      setSigner(newSigner);
    };

    const handleDisconnect = (error) => {
      console.log('Wallet disconnected', error);
      disconnect();
    };

    // Setup listeners
    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('chainChanged', handleChainChanged);
    provider.on('disconnect', handleDisconnect);

    // Cleanup listeners on unmount
    return () => {
      provider.removeListener('accountsChanged', handleAccountsChanged);
      provider.removeListener('chainChanged', handleChainChanged);
      provider.removeListener('disconnect', handleDisconnect);
    };
  }, [provider, disconnect]);

  const value = {
    account,
    provider,
    signer,
    chainId,
    isConnected: !!account,
    isConnecting,
    error,
    connectMetaMask,
    connectWalletConnect,
    connectCoinbase,
    disconnect,
    switchToSupportedChain,
    supportedChainId
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};