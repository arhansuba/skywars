/**
 * Token Service
 * 
 * Manages interactions with the SkyToken blockchain smart contract.
 * Handles token rewards, purchases, and wallet verification.
 * 
 * @module TokenService
 */

const { ethers } = require('ethers');
const SkyTokenABI = require('./contracts/SkyTokenABI.json');

/**
 * Service for interacting with the SkyToken smart contract
 */
class TokenService {
  /**
   * Create a new token service
   * @param {Object} options - Service options
   */
  constructor(options = {}) {
    this.options = Object.assign({
      providerUrl: process.env.WEB3_PROVIDER_URL || 'http://localhost:8545',
      chainId: parseInt(process.env.CHAIN_ID || '1337', 10),
      contractAddress: process.env.TOKEN_CONTRACT_ADDRESS,
      privateKey: process.env.SERVER_PRIVATE_KEY,
      gasLimit: 300000,
      maxRetries: 3,
      retryDelay: 2000, // ms
      debug: false
    }, options);
    
    // Initialize provider
    this.provider = new ethers.providers.JsonRpcProvider(this.options.providerUrl);
    
    // Initialize wallet if private key provided
    if (this.options.privateKey) {
      this.wallet = new ethers.Wallet(this.options.privateKey, this.provider);
      
      // Log server address
      if (this.options.debug) {
        console.log(`Token service initialized with server address: ${this.wallet.address}`);
      }
    }
    
    // Initialize contract if address provided
    if (this.options.contractAddress) {
      this.contract = new ethers.Contract(
        this.options.contractAddress,
        SkyTokenABI,
        this.wallet || this.provider
      );
      
      if (this.options.debug) {
        console.log(`Token contract connected at: ${this.options.contractAddress}`);
      }
    }
    
    // Pending transactions
    this.pendingTx = new Map();
    
    // Token reward queue
    this.rewardQueue = [];
    this.processingRewards = false;
    
    // Debug flag
    this.debug = this.options.debug;
  }
  
  /**
   * Initialize contract with new address
   * @param {string} contractAddress - Contract address
   */
  initializeContract(contractAddress) {
    if (!contractAddress) {
      throw new Error('Contract address is required');
    }
    
    this.options.contractAddress = contractAddress;
    
    this.contract = new ethers.Contract(
      contractAddress,
      SkyTokenABI,
      this.wallet || this.provider
    );
    
    if (this.debug) {
      console.log(`Token contract initialized at: ${contractAddress}`);
    }
    
    return true;
  }
  
  /**
   * Connect wallet with private key
   * @param {string} privateKey - Private key
   */
  connectWallet(privateKey) {
    if (!privateKey) {
      throw new Error('Private key is required');
    }
    
    try {
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      
      // Re-initialize contract with wallet
      if (this.contract) {
        this.contract = new ethers.Contract(
          this.options.contractAddress,
          SkyTokenABI,
          this.wallet
        );
      }
      
      if (this.debug) {
        console.log(`Wallet connected with address: ${this.wallet.address}`);
      }
      
      return true;
    } catch (error) {
      if (this.debug) {
        console.error('Failed to connect wallet:', error);
      }
      
      throw new Error('Invalid private key');
    }
  }
  
  /**
   * Get token balance for address
   * @param {string} address - Wallet address
   * @returns {Promise<number>} Token balance
   */
  async getTokenBalance(address) {
    if (!this.contract) {
      throw new Error('Token contract not initialized');
    }
    
    try {
      const balance = await this.contract.balanceOf(address);
      return parseFloat(ethers.utils.formatUnits(balance, 18));
    } catch (error) {
      if (this.debug) {
        console.error(`Failed to get token balance for ${address}:`, error);
      }
      
      throw new Error(`Failed to get token balance: ${error.message}`);
    }
  }
  
  /**
   * Award tokens to a player
   * @param {string} address - Wallet address
   * @param {number} amount - Token amount
   * @param {string} reason - Reason for award
   * @returns {Promise<Object>} Transaction result
   */
  async awardTokens(address, amount, reason) {
    if (!this.contract || !this.wallet) {
      throw new Error('Token contract or server wallet not initialized');
    }
    
    if (!address || !ethers.utils.isAddress(address)) {
      throw new Error('Invalid wallet address');
    }
    
    if (!amount || amount <= 0) {
      throw new Error('Token amount must be greater than zero');
    }
    
    // Add to reward queue and process
    const rewardId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.rewardQueue.push({
      id: rewardId,
      address,
      amount,
      reason,
      timestamp: Date.now(),
      attempts: 0
    });
    
    // Start processing rewards if not already running
    if (!this.processingRewards) {
      this._processRewardQueue();
    }
    
    // Return a promise that resolves when the reward is processed
    return new Promise((resolve, reject) => {
      // Set timeout for 30 seconds
      const timeout = setTimeout(() => {
        reject(new Error('Reward processing timeout'));
      }, 30000);
      
      // Setup result handler
      const resultHandler = (result) => {
        if (result.id === rewardId) {
          // Remove listener
          this.removeListener('reward_processed', resultHandler);
          clearTimeout(timeout);
          
          if (result.error) {
            reject(new Error(result.error));
          } else {
            resolve(result);
          }
        }
      };
      
      // Listen for reward processed event
      this.on('reward_processed', resultHandler);
    });
  }
  
