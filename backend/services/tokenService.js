const { ethers } = require('ethers');
const SkyTokenABI = require('../config/abis/SkyToken.json');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const { getGasPrice } = require('../utils/blockchainUtils');

/**
 * Service for interacting with the SkyToken smart contract
 */
class TokenService {
  constructor() {
    this.initialize();
  }
  
  /**
   * Initialize provider, wallet, and contract
   */
  initialize() {
    try {
      // Initialize provider based on environment
      if (process.env.NODE_ENV === 'production') {
        this.provider = new ethers.providers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
      } else {
        // Use local blockchain (Hardhat, Ganache) for development
        this.provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
      }
      
      // Initialize contract wallet if private key is provided
      if (process.env.SERVER_WALLET_PRIVATE_KEY) {
        this.wallet = new ethers.Wallet(process.env.SERVER_WALLET_PRIVATE_KEY, this.provider);
        
        // Initialize contract with signer
        this.contract = new ethers.Contract(
          process.env.SKYTOKEN_CONTRACT_ADDRESS,
          SkyTokenABI,
          this.wallet
        );
        
        logger.info('TokenService initialized with wallet');
      } else {
        // Initialize contract with provider (read-only)
        this.contract = new ethers.Contract(
          process.env.SKYTOKEN_CONTRACT_ADDRESS,
          SkyTokenABI,
          this.provider
        );
        
        logger.warn('TokenService initialized in read-only mode (no wallet private key provided)');
      }
      
      // Set maximum gas limit for transactions
      this.maxGasLimit = 500000; // 500k gas units
      
      // Initialize retry settings
      this.maxRetries = 3;
      this.retryDelay = 2000; // 2 seconds
      
      // Token decimals (ERC20 standard is 18)
      this.decimals = 18;
      
      // Keep track of nonce for transactions
      this.nextNonce = null;
      
      logger.info(`SkyToken contract initialized at ${process.env.SKYTOKEN_CONTRACT_ADDRESS}`);
    } catch (error) {
      logger.error('Error initializing TokenService:', error);
      throw new Error(`TokenService initialization failed: ${error.message}`);
    }
  }
  
  /**
   * Get token balance for a wallet address
   * @param {string} address - Wallet address to check
   * @returns {Promise<string>} - Formatted balance
   */
  async getBalance(address) {
    try {
      // Check cache first
      const cacheKey = `token:balance:${address}`;
      const cachedBalance = cache.get(cacheKey);
      
      if (cachedBalance) {
        return cachedBalance;
      }
      
      const balance = await this.contract.balanceOf(address);
      const formattedBalance = ethers.utils.formatUnits(balance, this.decimals);
      
      // Cache result for 30 seconds
      cache.set(cacheKey, formattedBalance, 30);
      
      return formattedBalance;
    } catch (error) {
      logger.error(`Error getting token balance for ${address}:`, error);
      throw error;
    }
  }
  
  /**
   * Get player stats from the token contract
   * @param {string} address - Player's wallet address
   * @returns {Promise<Object>} - Player stats
   */
  async getPlayerStats(address) {
    try {
      // Check cache first
      const cacheKey = `token:stats:${address}`;
      const cachedStats = cache.get(cacheKey);
      
      if (cachedStats) {
        return cachedStats;
      }
      
      const stats = await this.contract.getPlayerStats(address);
      
      // Format stats
      const formattedStats = {
        tokensEarned: ethers.utils.formatUnits(stats.tokensEarned, this.decimals),
        tokensSpent: ethers.utils.formatUnits(stats.tokensSpent, this.decimals),
        lastActivity: new Date(stats.lastActivity.toNumber() * 1000)
      };
      
      // Cache result for 1 minute
      cache.set(cacheKey, formattedStats, 60);
      
      return formattedStats;
    } catch (error) {
      logger.error(`Error getting player stats for ${address}:`, error);
      throw error;
    }
  }
  
