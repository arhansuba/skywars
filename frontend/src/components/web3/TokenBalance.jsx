import React, { useEffect, useState } from 'react';
import { useTokenBalance } from '../../blockchain/hooks/useTokenBalance';
import { useWallet } from '../../blockchain/hooks/useWallet';
import { formatEther } from 'ethers';

const TokenBalance = () => {
  const { account, isConnected } = useWallet();
  const { balance, loading, error, refreshBalance } = useTokenBalance(account);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Format the balance for display
  const formattedBalance = balance ? parseFloat(formatEther(balance)).toFixed(2) : '0.00';

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshBalance();
    setIsRefreshing(false);
  };

  // Effect to refresh balance when account changes
  useEffect(() => {
    if (account) {
      refreshBalance();
    }
  }, [account, refreshBalance]);

  if (!isConnected) {
    return null;
  }

  return (
    <div className="token-balance">
      <div className="token-balance__container">
        <div className="token-balance__icon">
          <img src="/assets/icons/token-icon.svg" alt="SkyToken" />
        </div>
        
        <div className="token-balance__info">
          <span className="token-balance__label">SKY Token Balance</span>
          <div className="token-balance__amount">
            {loading ? (
              <span className="token-balance__loading">Loading...</span>
            ) : error ? (
              <span className="token-balance__error">Error loading balance</span>
            ) : (
              <span className="token-balance__value">{formattedBalance} SKY</span>
            )}
          </div>
        </div>
        
        <button 
          className="token-balance__refresh"
          onClick={handleRefresh}
          disabled={loading || isRefreshing}
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </div>
  );
};

export default TokenBalance;