  /**
   * Process the reward queue
   * @private
   */
  async _processRewardQueue() {
    if (this.processingRewards || this.rewardQueue.length === 0) return;
    
    this.processingRewards = true;
    
    try {
      // Get next reward
      const reward = this.rewardQueue.shift();
      
      // Increment attempt counter
      reward.attempts++;
      
      // Process the reward
      const result = await this._sendTokens(
        reward.address,
        reward.amount,
        reward.reason
      );
      
      // Emit processed event
      this.emit('reward_processed', {
        id: reward.id,
        success: true,
        address: reward.address,
        amount: reward.amount,
        reason: reward.reason,
        transactionHash: result.transactionHash
      });
      
      if (this.debug) {
        console.log(`Token reward processed for ${reward.address}: ${reward.amount} tokens (${result.transactionHash})`);
      }
    } catch (error) {
      // Get the failed reward
      const failedReward = this.rewardQueue[0];
      
      if (this.debug) {
        console.error(`Failed to process token reward:`, error);
      }
      
      // Check if should retry
      if (failedReward && failedReward.attempts < this.options.maxRetries) {
        // Put back at front of queue
        this.rewardQueue.unshift(failedReward);
        
        // Delay before retry
        setTimeout(() => {
          this.processingRewards = false;
          this._processRewardQueue();
        }, this.options.retryDelay);
        
        return;
      } else if (failedReward) {
        // Max retries reached, emit failure
        this.emit('reward_processed', {
          id: failedReward.id,
          success: false,
          error: error.message,
          address: failedReward.address,
          amount: failedReward.amount,
          reason: failedReward.reason
        });
        
        if (this.debug) {
          console.error(`Token reward failed after ${this.options.maxRetries} attempts for ${failedReward.address}`);
        }
      }
    } finally {
      // Continue processing queue
      if (this.rewardQueue.length > 0) {
        setTimeout(() => {
          this.processingRewards = false;
          this._processRewardQueue();
        }, 1000);
      } else {
        this.processingRewards = false;
      }
    }
  }
  