  /**
   * Get available items from the token contract
   * @param {number} startId - Starting item ID for pagination
   * @param {number} count - Number of items to retrieve
   * @returns {Promise<Array>} - Array of available items
   */
  async getAvailableItems(startId = 1, count = 10) {
    try {
      // Check cache first
      const cacheKey = `token:items:${startId}:${count}`;
      const cachedItems = cache.get(cacheKey);
      
      if (cachedItems) {
        return cachedItems;
      }
      
      const [ids, names, prices] = await this.contract.getAvailableItems(startId, count);
      
      // Format items
      const items = ids.map((id, index) => ({
        id: id.toNumber(),
        name: names[index],
        price: ethers.utils.formatUnits(prices[index], this.decimals)
      }));
      
      // Cache result for 5 minutes
      cache.set(cacheKey, items, 300);
      
      return items;
    } catch (error) {
      logger.error(`Error getting available items:`, error);
      throw error;
    }
  }
  
  /**
   * Award tokens to a player for achievements
   * @param {string} playerAddress - Player's wallet address
   * @param {number} amount - Amount of tokens to award
   * @param {string} reason - Reason for the reward
   * @returns {Promise<Object>} - Transaction result
   */
  async awardTokens(playerAddress, amount, reason) {
    if (!this.wallet) {
      throw new Error('TokenService not initialized with wallet - cannot award tokens');
    }
    
    try {
      // Convert amount to proper format (with decimals)
      const tokenAmount = ethers.utils.parseUnits(amount.toString(), this.decimals);
      
      // Get optimal gas price
      const gasPrice = await getGasPrice(this.provider);
      
      // Get nonce for transaction
      const nonce = await this.getNextNonce();
      
      // Prepare transaction
      const tx = await this.contract.awardTokens(
        playerAddress,
        tokenAmount,
        reason,
        {
          gasLimit: this.maxGasLimit,
          gasPrice,
          nonce
        }
      );
      
      // Wait for transaction to be mined
      const receipt = await tx.wait();
      
      logger.info(`Awarded ${amount} tokens to ${playerAddress} for: ${reason} (TX: ${receipt.transactionHash})`);
      
      return {
        success: true,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      logger.error(`Error awarding tokens to ${playerAddress}:`, error);
      
      // Check if retry is needed due to nonce or gas price issues
      if (this.shouldRetryTransaction(error) && this.maxRetries > 0) {
        logger.info(`Retrying token award to ${playerAddress}...`);
        
        // Reset nonce tracking
        this.nextNonce = null;
        
        // Decrease max retries and try again after delay
        this.maxRetries--;
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.awardTokens(playerAddress, amount, reason);
      }
      
      // Reset retry counter
      this.maxRetries = 3;
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Handle purchase of an in-game item
   * @param {string} playerAddress - Player's wallet address
   * @param {number} itemId - ID of the item to purchase
   * @returns {Promise<Object>} - Transaction result
   */
  async purchaseItem(playerAddress, itemId) {
    if (!this.wallet) {
      throw new Error('TokenService not initialized with wallet - cannot process purchase');
    }
    
    try {
      // Get optimal gas price
      const gasPrice = await getGasPrice(this.provider);
      
      // Get nonce for transaction
      const nonce = await this.getNextNonce();
      
      // Prepare transaction
      const tx = await this.contract.purchaseItem(
        playerAddress,
        itemId,
        {
          gasLimit: this.maxGasLimit,
          gasPrice,
          nonce
        }
      );
      
      // Wait for transaction to be mined
      const receipt = await tx.wait();
      
      logger.info(`Player ${playerAddress} purchased item ${itemId} (TX: ${receipt.transactionHash})`);
      
      return {
        success: true,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      logger.error(`Error processing item purchase for ${playerAddress}:`, error);
      
      // Check if retry is needed
      if (this.shouldRetryTransaction(error) && this.maxRetries > 0) {
        logger.info(`Retrying item purchase for ${playerAddress}...`);
        
        // Reset nonce tracking
        this.nextNonce = null;
        
        // Decrease max retries and try again after delay
        this.maxRetries--;
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.purchaseItem(playerAddress, itemId);
      }
      
      // Reset retry counter
      this.maxRetries = 3;
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Verify a transaction on the blockchain
   * @param {string} txHash - Transaction hash to verify
   * @returns {Promise<Object>} - Verification result
   */
  async verifyTransaction(txHash) {
    try {
      // Get transaction receipt
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        return { verified: false, reason: 'Transaction not found' };
      }
      
      if (receipt.status === 0) {
        return { verified: false, reason: 'Transaction failed' };
      }
      
      return {
        verified: true,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      logger.error(`Error verifying transaction ${txHash}:`, error);
      return { verified: false, reason: error.message };
    }
  }
  
  /**
   * Verify wallet signature to confirm ownership
   * @param {string} address - Wallet address
   * @param {string} signature - Signature to verify
   * @param {string} message - Original message that was signed
   * @returns {Promise<boolean>} - Whether signature is valid
   */
  async verifyWalletSignature(address, signature, message) {
    try {
      // Recover the address that signed the message
      const recoveredAddress = ethers.utils.verifyMessage(message, signature);
      
      // Check if recovered address matches the claimed address
      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch (error) {
      logger.error(`Error verifying signature for ${address}:`, error);
      return false;
    }
  }
  
  /**
   * Get next nonce for transaction
   * @returns {Promise<number>} - Nonce value
   */
  async getNextNonce() {
    if (this.nextNonce === null) {
      // Get current nonce from the blockchain
      this.nextNonce = await this.wallet.getTransactionCount();
    } else {
      // Increment previously used nonce
      this.nextNonce++;
    }
    
    return this.nextNonce;
  }
  
  /**
   * Determine if a transaction should be retried
   * @param {Error} error - Error from transaction
   * @returns {boolean} - Whether to retry
   */
  shouldRetryTransaction(error) {
    const errorMessage = error.message.toLowerCase();
    
    // Common Ethereum transaction errors that warrant a retry
    return (
      errorMessage.includes('nonce too low') ||
      errorMessage.includes('nonce has already been used') ||
      errorMessage.includes('replacement transaction underpriced') ||
      errorMessage.includes('transaction underpriced') ||
      errorMessage.includes('network is congested') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('connection error')
    );
  }
  
  /**
   * Check if token contract is paused
   * @returns {Promise<boolean>} - Whether contract is paused
   */
  async isPaused() {
    try {
      return await this.contract.paused();
    } catch (error) {
      logger.error('Error checking if token contract is paused:', error);
      return true; // Assume paused if error occurs to prevent transactions
    }
  }
  
  /**
   * Get token contract information
   * @returns {Promise<Object>} - Contract info
   */
  async getContractInfo() {
    try {
      // Check cache first
      const cacheKey = 'token:contractInfo';
      const cachedInfo = cache.get(cacheKey);
      
      if (cachedInfo) {
        return cachedInfo;
      }
      
      // Get contract information
      const [name, symbol, totalSupply, rewardsPool, transferFeePercentage] = await Promise.all([
        this.contract.name(),
        this.contract.symbol(),
        this.contract.totalSupply(),
        this.contract.rewardsPool(),
        this.contract.transferFeePercentage()
      ]);
      
      const contractInfo = {
        name,
        symbol,
        totalSupply: ethers.utils.formatUnits(totalSupply, this.decimals),
        rewardsPool: ethers.utils.formatUnits(rewardsPool, this.decimals),
        transferFeePercentage: transferFeePercentage.toString()
      };
      
      // Cache for 5 minutes
      cache.set(cacheKey, contractInfo, 300);
      
      return contractInfo;
    } catch (error) {
      logger.error('Error getting token contract information:', error);
      throw error;
    }
  }
}

// Create singleton instance
const tokenService = new TokenService();

module.exports = tokenService;