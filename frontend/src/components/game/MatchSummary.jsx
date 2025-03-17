import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import TokenDisplay from '../ui/TokenDisplay';
import { useGameContext } from '../contexts/GameContext';
import { useWalletContext } from '../contexts/WalletContext';

/**
 * Post-match summary showing player stats, rewards, and achievements.
 */
const MatchSummary = ({
  matchData,
  onExit,
  onPlayAgain,
  className = '',
}) => {
  const { gameInstance } = useGameContext();
  const { tokenBalance, refreshTokenBalance } = useWalletContext();
  
  const [rewards, setRewards] = useState({
    tokens: 0,
    xp: 0,
    achievements: [],
    nftDrops: [],
  });
  
  const [showingTokenAnimation, setShowingTokenAnimation] = useState(false);
  const [animatedTokens, setAnimatedTokens] = useState(0);
  const [claimingRewards, setClaimingRewards] = useState(false);
  const [claimError, setClaimError] = useState(null);
  const [showNFTDetails, setShowNFTDetails] = useState(false);
  const [selectedNFT, setSelectedNFT] = useState(null);
  
  // Calculate player stats from match data
  const playerStats = matchData?.playerStats || {
    kills: 0,
    deaths: 0,
    assists: 0,
    score: 0,
    accuracy: 0,
    damageDealt: 0,
    timeAlive: 0,
    distanceFlown: 0,
    missionSuccess: false,
  };
  
  // Calculate team/match result
  const matchResult = matchData?.result || {
    winner: null,
    playerTeam: null,
    victory: false,
  };
  
  const isVictory = matchResult.victory;
  
  // Load rewards from match data
  useEffect(() => {
    if (matchData && matchData.rewards) {
      // Short delay before showing rewards for dramatic effect
      setTimeout(() => {
        setRewards(matchData.rewards);
        
        // Start token animation if tokens were awarded
        if (matchData.rewards.tokens > 0) {
          setShowingTokenAnimation(true);
          
          // Animate token count
          let current = 0;
          const increment = Math.max(1, Math.floor(matchData.rewards.tokens / 50));
          const interval = setInterval(() => {
            current += increment;
            if (current >= matchData.rewards.tokens) {
              current = matchData.rewards.tokens;
              clearInterval(interval);
              setShowingTokenAnimation(false);
            }
            setAnimatedTokens(current);
          }, 50);
          
          return () => clearInterval(interval);
        }
      }, 1000);
    }
  }, [matchData]);
  
  // Handle claiming rewards
  const handleClaimRewards = async () => {
    if (!gameInstance || claimingRewards) return;
    
    try {
      setClaimingRewards(true);
      setClaimError(null);
      
      // Call game instance to claim rewards on blockchain
      const result = await gameInstance.claimMatchRewards(matchData.id);
      
      if (result.success) {
        // Update token balance
        refreshTokenBalance();
        
        // Show success notification
        window.notify.success('Rewards claimed successfully!', {
          title: 'Rewards Claimed',
        });
      } else {
        throw new Error(result.error || 'Failed to claim rewards');
      }
    } catch (error) {
      console.error('Failed to claim rewards:', error);
      setClaimError(error.message || 'Failed to claim rewards');
      
      window.notify.error('Failed to claim rewards', {
        title: 'Claim Error',
      });
    } finally {
      setClaimingRewards(false);
    }
  };
  
  // Format time from seconds to MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Calculate KD ratio
  const kdRatio = playerStats.deaths === 0 
    ? playerStats.kills 
    : (playerStats.kills / playerStats.deaths).toFixed(2);
  
  // Show NFT details
  const openNFTDetails = (nft) => {
    setSelectedNFT(nft);
    setShowNFTDetails(true);
  };
  
  return (
    <Card 
      title={isVictory ? "MISSION SUCCESSFUL" : "MISSION FAILED"}
      variant={isVictory ? "primary" : "default"}
      className={`${className} max-w-3xl mx-auto`}
    >
      <div className="space-y-6">
        {/* Match result banner */}
        <div 
          className={`p-4 rounded-lg text-center ${
            isVictory 
              ? 'bg-green-900/30 border border-green-700' 
              : 'bg-red-900/30 border border-red-700'
          }`}
        >
          <h2 className={`text-2xl font-bold ${isVictory ? 'text-green-400' : 'text-red-400'}`}>
            {isVictory ? 'VICTORY' : 'DEFEAT'}
          </h2>
          <p className="text-slate-300 mt-2">
            {matchResult.message || (isVictory 
              ? 'Your team emerged victorious!' 
              : 'Your team was defeated.'
            )}
          </p>
        </div>
        
        {/* Player stats section */}
        <div className="bg-slate-800/50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-3">Your Performance</h3>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-800 rounded p-3 text-center">
              <div className="text-2xl font-bold text-sky-400">{playerStats.kills}</div>
              <div className="text-sm text-slate-400">Kills</div>
            </div>
            
            <div className="bg-slate-800 rounded p-3 text-center">
              <div className="text-2xl font-bold text-red-400">{playerStats.deaths}</div>
              <div className="text-sm text-slate-400">Deaths</div>
            </div>
            
            <div className="bg-slate-800 rounded p-3 text-center">
              <div className="text-2xl font-bold text-yellow-400">{kdRatio}</div>
              <div className="text-sm text-slate-400">K/D Ratio</div>
            </div>
            
            <div className="bg-slate-800 rounded p-3 text-center">
              <div className="text-2xl font-bold text-green-400">{playerStats.assists}</div>
              <div className="text-sm text-slate-400">Assists</div>
            </div>
          </div>
          
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="flex flex-col">
              <span className="text-slate-400 text-sm">Score</span>
              <span className="text-white">{playerStats.score.toLocaleString()}</span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-slate-400 text-sm">Accuracy</span>
              <span className="text-white">{playerStats.accuracy}%</span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-slate-400 text-sm">Damage Dealt</span>
              <span className="text-white">{playerStats.damageDealt.toLocaleString()}</span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-slate-400 text-sm">Time Alive</span>
              <span className="text-white">{formatTime(playerStats.timeAlive)}</span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-slate-400 text-sm">Distance Flown</span>
              <span className="text-white">{Math.round(playerStats.distanceFlown).toLocaleString()} km</span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-slate-400 text-sm">Mission Objectives</span>
              <span className={playerStats.missionSuccess ? 'text-green-400' : 'text-red-400'}>
                {playerStats.missionSuccess ? 'Completed' : 'Failed'}
              </span>
            </div>
          </div>
        </div>
        
        {/* Rewards section */}
        <div className="bg-slate-800/50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-3">Rewards</h3>
          
          <div className="flex justify-center items-center space-x-6 py-3">
            {/* Token reward */}
            <div className="flex flex-col items-center">
              <div className="text-xl font-bold text-sky-400 flex items-center">
                <img src="/assets/token-icon.svg" alt="Token" className="w-5 h-5 mr-2" />
                {showingTokenAnimation ? animatedTokens : rewards.tokens}
              </div>
              <div className="text-sm text-slate-400">Tokens</div>
            </div>
            
            {/* XP reward */}
            <div className="flex flex-col items-center">
              <div className="text-xl font-bold text-purple-400">
                +{rewards.xp}
              </div>
              <div className="text-sm text-slate-400">XP</div>
            </div>
          </div>
          
          {/* Achievements */}
          {rewards.achievements && rewards.achievements.length > 0 && (
            <div className="mt-4">
              <h4 className="text-md font-medium text-white mb-2">Achievements</h4>
              <div className="grid grid-cols-1 gap-2">
                {rewards.achievements.map((achievement, index) => (
                  <div key={index} className="bg-slate-800 rounded p-2 flex items-center">
                    <div className="w-10 h-10 rounded-full bg-indigo-900/50 flex items-center justify-center mr-3">
                      {achievement.icon ? (
                        <img src={achievement.icon} alt={achievement.name} className="w-6 h-6" />
                      ) : (
                        <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-white">{achievement.name}</div>
                      <div className="text-sm text-slate-400">{achievement.description}</div>
                    </div>
                    <div className="ml-auto text-yellow-400 text-sm">
                      +{achievement.tokenReward} tokens
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* NFT Drops */}
          {rewards.nftDrops && rewards.nftDrops.length > 0 && (
            <div className="mt-4">
              <h4 className="text-md font-medium text-white mb-2">NFT Rewards</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {rewards.nftDrops.map((nft, index) => (
                  <div 
                    key={index} 
                    className="bg-gradient-to-b from-indigo-900/50 to-purple-900/50 border border-indigo-700/50 rounded-lg p-3 cursor-pointer"
                    onClick={() => openNFTDetails(nft)}
                  >
                    <div className="aspect-video bg-slate-900 rounded-md mb-2 overflow-hidden">
                      <img src={nft.image} alt={nft.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="font-medium text-white">{nft.name}</div>
                    <div className="flex justify-between items-center mt-1">
                      <div className="text-xs text-indigo-400">Token #{nft.tokenId}</div>
                      <div className="text-xs px-2 py-0.5 bg-indigo-800 rounded-full text-white">
                        {nft.rarity}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Claim rewards button */}
          <div className="mt-4 flex justify-center">
            <Button
              variant="primary"
              size="lg"
              onClick={handleClaimRewards}
              disabled={claimingRewards || rewards.tokens === 0}
              className="w-full max-w-sm"
              startIcon={
                claimingRewards ? (
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )
              }
            >
              {claimingRewards ? 'Claiming Rewards...' : 'Claim Rewards'}
            </Button>
          </div>
          
          {/* Claim error */}
          {claimError && (
            <div className="mt-3 text-center text-red-400 text-sm">
              {claimError}
            </div>
          )}
        </div>
      </div>
      
      {/* Action buttons */}
      <div className="mt-6 flex flex-col sm:flex-row justify-center space-y-3 sm:space-y-0 sm:space-x-4">
        <Button variant="secondary" fullWidth onClick={onExit}>
          Return to Hangar
        </Button>
        <Button variant="primary" fullWidth onClick={onPlayAgain}>
          Play Again
        </Button>
      </div>
      
      {/* NFT Details Modal */}
      {showNFTDetails && selectedNFT && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-indigo-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-auto">
            <div className="p-4 border-b border-slate-800 flex justify-between">
              <h3 className="text-xl font-semibold text-white">{selectedNFT.name}</h3>
              <button 
                onClick={() => setShowNFTDetails(false)}
                className="text-slate-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-4">
              <div className="aspect-video bg-slate-900 rounded-md mb-4 overflow-hidden">
                <img src={selectedNFT.image} alt={selectedNFT.name} className="w-full h-full object-cover" />
              </div>
              
              <div className="flex justify-between items-center mb-4">
                <div className="text-indigo-400">Token #{selectedNFT.tokenId}</div>
                <div className="px-3 py-1 bg-indigo-900 rounded-full text-white text-sm">
                  {selectedNFT.rarity}
                </div>
              </div>
              
              <p className="text-slate-300 mb-4">{selectedNFT.description}</p>
              
              <div className="space-y-2">
                <h4 className="font-medium text-white">Attributes</h4>
                <div className="grid grid-cols-2 gap-2">
                  {selectedNFT.attributes.map((attr, index) => (
                    <div key={index} className="bg-slate-800 p-2 rounded">
                      <div className="text-xs text-slate-400">{attr.trait_type}</div>
                      <div className="text-white">{attr.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="mt-6">
                <Button 
                  variant="outline" 
                  fullWidth
                  onClick={() => setShowNFTDetails(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

MatchSummary.propTypes = {
  matchData: PropTypes.shape({
    id: PropTypes.string.isRequired,
    result: PropTypes.object,
    playerStats: PropTypes.object,
    rewards: PropTypes.shape({
      tokens: PropTypes.number,
      xp: PropTypes.number,
      achievements: PropTypes.array,
      nftDrops: PropTypes.array,
    }),
  }).isRequired,
  onExit: PropTypes.func.isRequired,
  onPlayAgain: PropTypes.func.isRequired,
  className: PropTypes.string,
};

export default MatchSummary;