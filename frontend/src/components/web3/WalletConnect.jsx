import React, { useState } from 'react';
import { useWallet } from '../../blockchain/hooks/useWallet';
import { shortenAddress } from '../../utils/addressUtils';

const WalletConnect = () => {
  const { 
    account, 
    isConnecting, 
    connectMetaMask, 
    connectWalletConnect, 
    connectCoinbase,
    disconnect, 
    chainId,
    switchToSupportedChain
  } = useWallet();
  
  const [showDropdown, setShowDropdown] = useState(false);
  
  // Check if user is on the correct network
  const isWrongNetwork = account && chainId && chainId !== process.env.VITE_CHAIN_ID;

  return (
    <div className="wallet-connect">
      {!account ? (
        <>
          <button 
            className="wallet-connect__button"
            onClick={() => setShowDropdown(!showDropdown)}
            disabled={isConnecting}
          >
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
          
          {showDropdown && (
            <div className="wallet-connect__dropdown">
              <button 
                onClick={() => {
                  connectMetaMask();
                  setShowDropdown(false);
                }}
                className="wallet-connect__option"
              >
                <img src="/assets/icons/metamask.svg" alt="MetaMask" />
                MetaMask
              </button>
              
              <button 
                onClick={() => {
                  connectWalletConnect();
                  setShowDropdown(false);
                }}
                className="wallet-connect__option"
              >
                <img src="/assets/icons/walletconnect.svg" alt="WalletConnect" />
                WalletConnect
              </button>
              
              <button 
                onClick={() => {
                  connectCoinbase();
                  setShowDropdown(false);
                }}
                className="wallet-connect__option"
              >
                <img src="/assets/icons/coinbase.svg" alt="Coinbase Wallet" />
                Coinbase Wallet
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="wallet-connect__account">
          {isWrongNetwork ? (
            <button 
              className="wallet-connect__network-switch"
              onClick={switchToSupportedChain}
            >
              Switch Network
            </button>
          ) : (
            <>
              <span className="wallet-connect__address">
                {shortenAddress(account)}
              </span>
              <button 
                className="wallet-connect__disconnect"
                onClick={disconnect}
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default WalletConnect;