  /**
   * Send tokens from server wallet to address
   * @param {string} address - Wallet address
   * @param {number} amount - Token amount
   * @param {string} reason - Reason for transaction
   * @returns {Promise<Object>} Transaction result
   * @private
   */
  async _sendTokens(address, amount, reason) {
    if (!this.contract || !this.wallet) {
      throw new Error('Token contract or server wallet not initialized');
    }
    
    try {
      // Convert amount to token units (18 decimals)
      const tokenAmount = ethers.utils.parseUnits(amount.toString(), 18);
      
      // Get gas price
      const gasPrice = await this.provider.getGasPrice();
      
      // Prepare transaction
      const tx = await this.contract.transfer(address, tokenAmount, {
        gasLimit: this.options.gasLimit,
        gasPrice: gasPrice.mul(12).div(10) // 1.2x current gas price for faster confirmation
      });
      
      // Store pending transaction
      this.pendingTx.set(tx.hash, {
        address,
        amount,
        reason,
        timestamp: Date.now()
      });
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      // Remove from pending
      this.pendingTx.delete(tx.hash);
      
      // Return result
      return {
        success: true,
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      if (this.debug) {
        console.error(`Token transfer error:`, error);
      }
      
      throw new Error(`Token transfer failed: ${error.message}`);
    }
  }
  
  /**
   * Verify wallet signature
   * @param {string} address - Wallet address
   * @param {string} signature - Signed message
   * @param {string} message - Original message
   * @returns {boolean} Verification result
   */
  verifyWalletSignature(address, signature, message) {
    try {
      // Verify signature
      const recoveredAddress = ethers.utils.verifyMessage(message, signature);
      
      // Check if recovered address matches
      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch (error) {
      if (this.debug) {
        console.error(`Signature verification error:`, error);
      }
      
      return false;
    }
  }
  
  /**
   * Check if a transaction is pending
   * @param {string} txHash - Transaction hash
   * @returns {boolean} Is transaction pending
   */
  isTransactionPending(txHash) {
    return this.pendingTx.has(txHash);
  }
  
  /**
   * Get transaction details
   * @param {string} txHash - Transaction hash
   * @returns {Promise<Object>} Transaction details
   */
  async getTransactionDetails(txHash) {
    try {
      // Get transaction from blockchain
      const tx = await this.provider.getTransaction(txHash);
      
      // If transaction not found
      if (!tx) {
        throw new Error('Transaction not found');
      }
      
      // Get transaction receipt
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
      // Format result
      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: ethers.utils.formatEther(tx.value),
        gasPrice: ethers.utils.formatUnits(tx.gasPrice, 'gwei'),
        gasLimit: tx.gasLimit.toString(),
        nonce: tx.nonce,
        blockNumber: tx.blockNumber,
        blockHash: tx.blockHash,
        timestamp: Date.now(),
        confirmations: tx.confirmations,
        status: receipt ? (receipt.status === 1 ? 'confirmed' : 'failed') : 'pending'
      };
    } catch (error) {
      if (this.debug) {
        console.error(`Get transaction error:`, error);
      }
      
      throw new Error(`Failed to get transaction details: ${error.message}`);
    }
  }
  
  /**
   * Get token price in ETH
   * @returns {Promise<number>} Token price
   */
  async getTokenPrice() {
    if (!this.contract) {
      throw new Error('Token contract not initialized');
    }
    
    try {
      // If contract has a getTokenPrice function
      if (this.contract.getTokenPrice) {
        const price = await this.contract.getTokenPrice();
        return ethers.utils.formatEther(price);
      }
      
      // Fallback to hardcoded or config price
      return this.options.tokenPrice || '0.001';
    } catch (error) {
      if (this.debug) {
        console.error(`Get token price error:`, error);
      }
      
      throw new Error(`Failed to get token price: ${error.message}`);
    }
  }
  
  /**
   * Purchase tokens with ETH
   * @param {string} address - Wallet address
   * @param {number} amount - ETH amount
   * @returns {Promise<Object>} Transaction result
   */
  async purchaseTokens(address, amount) {
    if (!this.contract || !this.wallet) {
      throw new Error('Token contract or server wallet not initialized');
    }
    
    try {
      // If contract has a purchaseTokens function
      if (this.contract.purchaseTokens) {
        // Convert amount to wei
        const weiAmount = ethers.utils.parseEther(amount.toString());
        
        // Get gas price
        const gasPrice = await this.provider.getGasPrice();
        
        // Prepare transaction
        const tx = await this.contract.purchaseTokens(address, {
          value: weiAmount,
          gasLimit: this.options.gasLimit,
          gasPrice: gasPrice.mul(12).div(10) // 1.2x current gas price
        });
        
        // Wait for confirmation
        const receipt = await tx.wait();
        
        // Return result
        return {
          success: true,
          transactionHash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString()
        };
      }
      
      throw new Error('Token purchase not supported by contract');
    } catch (error) {
      if (this.debug) {
        console.error(`Purchase tokens error:`, error);
      }
      
      throw new Error(`Token purchase failed: ${error.message}`);
    }
  }
  
  /**
   * Get total token supply
   * @returns {Promise<number>} Total supply
   */
  async getTotalSupply() {
    if (!this.contract) {
      throw new Error('Token contract not initialized');
    }
    
    try {
      const supply = await this.contract.totalSupply();
      return parseFloat(ethers.utils.formatUnits(supply, 18));
    } catch (error) {
      if (this.debug) {
        console.error(`Get total supply error:`, error);
      }
      
      throw new Error(`Failed to get total supply: ${error.message}`);
    }
  }
  
  /**
   * Check if server has game server role
   * @returns {Promise<boolean>} Has role
   */
  async hasGameServerRole() {
    if (!this.contract || !this.wallet) {
      throw new Error('Token contract or server wallet not initialized');
    }
    
    try {
      // Check if contract has a GAME_SERVER_ROLE function
      if (this.contract.GAME_SERVER_ROLE) {
        const role = await this.contract.GAME_SERVER_ROLE();
        const hasRole = await this.contract.hasRole(role, this.wallet.address);
        return hasRole;
      }
      
      return false;
    } catch (error) {
      if (this.debug) {
        console.error(`Check role error:`, error);
      }
      
      return false;
    }
  }
  
  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event listener
   */
  on(event, listener) {
    if (!this._events) {
      this._events = {};
    }
    
    if (!this._events[event]) {
      this._events[event] = [];
    }
    
    this._events[event].push(listener);
  }
  
  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event listener
   */
  removeListener(event, listener) {
    if (!this._events || !this._events[event]) {
      return;
    }
    
    const index = this._events[event].indexOf(listener);
    if (index !== -1) {
      this._events[event].splice(index, 1);
    }
  }
  
  /**
   * Emit event
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emit(event, data) {
    if (!this._events || !this._events[event]) {
      return;
    }
    
    this._events[event].forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        if (this.debug) {
          console.error(`Event listener error:`, error);
        }
      }
    });
  }
}

module.exports = { TokenService };