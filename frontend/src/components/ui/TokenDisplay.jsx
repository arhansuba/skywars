import React from 'react';
import PropTypes from 'prop-types';
import { CSSTransition } from 'react-transition-group';

/**
 * Displays token balance with optional animation for changes.
 */
const TokenDisplay = ({
  balance = 0,
  symbol = 'SKY',
  iconUrl = '/assets/token-icon.svg',
  mini = false,
  animateChanges = true,
  className = '',
}) => {
  const [displayedBalance, setDisplayedBalance] = React.useState(balance);
  const [isIncreasing, setIsIncreasing] = React.useState(false);
  const [isDecreasing, setIsDecreasing] = React.useState(false);
  const prevBalanceRef = React.useRef(balance);
  
  // Handle balance changes with animation
  React.useEffect(() => {
    if (animateChanges && prevBalanceRef.current !== balance) {
      if (balance > prevBalanceRef.current) {
        setIsIncreasing(true);
        setTimeout(() => setIsIncreasing(false), 1500);
      } else if (balance < prevBalanceRef.current) {
        setIsDecreasing(true);
        setTimeout(() => setIsDecreasing(false), 1500);
      }
      
      // Gradually update displayed balance for smooth animation
      const diff = balance - prevBalanceRef.current;
      const steps = 10;
      const increment = diff / steps;
      let currentStep = 0;
      
      const interval = setInterval(() => {
        currentStep++;
        setDisplayedBalance(prevBalance => 
          Math.round((prevBalance + increment) * 100) / 100
        );
        
        if (currentStep >= steps) {
          clearInterval(interval);
          setDisplayedBalance(balance);
        }
      }, 50);
      
      prevBalanceRef.current = balance;
      
      return () => clearInterval(interval);
    } else {
      // No animation, just update the balance
      setDisplayedBalance(balance);
      prevBalanceRef.current = balance;
    }
  }, [balance, animateChanges]);
  
  if (mini) {
    return (
      <div className={`flex items-center space-x-1 ${className}`}>
        <img src={iconUrl} alt={symbol} className="w-4 h-4" />
        <span className={`text-sm font-medium ${
          isIncreasing ? 'text-green-400' : 
          isDecreasing ? 'text-red-400' : 
          'text-white'
        }`}>
          {displayedBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>
    );
  }
  
  return (
    <div className={`relative flex items-center space-x-2 bg-slate-800/50 rounded-lg px-3 py-1.5 ${className}`}>
      <img src={iconUrl} alt={symbol} className="w-5 h-5" />
      
      <div className="flex flex-col">
        <span className="text-xs text-slate-400">{symbol} Balance</span>
        <span className={`text-base font-medium ${
          isIncreasing ? 'text-green-400' : 
          isDecreasing ? 'text-red-400' : 
          'text-white'
        }`}>
          {displayedBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>
      
      {/* Change indicators */}
      <CSSTransition
        in={isIncreasing}
        timeout={1500}
        classNames="token-increase"
        unmountOnExit
      >
        <div className="absolute -top-2 -right-1 text-green-400 font-medium text-sm animate-bounce">
          +{(balance - prevBalanceRef.current).toFixed(2)}
        </div>
      </CSSTransition>
      
      <CSSTransition
        in={isDecreasing}
        timeout={1500}
        classNames="token-decrease"
        unmountOnExit
      >
        <div className="absolute -top-2 -right-1 text-red-400 font-medium text-sm animate-bounce">
          {(balance - prevBalanceRef.current).toFixed(2)}
        </div>
      </CSSTransition>
    </div>
  );
};

TokenDisplay.propTypes = {
  balance: PropTypes.number,
  symbol: PropTypes.string,
  iconUrl: PropTypes.string,
  mini: PropTypes.bool,
  animateChanges: PropTypes.bool,
  className: PropTypes.string,
};

export default TokenDisplay;