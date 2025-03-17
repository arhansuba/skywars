/**
 * SkyToken Game Integration
 * 
 * Comprehensive integration of SkyToken smart contract with the SkyWars game,
 * including balance display, transaction history, purchases, rewards, and trading.
 */

import { ethers } from 'ethers';

// SkyToken Contract ABI - Complete version with all methods we need
const SKY_TOKEN_ABI = [
  // Read functions
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  // Write functions
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  // Game-specific functions
  "function rewardPlayer(address player, uint256 amount) returns (bool)",
  "function batchReward(address[] memory players, uint256[] memory amounts) returns (bool)",
  "function createRewardDrop(uint256 totalAmount, uint256 expiryTime, bytes32 merkleRoot) returns (uint256)",
  "function claimRewardDrop(uint256 dropId, uint256 amount, bytes32[] calldata merkleProof) returns (bool)",
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event PlayerRewarded(address indexed player, uint256 amount, string reason)",
  "event RewardDropCreated(uint256 indexed dropId, uint256 totalAmount, uint256 expiryTime)",
  "event RewardDropClaimed(uint256 indexed dropId, address indexed player, uint256 amount)"
];

// Marketplace Contract ABI
const MARKETPLACE_ABI = [
  // Read functions
  "function getListingPrice(uint256 listingId) view returns (uint256)",
  "function getListedItems() view returns (uint256[])",
  "function getItemDetails(uint256 listingId) view returns (address seller, string itemType, string itemId, uint256 price, bool sold)",
  // Write functions
  "function createListing(string memory itemType, string memory itemId, uint256 price) returns (uint256)",
  "function purchaseItem(uint256 listingId) returns (bool)",
  "function cancelListing(uint256 listingId) returns (bool)",
  // Events
  "event ListingCreated(uint256 indexed listingId, address indexed seller, string itemType, string itemId, uint256 price)",
  "event ListingSold(uint256 indexed listingId, address indexed buyer, address indexed seller, uint256 price)",
  "event ListingCancelled(uint256 indexed listingId, address indexed seller)"
];

// Trading Contract ABI
const TRADING_ABI = [
  // Read functions
  "function getTrade(uint256 tradeId) view returns (address creator, address recipient, string[] itemIds, uint256 tokenAmount, uint256 deadline, bool isCompleted, bool isCancelled)",
  "function getMyTrades() view returns (uint256[] tradeIds)",
  // Write functions
  "function createTrade(address recipient, string[] memory itemIds, uint256 tokenAmount, uint256 deadline) returns (uint256)",
  "function acceptTrade(uint256 tradeId) returns (bool)",
  "function cancelTrade(uint256 tradeId) returns (bool)",
  // Events
  "event TradeCreated(uint256 indexed tradeId, address indexed creator, address indexed recipient, uint256 tokenAmount)",
  "event TradeAccepted(uint256 indexed tradeId, address indexed creator, address indexed recipient)",
  "event TradeCancelled(uint256 indexed tradeId, address indexed creator, address indexed recipient)"
];

// Achievement Tracker Contract ABI
const ACHIEVEMENT_ABI = [
  // Read functions
  "function getPlayerAchievements(address player) view returns (uint256[] achievementIds)",
  "function getAchievementDetails(uint256 achievementId) view returns (string name, string description, uint256 rewardAmount, bool repeatable, uint256 cooldownPeriod)",
  "function getDailyStreak(address player) view returns (uint256 streak, uint256 lastClaimTime)",
  // Write functions
  "function unlockAchievement(address player, uint256 achievementId, bytes memory signature) returns (bool)",
  "function claimDailyReward(address player, bytes memory signature) returns (bool)",
  // Events
  "event AchievementUnlocked(address indexed player, uint256 indexed achievementId, uint256 rewardAmount)",
  "event DailyRewardClaimed(address indexed player, uint256 streak, uint256 rewardAmount)"
];

/**
 * Main SkyToken integration class for SkyWars
 */
export class SkyTokenIntegration {
  constructor(walletManager, gameInstance, uiManager) {
    // Core references
    this.wallet = walletManager;
    this.game = gameInstance;
    this.ui = uiManager;
    
    // Settings (set defaults but allow override)
    this.settings = {
      gasLimitBuffer: 1.2, // Add 20% to estimated gas
      maxGasPrice: ethers.utils.parseUnits('100', 'gwei'), // Maximum gas price we'll pay
      lowBalanceWarningThreshold: 10, // Warn if token balance below this threshold
      refreshInterval: 60000, // 60 seconds
      apiBaseUrl: 'https://api.skywars.example.com',
      ipfsGateway: 'https://ipfs.io/ipfs/',
      batchSize: 50 // Maximum batch size for batch operations
    };
    
    // State management
    this.state = {
      tokenBalance: '0',
      tokenDecimals: 18,
      tokenSymbol: 'SKY',
      transactions: [],
      inventory: [],
      pendingRewards: [],
      incomingTrades: [],
      outgoingTrades: [],
      achievements: [],
      dailyStreak: 0,
      lastBalanceUpdate: 0,
      syncInProgress: false,
      listening: false
    };
    
    // Reference to contracts
    this.contracts = {
      skyToken: null,
      marketplace: null,
      trading: null,
      achievements: null
    };
    
    // Interval references
    this.intervals = {
      balanceRefresh: null,
      tradingRefresh: null
    };
    
    // Listeners
    this.listeners = {
      transfer: null,
      reward: null,
      listing: null,
      trade: null,
      achievement: null
    };
    
    // Signature verification cache
    this.verificationCache = new Map();
    
    // Initialize system
    this.initialize();
  }
  
  /**
   * Initialize the SkyToken integration
   */
  async initialize() {
    // Wait for wallet to be connected if needed
    if (!this.wallet.getState().connected) {
      console.log('Wallet not connected. SkyToken integration will initialize when wallet connects.');
      this.wallet.onWalletConnected = (state) => {
        this.initializeWithWallet();
      };
      return;
    }
    
    await this.initializeWithWallet();
  }
  
  /**
   * Initialize with connected wallet
   */
  async initializeWithWallet() {
    try {
      // Get wallet state
      const walletState = this.wallet.getState();
      
      if (!walletState.connected) {
        console.warn('Wallet not connected. Cannot initialize SkyToken integration.');
        return;
      }
      
      // Get contract addresses
      const networkId = walletState.networkId;
      const contractAddresses = this.getContractAddresses(networkId);
      
      if (!contractAddresses.skyToken) {
        console.warn(`No SkyToken contract found for network ${networkId}`);
        return;
      }
      
      // Initialize contracts
      await this.initializeContracts(contractAddresses);
      
      // Load initial data
      await this.loadInitialData();
      
      // Setup listeners
      this.setupEventListeners();
      
      // Start refresh intervals
      this.startRefreshIntervals();
      
      console.log('SkyToken integration initialized successfully');
      
      // Notify game
      if (this.game && this.game.onTokenIntegrationReady) {
        this.game.onTokenIntegrationReady();
      }
      
    } catch (error) {
      console.error('Error initializing SkyToken integration:', error);
      
      // Notify game of error
      if (this.game && this.game.onTokenIntegrationError) {
        this.game.onTokenIntegrationError(error);
      }
    }
  }
  
  /**
   * Get contract addresses for a specific network
   * @param {number} networkId - Chain ID of the network
   * @returns {object} Contract addresses for the network
   */
  getContractAddresses(networkId) {
    // Contract addresses by network
    const addresses = {
      // Mainnet
      1: {
        skyToken: '0x0000000000000000000000000000000000000000',
        marketplace: '0x0000000000000000000000000000000000000000',
        trading: '0x0000000000000000000000000000000000000000',
        achievements: '0x0000000000000000000000000000000000000000'
      },
      // Polygon
      137: {
        skyToken: '0x0000000000000000000000000000000000000000',
        marketplace: '0x0000000000000000000000000000000000000000',
        trading: '0x0000000000000000000000000000000000000000',
        achievements: '0x0000000000000000000000000000000000000000'
      },
      // Goerli (Ethereum testnet)
      5: {
        skyToken: '0x0000000000000000000000000000000000000000',
        marketplace: '0x0000000000000000000000000000000000000000',
        trading: '0x0000000000000000000000000000000000000000',
        achievements: '0x0000000000000000000000000000000000000000'
      },
      // Mumbai (Polygon testnet)
      80001: {
        skyToken: '0x0000000000000000000000000000000000000000',
        marketplace: '0x0000000000000000000000000000000000000000',
        trading: '0x0000000000000000000000000000000000000000',
        achievements: '0x0000000000000000000000000000000000000000'
      }
    };
    
    return addresses[networkId] || {};
  }
  
  /**
   * Initialize contract instances
   * @param {object} addresses - Contract addresses
   */
  async initializeContracts(addresses) {
    const provider = this.wallet.getState().provider;
    const signer = provider.getSigner();
    
    // Initialize SkyToken contract
    if (addresses.skyToken) {
      this.contracts.skyToken = new ethers.Contract(
        addresses.skyToken,
        SKY_TOKEN_ABI,
        provider
      );
      
      // Get token details
      try {
        const [symbol, decimals] = await Promise.all([
          this.contracts.skyToken.symbol(),
          this.contracts.skyToken.decimals()
        ]);
        
        this.state.tokenSymbol = symbol;
        this.state.tokenDecimals = decimals;
        
        console.log(`Initialized ${symbol} token with ${decimals} decimals`);
      } catch (error) {
        console.warn('Error getting token details:', error);
      }
    }
    
    // Initialize Marketplace contract
    if (addresses.marketplace) {
      this.contracts.marketplace = new ethers.Contract(
        addresses.marketplace,
        MARKETPLACE_ABI,
        provider
      );
    }
    
    // Initialize Trading contract
    if (addresses.trading) {
      this.contracts.trading = new ethers.Contract(
        addresses.trading,
        TRADING_ABI,
        provider
      );
    }
    
    // Initialize Achievements contract
    if (addresses.achievements) {
      this.contracts.achievements = new ethers.Contract(
        addresses.achievements,
        ACHIEVEMENT_ABI,
        provider
      );
    }
    
    // Connect contracts to signer for write operations
    this.contractsWithSigner = {
      skyToken: this.contracts.skyToken?.connect(signer),
      marketplace: this.contracts.marketplace?.connect(signer),
      trading: this.contracts.trading?.connect(signer),
      achievements: this.contracts.achievements?.connect(signer)
    };
  }
  
  /**
   * Load initial data (balances, transactions, achievements, etc.)
   */
  async loadInitialData() {
    // Start sync
    this.state.syncInProgress = true;
    this.updateUI({ syncInProgress: true });
    
    try {
      // Load data in parallel for efficiency
      await Promise.all([
        this.refreshTokenBalance(),
        this.loadTransactionHistory(),
        this.loadInventory(),
        this.loadTrades(),
        this.loadAchievements()
      ]);
      
      // Load pending rewards from the server
      await this.loadPendingRewards();
      
      // Sync complete
      this.state.syncInProgress = false;
      this.updateUI({ 
        syncInProgress: false,
        tokenBalance: this.state.tokenBalance,
        transactions: this.state.transactions,
        inventory: this.state.inventory,
        pendingRewards: this.state.pendingRewards,
        achievements: this.state.achievements,
        incomingTrades: this.state.incomingTrades,
        outgoingTrades: this.state.outgoingTrades
      });
      
    } catch (error) {
      console.error('Error loading initial data:', error);
      
      // Still mark sync as complete even with error
      this.state.syncInProgress = false;
      this.updateUI({ 
        syncInProgress: false,
        error: error.message
      });
    }
  }
  
  /**
   * Refresh token balance
   */
  async refreshTokenBalance() {
    if (!this.contracts.skyToken) return;
    
    try {
      const address = this.wallet.getState().address;
      const balanceBN = await this.contracts.skyToken.balanceOf(address);
      
      // Format with proper decimals
      const formattedBalance = ethers.utils.formatUnits(balanceBN, this.state.tokenDecimals);
      
      // Update state
      this.state.tokenBalance = formattedBalance;
      this.state.lastBalanceUpdate = Date.now();
      
      // Check for low balance warning
      const lowBalance = parseFloat(formattedBalance) < this.settings.lowBalanceWarningThreshold;
      
      // Update UI
      this.updateUI({ 
        tokenBalance: formattedBalance,
        lowBalance
      });
      
      return formattedBalance;
      
    } catch (error) {
      console.error('Error refreshing token balance:', error);
      return this.state.tokenBalance;
    }
  }
  
  /**
   * Load transaction history
   */
  async loadTransactionHistory() {
    const address = this.wallet.getState().address;
    
    try {
      // We'll combine multiple sources for a complete history:
      // 1. On-chain events (limited to recent blocks)
      // 2. Our backend API (for historical data and off-chain activity)
      
      // Load from chain (last 1000 blocks, approximately 3-4 hours on Ethereum)
      const chainTransactions = await this.loadChainTransactions(address);
      
      // Load from backend
      const apiTransactions = await this.loadApiTransactions(address);
      
      // Combine and deduplicate
      const combinedTransactions = this.mergeTransactions(chainTransactions, apiTransactions);
      
      // Sort by timestamp (newest first)
      combinedTransactions.sort((a, b) => b.timestamp - a.timestamp);
      
      // Update state
      this.state.transactions = combinedTransactions;
      
      return combinedTransactions;
      
    } catch (error) {
      console.error('Error loading transaction history:', error);
      return this.state.transactions;
    }
  }
  
  /**
   * Load transactions from blockchain
   * @param {string} address - User's wallet address
   * @returns {Array} Array of transactions
   */
  async loadChainTransactions(address) {
    if (!this.contracts.skyToken) return [];
    
    try {
      const provider = this.wallet.getState().provider;
      
      // Get current block
      const currentBlock = await provider.getBlockNumber();
      
      // Calculate fromBlock (1000 blocks ago or 0)
      const fromBlock = Math.max(0, currentBlock - 1000);
      
      // Create filters for sent and received tokens
      const sentFilter = this.contracts.skyToken.filters.Transfer(address, null);
      const receivedFilter = this.contracts.skyToken.filters.Transfer(null, address);
      
      // Get events
      const [sentEvents, receivedEvents] = await Promise.all([
        this.contracts.skyToken.queryFilter(sentFilter, fromBlock),
        this.contracts.skyToken.queryFilter(receivedFilter, fromBlock)
      ]);
      
      // Process events into transaction objects
      const processEvents = async (events, type) => {
        return Promise.all(events.map(async (event) => {
          // Get block for timestamp
          const block = await provider.getBlock(event.blockNumber);
          
          return {
            id: `${event.transactionHash}-${event.logIndex}`,
            hash: event.transactionHash,
            type, // 'send' or 'receive'
            from: event.args.from,
            to: event.args.to,
            amount: ethers.utils.formatUnits(event.args.value, this.state.tokenDecimals),
            timestamp: block.timestamp * 1000, // Convert to milliseconds
            blockNumber: event.blockNumber,
            status: 'confirmed',
            source: 'chain',
            description: type === 'send' ? 'Token Transfer Sent' : 'Token Transfer Received'
          };
        }));
      };
      
      // Process both sent and received events
      const sentTransactions = await processEvents(sentEvents, 'send');
      const receivedTransactions = await processEvents(receivedEvents, 'receive');
      
      // Combine
      return [...sentTransactions, ...receivedTransactions];
      
    } catch (error) {
      console.error('Error loading chain transactions:', error);
      return [];
    }
  }
  
  /**
   * Load transactions from API
   * @param {string} address - User's wallet address
   * @returns {Array} Array of transactions
   */
  async loadApiTransactions(address) {
    try {
      const url = `${this.settings.apiBaseUrl}/transactions?address=${address}`;
      
      // Get auth token from wallet manager
      const authToken = this.wallet.getState().authToken;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken ? `Bearer ${authToken}` : ''
        }
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Make sure transactions have 'source' field set to 'api'
      return data.transactions.map(tx => ({
        ...tx,
        source: 'api'
      }));
      
    } catch (error) {
      console.error('Error loading API transactions:', error);
      return [];
    }
  }
  
  /**
   * Merge transactions from different sources, removing duplicates
   * @param {Array} chainTransactions - Transactions from blockchain
   * @param {Array} apiTransactions - Transactions from API
   * @returns {Array} Merged transactions
   */
  mergeTransactions(chainTransactions, apiTransactions) {
    // Use a Map to deduplicate by transaction hash
    const txMap = new Map();
    
    // Add chain transactions to map
    chainTransactions.forEach(tx => {
      txMap.set(tx.id, tx);
    });
    
    // Add API transactions, but don't overwrite chain transactions
    // (chain data is more reliable for confirmed transactions)
    apiTransactions.forEach(tx => {
      if (!txMap.has(tx.id)) {
        txMap.set(tx.id, tx);
      }
    });
    
    // Convert map back to array
    return Array.from(txMap.values());
  }
  
  /**
   * Load user inventory (owned items, NFTs, etc.)
   */
  async loadInventory() {
    try {
      const address = this.wallet.getState().address;
      const url = `${this.settings.apiBaseUrl}/inventory?address=${address}`;
      
      // Get auth token from wallet manager
      const authToken = this.wallet.getState().authToken;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken ? `Bearer ${authToken}` : ''
        }
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Update state
      this.state.inventory = data.inventory;
      
      return data.inventory;
      
    } catch (error) {
      console.error('Error loading inventory:', error);
      return this.state.inventory;
    }
  }
  
  /**
   * Load pending trades (incoming and outgoing)
   */
  async loadTrades() {
    if (!this.contracts.trading) return;
    
    try {
      const address = this.wallet.getState().address;
      
      // Get trade IDs from contract
      const tradeIds = await this.contracts.trading.getMyTrades();
      
      // Load trade details
      const trades = await Promise.all(
        tradeIds.map(id => this.contracts.trading.getTrade(id))
      );
      
      // Process trades
      const processedTrades = trades.map((trade, index) => {
        const tradeId = tradeIds[index];
        const [creator, recipient, itemIds, tokenAmount, deadline, isCompleted, isCancelled] = trade;
        
        // Determine if this is incoming or outgoing
        const isIncoming = recipient.toLowerCase() === address.toLowerCase();
        
        return {
          id: tradeId.toString(),
          creator,
          recipient,
          itemIds,
          tokenAmount: ethers.utils.formatUnits(tokenAmount, this.state.tokenDecimals),
          deadline: deadline.toNumber() * 1000, // Convert to milliseconds
          isCompleted,
          isCancelled,
          isIncoming,
          isOutgoing: !isIncoming,
          isActive: !isCompleted && !isCancelled && deadline.toNumber() * 1000 > Date.now()
        };
      });
      
      // Filter into incoming and outgoing
      const incomingTrades = processedTrades.filter(trade => trade.isIncoming && trade.isActive);
      const outgoingTrades = processedTrades.filter(trade => trade.isOutgoing && trade.isActive);
      
      // Update state
      this.state.incomingTrades = incomingTrades;
      this.state.outgoingTrades = outgoingTrades;
      
      return {
        incoming: incomingTrades,
        outgoing: outgoingTrades
      };
      
    } catch (error) {
      console.error('Error loading trades:', error);
      return {
        incoming: this.state.incomingTrades,
        outgoing: this.state.outgoingTrades
      };
    }
  }
  
  /**
   * Load player achievements and daily streak
   */
  async loadAchievements() {
    if (!this.contracts.achievements) return;
    
    try {
      const address = this.wallet.getState().address;
      
      // Get achievement IDs from contract
      const achievementIds = await this.contracts.achievements.getPlayerAchievements(address);
      
      // Load achievement details
      const achievements = await Promise.all(
        achievementIds.map(id => this.contracts.achievements.getAchievementDetails(id))
      );
      
      // Process achievements
      const processedAchievements = achievements.map((achievement, index) => {
        const [name, description, rewardAmount, repeatable, cooldownPeriod] = achievement;
        return {
          id: achievementIds[index].toString(),
          name,
          description,
          rewardAmount: ethers.utils.formatUnits(rewardAmount, this.state.tokenDecimals),
          repeatable,
          cooldownPeriod: cooldownPeriod.toNumber() * 1000 // Convert to milliseconds
        };
      });
      
      // Get daily streak
      const [streak, lastClaimTime] = await this.contracts.achievements.getDailyStreak(address);
      
      // Update state
      this.state.achievements = processedAchievements;
      this.state.dailyStreak = streak.toNumber();
      this.state.lastDailyClaim = lastClaimTime.toNumber() * 1000; // Convert to milliseconds
      
      return {
        achievements: processedAchievements,
        dailyStreak: streak.toNumber(),
        lastDailyClaim: lastClaimTime.toNumber() * 1000
      };
      
    } catch (error) {
      console.error('Error loading achievements:', error);
      return {
        achievements: this.state.achievements,
        dailyStreak: this.state.dailyStreak,
        lastDailyClaim: this.state.lastDailyClaim
      };
    }
  }
  
  /**
   * Load pending rewards from server
   */
  async loadPendingRewards() {
    try {
      const address = this.wallet.getState().address;
      const url = `${this.settings.apiBaseUrl}/rewards/pending?address=${address}`;
      
      // Get auth token from wallet manager
      const authToken = this.wallet.getState().authToken;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken ? `Bearer ${authToken}` : ''
        }
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Update state
      this.state.pendingRewards = data.rewards;
      
      return data.rewards;
      
    } catch (error) {
      console.error('Error loading pending rewards:', error);
      return this.state.pendingRewards;
    }
  }
  
  /**
   * Setup event listeners for contracts
   */
  setupEventListeners() {
    // Avoid duplicate listeners
    if (this.state.listening) return;
    
    const address = this.wallet.getState().address;
    
    // Listen for token transfers
    if (this.contracts.skyToken) {
      // Transfer events to/from the user
      const incomingFilter = this.contracts.skyToken.filters.Transfer(null, address);
      const outgoingFilter = this.contracts.skyToken.filters.Transfer(address, null);
      
      // Reward events for the user
      const rewardFilter = this.contracts.skyToken.filters.PlayerRewarded(address);
      
      // Setup listeners
      this.contracts.skyToken.on(incomingFilter, this.handleTransferEvent.bind(this));
      this.contracts.skyToken.on(outgoingFilter, this.handleTransferEvent.bind(this));
      this.contracts.skyToken.on(rewardFilter, this.handleRewardEvent.bind(this));
      
      console.log('SkyToken event listeners set up');
    }
    
    // Listen for marketplace events
    if (this.contracts.marketplace) {
      // Listen for listings created by the user
      const listingFilter = this.contracts.marketplace.filters.ListingCreated(null, address);
      
      // Listen for listings sold to the user
      const purchaseFilter = this.contracts.marketplace.filters.ListingSold(null, address);
      
      // Setup listeners
      this.contracts.marketplace.on(listingFilter, this.handleListingEvent.bind(this));
      this.contracts.marketplace.on(purchaseFilter, this.handlePurchaseEvent.bind(this));
      
      console.log('Marketplace event listeners set up');
    }
    
    // Listen for trading events
    if (this.contracts.trading) {
      // Listen for trades where user is creator or recipient
      const tradeCreatedFilter = this.contracts.trading.filters.TradeCreated(null, address, null);
      const tradeReceivedFilter = this.contracts.trading.filters.TradeCreated(null, null, address);
      
      // Setup listeners
      this.contracts.trading.on(tradeCreatedFilter, this.handleTradeEvent.bind(this));
      this.contracts.trading.on(tradeReceivedFilter, this.handleTradeEvent.bind(this));
      
      console.log('Trading event listeners set up');
    }
    
    // Listen for achievement events
    if (this.contracts.achievements) {
      // Listen for achievements unlocked by the user
      const achievementFilter = this.contracts.achievements.filters.AchievementUnlocked(address);
      
      // Listen for daily rewards claimed by the user
      const dailyRewardFilter = this.contracts.achievements.filters.DailyRewardClaimed(address);
      
      // Setup listeners
      this.contracts.achievements.on(achievementFilter, this.handleAchievementEvent.bind(this));
      this.contracts.achievements.on(dailyRewardFilter, this.handleDailyRewardEvent.bind(this));
      
      console.log('Achievement event listeners set up');
    }
    
    // Mark as listening
    this.state.listening = true;
  }
  
  /**
   * Remove event listeners
   */
  removeEventListeners() {
    // Remove SkyToken listeners
    if (this.contracts.skyToken) {
      this.contracts.skyToken.removeAllListeners();
    }
    
    // Remove Marketplace listeners
    if (this.contracts.marketplace) {
      this.contracts.marketplace.removeAllListeners();
    }
    
    // Remove Trading listeners
    if (this.contracts.trading) {
      this.contracts.trading.removeAllListeners();
    }
    
    // Remove Achievement listeners
    if (this.contracts.achievements) {
      this.contracts.achievements.removeAllListeners();
    }
    
    // Mark as not listening
    this.state.listening = false;
    
    console.log('Removed all event listeners');
  }
  
  /**
   * Start refresh intervals
   */
  startRefreshIntervals() {
    // Clear any existing intervals
    this.stopRefreshIntervals();
    
    // Set up balance refresh interval
    this.intervals.balanceRefresh = setInterval(
      () => this.refreshTokenBalance(),
      this.settings.refreshInterval
    );
    
    // Set up trading refresh interval (less frequent)
    this.intervals.tradingRefresh = setInterval(
      () => this.loadTrades(),
      this.settings.refreshInterval * 5
    );
    
    console.log('Refresh intervals started');
  }
  
  /**
   * Stop refresh intervals
   */
  stopRefreshIntervals() {
    // Clear balance refresh interval
    if (this.intervals.balanceRefresh) {
      clearInterval(this.intervals.balanceRefresh);
      this.intervals.balanceRefresh = null;
    }
    
    // Clear trading refresh interval
    if (this.intervals.tradingRefresh) {
      clearInterval(this.intervals.tradingRefresh);
      this.intervals.tradingRefresh = null;
    }
    
    console.log('Refresh intervals stopped');
  }
  
  /**
   * Handle token transfer event
   * @param {string} from - Sender address
   * @param {string} to - Recipient address
   * @param {BigNumber} value - Transfer amount
   * @param {object} event - Event object
   */
  async handleTransferEvent(from, to, value, event) {
    console.log('Transfer event detected:', { from, to, value: value.toString() });
    
    try {
      const userAddress = this.wallet.getState().address;
      
      // Skip if neither sender nor recipient is the user
      if (from.toLowerCase() !== userAddress.toLowerCase() && to.toLowerCase() !== userAddress.toLowerCase()) {
        return;
      }
      
      // Format amount
      const amount = ethers.utils.formatUnits(value, this.state.tokenDecimals);
      
      // Determine transaction type
      const type = from.toLowerCase() === userAddress.toLowerCase() ? 'send' : 'receive';
      
      // Create transaction object
      const transaction = {
        id: `${event.transactionHash}-${event.logIndex}`,
        hash: event.transactionHash,
        type,
        from,
        to,
        amount,
        timestamp: Date.now(), // Will be updated when we get the block
        blockNumber: event.blockNumber,
        status: 'confirmed',
        source: 'chain',
        description: type === 'send' ? 'Token Transfer Sent' : 'Token Transfer Received'
      };
      
      // Add to transactions array (at the beginning)
      this.state.transactions.unshift(transaction);
      
      // Refresh token balance
      await this.refreshTokenBalance();
      
      // Update UI
      this.updateUI({
        transactions: this.state.transactions,
        tokenBalance: this.state.tokenBalance,
        recentTransaction: transaction
      });
      
      // Get the block to update timestamp
      try {
        const provider = this.wallet.getState().provider;
        const block = await provider.getBlock(event.blockNumber);
        
        // Update timestamp
        transaction.timestamp = block.timestamp * 1000; // Convert to milliseconds
        
        // Update transactions array
        this.state.transactions = this.state.transactions.map(tx => 
          tx.id === transaction.id ? transaction : tx
        );
        
        // Update UI with corrected timestamp
        this.updateUI({
          transactions: this.state.transactions
        });
      } catch (error) {
        console.warn('Error getting block for timestamp:', error);
      }
      
      // Notify game
      if (this.game && this.game.onTokenTransfer) {
        this.game.onTokenTransfer(transaction);
      }
      
    } catch (error) {
      console.error('Error handling transfer event:', error);
    }
  }
  
  /**
   * Handle player reward event
   * @param {string} player - Player address
   * @param {BigNumber} amount - Reward amount
   * @param {string} reason - Reward reason
   * @param {object} event - Event object
   */
  async handleRewardEvent(player, amount, reason, event) {
    console.log('Reward event detected:', { player, amount: amount.toString(), reason });
    
    try {
      const userAddress = this.wallet.getState().address;
      
      // Skip if not for this user
      if (player.toLowerCase() !== userAddress.toLowerCase()) {
        return;
      }
      
      // Format amount
      const formattedAmount = ethers.utils.formatUnits(amount, this.state.tokenDecimals);
      
      // Create transaction object
      const transaction = {
        id: `${event.transactionHash}-${event.logIndex}`,
        hash: event.transactionHash,
        type: 'reward',
        from: '0x0000000000000000000000000000000000000000', // Zero address as sender
        to: player,
        amount: formattedAmount,
        timestamp: Date.now(), // Will be updated when we get the block
        blockNumber: event.blockNumber,
        status: 'confirmed',
        source: 'chain',
        description: `Reward: ${reason}`,
        reason
      };
      
      // Add to transactions array (at the beginning)
      this.state.transactions.unshift(transaction);
      
      // Refresh token balance
      await this.refreshTokenBalance();
      
      // Update UI
      this.updateUI({
        transactions: this.state.transactions,
        tokenBalance: this.state.tokenBalance,
        recentTransaction: transaction,
        rewardReceived: {
          amount: formattedAmount,
          reason
        }
      });
      
      // Get the block to update timestamp
      try {
        const provider = this.wallet.getState().provider;
        const block = await provider.getBlock(event.blockNumber);
        
        // Update timestamp
        transaction.timestamp = block.timestamp * 1000; // Convert to milliseconds
        
        // Update transactions array
        this.state.transactions = this.state.transactions.map(tx => 
          tx.id === transaction.id ? transaction : tx
        );
        
        // Update UI with corrected timestamp
        this.updateUI({
          transactions: this.state.transactions
        });
      } catch (error) {
        console.warn('Error getting block for timestamp:', error);
      }
      
      // Notify game
      if (this.game && this.game.onRewardReceived) {
        this.game.onRewardReceived({
          amount: formattedAmount,
          reason,
          transaction
        });
      }
      
    } catch (error) {
      console.error('Error handling reward event:', error);
    }
  }
  
  /**
   * Handle marketplace listing event
   * @param {BigNumber} listingId - Listing ID
   * @param {string} seller - Seller address
   * @param {string} itemType - Item type (e.g., 'aircraft', 'weapon')
   * @param {string} itemId - Item ID
   * @param {BigNumber} price - Listing price
   * @param {object} event - Event object
   */
  async handleListingEvent(listingId, seller, itemType, itemId, price, event) {
    console.log('Listing event detected:', { listingId: listingId.toString(), seller, itemType, itemId, price: price.toString() });
    
    // Refresh inventory
    await this.loadInventory();
    
    // Update UI
    this.updateUI({
      inventory: this.state.inventory
    });
    
    // Notify game
    if (this.game && this.game.onItemListed) {
      this.game.onItemListed({
        listingId: listingId.toString(),
        seller,
        itemType,
        itemId,
        price: ethers.utils.formatUnits(price, this.state.tokenDecimals)
      });
    }
  }
  
  /**
   * Handle marketplace purchase event
   * @param {BigNumber} listingId - Listing ID
   * @param {string} buyer - Buyer address
   * @param {string} seller - Seller address
   * @param {BigNumber} price - Purchase price
   * @param {object} event - Event object
   */
  async handlePurchaseEvent(listingId, buyer, seller, price, event) {
    console.log('Purchase event detected:', { listingId: listingId.toString(), buyer, seller, price: price.toString() });
    
    try {
      const userAddress = this.wallet.getState().address;
      
      // Determine if user is buyer or seller
      const isBuyer = buyer.toLowerCase() === userAddress.toLowerCase();
      const isSeller = seller.toLowerCase() === userAddress.toLowerCase();
      
      // Skip if user is neither buyer nor seller
      if (!isBuyer && !isSeller) {
        return;
      }
      
      // Get item details from local cache or API
      let itemDetails = { itemType: 'unknown', itemId: 'unknown' };
      
      try {
        // Try to get from contract first
        itemDetails = await this.contracts.marketplace.getItemDetails(listingId);
      } catch (error) {
        console.warn('Error getting item details from contract:', error);
        
        // Fall back to API
        try {
          const response = await fetch(`${this.settings.apiBaseUrl}/marketplace/listing/${listingId}`);
          const data = await response.json();
          itemDetails = data.listing;
        } catch (apiError) {
          console.warn('Error getting item details from API:', apiError);
        }
      }
      
      // Format price
      const formattedPrice = ethers.utils.formatUnits(price, this.state.tokenDecimals);
      
      // Create transaction object
      const transaction = {
        id: `${event.transactionHash}-${event.logIndex}`,
        hash: event.transactionHash,
        type: isBuyer ? 'purchase' : 'sale',
        from: isBuyer ? buyer : seller,
        to: isBuyer ? seller : buyer,
        amount: formattedPrice,
        timestamp: Date.now(), // Will be updated when we get the block
        blockNumber: event.blockNumber,
        status: 'confirmed',
        source: 'chain',
        description: isBuyer ? `Purchased ${itemDetails.itemType} #${itemDetails.itemId}` : `Sold ${itemDetails.itemType} #${itemDetails.itemId}`,
        itemDetails: {
          listingId: listingId.toString(),
          itemType: itemDetails.itemType,
          itemId: itemDetails.itemId
        }
      };
      
      // Add to transactions array (at the beginning)
      this.state.transactions.unshift(transaction);
      
      // Refresh token balance
      await this.refreshTokenBalance();
      
      // Refresh inventory
      await this.loadInventory();
      
      // Update UI
      this.updateUI({
        transactions: this.state.transactions,
        tokenBalance: this.state.tokenBalance,
        inventory: this.state.inventory,
        recentTransaction: transaction
      });
      
      // Get the block to update timestamp
      try {
        const provider = this.wallet.getState().provider;
        const block = await provider.getBlock(event.blockNumber);
        
        // Update timestamp
        transaction.timestamp = block.timestamp * 1000; // Convert to milliseconds
        
        // Update transactions array
        this.state.transactions = this.state.transactions.map(tx => 
          tx.id === transaction.id ? transaction : tx
        );
        
        // Update UI with corrected timestamp
        this.updateUI({
          transactions: this.state.transactions
        });
      } catch (error) {
        console.warn('Error getting block for timestamp:', error);
      }
      
      // Notify game
      if (this.game) {
        if (isBuyer && this.game.onItemPurchased) {
          this.game.onItemPurchased({
            listingId: listingId.toString(),
            seller,
            itemType: itemDetails.itemType,
            itemId: itemDetails.itemId,
            price: formattedPrice,
            transaction
          });
        } else if (isSeller && this.game.onItemSold) {
          this.game.onItemSold({
            listingId: listingId.toString(),
            buyer,
            itemType: itemDetails.itemType,
            itemId: itemDetails.itemId,
            price: formattedPrice,
            transaction
          });
        }
      }
      
    } catch (error) {
      console.error('Error handling purchase event:', error);
    }
  }
  
  /**
   * Handle trade events
   * @param {BigNumber} tradeId - Trade ID
   * @param {string} creator - Trade creator address
   * @param {string} recipient - Trade recipient address
   * @param {BigNumber} tokenAmount - Token amount in trade
   * @param {object} event - Event object
   */
  async handleTradeEvent(tradeId, creator, recipient, tokenAmount, event) {
    console.log('Trade event detected:', { 
      tradeId: tradeId.toString(), 
      creator, 
      recipient, 
      tokenAmount: tokenAmount.toString() 
    });
    
    // Refresh trades
    await this.loadTrades();
    
    // Update UI
    this.updateUI({
      incomingTrades: this.state.incomingTrades,
      outgoingTrades: this.state.outgoingTrades
    });
    
    // Notify game
    if (this.game && this.game.onTradeCreated) {
      this.game.onTradeCreated({
        tradeId: tradeId.toString(),
        creator,
        recipient,
        tokenAmount: ethers.utils.formatUnits(tokenAmount, this.state.tokenDecimals)
      });
    }
  }
  
  /**
   * Handle achievement unlock event
   * @param {string} player - Player address
   * @param {BigNumber} achievementId - Achievement ID
   * @param {BigNumber} rewardAmount - Reward amount
   * @param {object} event - Event object
   */
  async handleAchievementEvent(player, achievementId, rewardAmount, event) {
    console.log('Achievement event detected:', { 
      player, 
      achievementId: achievementId.toString(), 
      rewardAmount: rewardAmount.toString() 
    });
    
    // Refresh achievements
    await this.loadAchievements();
    
    // Update UI
    this.updateUI({
      achievements: this.state.achievements
    });
    
    // Notify game
    if (this.game && this.game.onAchievementUnlocked) {
      this.game.onAchievementUnlocked({
        achievementId: achievementId.toString(),
        rewardAmount: ethers.utils.formatUnits(rewardAmount, this.state.tokenDecimals)
      });
    }
  }
  
  /**
   * Handle daily reward event
   * @param {string} player - Player address
   * @param {BigNumber} streak - Current streak
   * @param {BigNumber} rewardAmount - Reward amount
   * @param {object} event - Event object
   */
  async handleDailyRewardEvent(player, streak, rewardAmount, event) {
    console.log('Daily reward event detected:', { 
      player, 
      streak: streak.toString(), 
      rewardAmount: rewardAmount.toString() 
    });
    
    // Refresh achievements and streak
    await this.loadAchievements();
    
    // Update UI
    this.updateUI({
      dailyStreak: this.state.dailyStreak,
      lastDailyClaim: this.state.lastDailyClaim
    });
    
    // Notify game
    if (this.game && this.game.onDailyRewardClaimed) {
      this.game.onDailyRewardClaimed({
        streak: streak.toNumber(),
        rewardAmount: ethers.utils.formatUnits(rewardAmount, this.state.tokenDecimals)
      });
    }
  }
  
  /**
   * Clean up event listeners and intervals
   */
  cleanup() {
    // Stop refresh intervals
    this.stopRefreshIntervals();
    
    // Remove event listeners
    this.removeEventListeners();
    
    console.log('SkyToken integration cleaned up');
  }
  
  /**
   * Update UI with new state
   * @param {object} updates - State updates to reflect in UI
   */
  updateUI(updates) {
    // If no UI manager, just return
    if (!this.ui) return;
    
    // Call UI update method with updates
    if (this.ui.updateTokenUI) {
      this.ui.updateTokenUI(updates);
    }
  }
  
  /**
   * Make an in-game purchase with tokens
   * @param {string} itemId - ID of the item to purchase
   * @param {string} itemType - Type of item (e.g., 'aircraft', 'weapon')
   * @param {string|number} price - Price in tokens
   * @returns {Promise<object>} Transaction receipt
   */
  async purchaseItem(itemId, itemType, price) {
    try {
      // Check if wallet and contract are ready
      if (!this.wallet.getState().connected || !this.contractsWithSigner.skyToken) {
        throw new Error('Wallet not connected or contract not initialized');
      }
      
      // Check if user has enough tokens
      const balance = parseFloat(this.state.tokenBalance);
      const itemPrice = parseFloat(price);
      
      if (balance < itemPrice) {
        throw new Error(`Insufficient token balance. You have ${balance} ${this.state.tokenSymbol} but need ${itemPrice}.`);
      }
      
      // Update UI to show purchase in progress
      this.updateUI({
        purchaseInProgress: true,
        purchaseItem: {
          itemId,
          itemType,
          price
        }
      });
      
      // Two approaches:
      // 1. Direct contract call (if deployed contract exists)
      // 2. Server-side purchase (with signature)
      
      let transaction;
      let receipt;
      
      // Try contract approach first
      if (this.contractsWithSigner.marketplace) {
        // First need to approve tokens for marketplace
        const marketplace = this.contractsWithSigner.marketplace.address;
        const priceWei = ethers.utils.parseUnits(price.toString(), this.state.tokenDecimals);
        
        // Check current allowance
        const allowance = await this.contracts.skyToken.allowance(
          this.wallet.getState().address,
          marketplace
        );
        
        // If allowance is insufficient, approve tokens
        if (allowance.lt(priceWei)) {
          const approveTx = await this.contractsWithSigner.skyToken.approve(
            marketplace,
            priceWei
          );
          
          // Wait for approval transaction to be mined
          await approveTx.wait();
          
          console.log('Token approval successful');
        }
        
        // Now make the purchase
        const purchaseTx = await this.contractsWithSigner.marketplace.createListing(
          itemType,
          itemId,
          priceWei
        );
        
        // Wait for purchase transaction to be mined
        receipt = await purchaseTx.wait();
        
        transaction = {
          hash: purchaseTx.hash,
          type: 'purchase',
          from: this.wallet.getState().address,
          to: marketplace,
          amount: price.toString(),
          itemId,
          itemType,
          timestamp: Date.now(),
          blockNumber: receipt.blockNumber,
          status: receipt.status === 1 ? 'confirmed' : 'failed'
        };
      } else {
        // Fall back to server-side purchase with signature
        // Get message to sign
        const response = await fetch(`${this.settings.apiBaseUrl}/marketplace/purchase/prepare`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.wallet.getState().authToken}`
          },
          body: JSON.stringify({
            itemId,
            itemType,
            price: price.toString()
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to prepare purchase');
        }
        
        const { message, nonce } = await response.json();
        
        // Sign the message
        const signature = await this.wallet.getState().provider.getSigner().signMessage(message);
        
        // Complete purchase on server
        const completionResponse = await fetch(`${this.settings.apiBaseUrl}/marketplace/purchase/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.wallet.getState().authToken}`
          },
          body: JSON.stringify({
            itemId,
            itemType,
            price: price.toString(),
            nonce,
            signature
          })
        });
        
        if (!completionResponse.ok) {
          const errorData = await completionResponse.json();
          throw new Error(errorData.message || 'Failed to complete purchase');
        }
        
        const completionData = await completionResponse.json();
        
        transaction = {
          hash: completionData.transactionHash || 'server-side',
          type: 'purchase',
          from: this.wallet.getState().address,
          to: completionData.marketplaceAddress || 'server',
          amount: price.toString(),
          itemId,
          itemType,
          timestamp: Date.now(),
          status: 'confirmed',
          source: 'api'
        };
        
        receipt = { status: 1 };
      }
      
      // Add transaction to history
      this.state.transactions.unshift(transaction);
      
      // Refresh token balance
      await this.refreshTokenBalance();
      
      // Refresh inventory with new item
      await this.loadInventory();
      
      // Update UI with purchase complete
      this.updateUI({
        purchaseInProgress: false,
        purchaseComplete: true,
        purchaseSuccess: receipt.status === 1,
        transactions: this.state.transactions,
        tokenBalance: this.state.tokenBalance,
        inventory: this.state.inventory,
        recentTransaction: transaction
      });
      
      // Notify game
      if (this.game && this.game.onItemPurchased) {
        this.game.onItemPurchased({
          itemId,
          itemType,
          price: price.toString(),
          success: receipt.status === 1,
          transaction
        });
      }
      
      return { success: receipt.status === 1, transaction, receipt };
      
    } catch (error) {
      console.error('Purchase error:', error);
      
      // Update UI with error
      this.updateUI({
        purchaseInProgress: false,
        purchaseComplete: true,
        purchaseSuccess: false,
        purchaseError: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Claim a token reward for an achievement or action
   * @param {string} achievementId - ID of the achievement
   * @returns {Promise<object>} Transaction receipt
   */
  async claimAchievementReward(achievementId) {
    try {
      // Check if wallet is connected
      if (!this.wallet.getState().connected) {
        throw new Error('Wallet not connected');
      }
      
      // Update UI
      this.updateUI({
        claimInProgress: true,
        claimAchievement: achievementId
      });
      
      // Get achievement signature from server
      const response = await fetch(`${this.settings.apiBaseUrl}/achievements/signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.wallet.getState().authToken}`
        },
        body: JSON.stringify({
          achievementId
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to get achievement signature');
      }
      
      const { signature } = await response.json();
      
      // Call contract with signature
      const tx = await this.contractsWithSigner.achievements.unlockAchievement(
        this.wallet.getState().address,
        achievementId,
        signature
      );
      
      // Wait for transaction to be mined
      const receipt = await tx.wait();
      
      // Refresh achievements
      await this.loadAchievements();
      
      // Refresh token balance (will be updated by event handlers too)
      await this.refreshTokenBalance();
      
      // Update UI
      this.updateUI({
        claimInProgress: false,
        claimComplete: true,
        claimSuccess: receipt.status === 1,
        achievements: this.state.achievements,
        tokenBalance: this.state.tokenBalance
      });
      
      return { success: receipt.status === 1, receipt };
      
    } catch (error) {
      console.error('Error claiming achievement reward:', error);
      
      // Update UI with error
      this.updateUI({
        claimInProgress: false,
        claimComplete: true,
        claimSuccess: false,
        claimError: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Claim daily reward
   * @returns {Promise<object>} Transaction receipt
   */
  async claimDailyReward() {
    try {
      // Check if wallet is connected
      if (!this.wallet.getState().connected) {
        throw new Error('Wallet not connected');
      }
      
      // Check if daily reward is available
      const now = Date.now();
      const lastClaim = this.state.lastDailyClaim || 0;
      const oneDayMs = 24 * 60 * 60 * 1000;
      
      if (now - lastClaim < oneDayMs) {
        throw new Error('Daily reward not yet available. Please come back tomorrow.');
      }
      
      // Update UI
      this.updateUI({
        dailyClaimInProgress: true
      });
      
      // Get signature from server
      const response = await fetch(`${this.settings.apiBaseUrl}/daily/signature`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.wallet.getState().authToken}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to get daily reward signature');
      }
      
      const { signature } = await response.json();
      
      // Call contract with signature
      const tx = await this.contractsWithSigner.achievements.claimDailyReward(
        this.wallet.getState().address,
        signature
      );
      
      // Wait for transaction to be mined
      const receipt = await tx.wait();
      
      // Refresh achievements and streak
      await this.loadAchievements();
      
      // Refresh token balance
      await this.refreshTokenBalance();
      
      // Update UI
      this.updateUI({
        dailyClaimInProgress: false,
        dailyClaimComplete: true,
        dailyClaimSuccess: receipt.status === 1,
        dailyStreak: this.state.dailyStreak,
        lastDailyClaim: this.state.lastDailyClaim,
        tokenBalance: this.state.tokenBalance
      });
      
      return { success: receipt.status === 1, receipt, streak: this.state.dailyStreak };
      
    } catch (error) {
      console.error('Error claiming daily reward:', error);
      
      // Update UI with error
      this.updateUI({
        dailyClaimInProgress: false,
        dailyClaimComplete: true,
        dailyClaimSuccess: false,
        dailyClaimError: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Create a new trade offer with another player
   * @param {string} recipientAddress - Address of trade recipient
   * @param {Array<string>} itemIds - Array of item IDs to trade
   * @param {string|number} tokenAmount - Amount of tokens to include in trade
   * @param {number} validityPeriod - How long the trade is valid for (in hours)
   * @returns {Promise<object>} Trade result
   */
  async createTrade(recipientAddress, itemIds, tokenAmount, validityPeriod = 24) {
    try {
      // Check if wallet and contract are ready
      if (!this.wallet.getState().connected || !this.contractsWithSigner.trading) {
        throw new Error('Wallet not connected or contract not initialized');
      }
      
      // Validate recipient address
      if (!ethers.utils.isAddress(recipientAddress)) {
        throw new Error('Invalid recipient address');
      }
      
      // Check if user has enough tokens
      const balance = parseFloat(this.state.tokenBalance);
      const amount = parseFloat(tokenAmount);
      
      if (amount > 0 && balance < amount) {
        throw new Error(`Insufficient token balance. You have ${balance} ${this.state.tokenSymbol} but need ${amount}.`);
      }
      
      // Update UI
      this.updateUI({
        tradeCreationInProgress: true,
        tradeCreationDetails: {
          recipient: recipientAddress,
          itemIds,
          tokenAmount
        }
      });
      
      // Calculate deadline
      const deadline = Math.floor(Date.now() / 1000) + (validityPeriod * 60 * 60);
      
      // Convert token amount to proper format
      const amountWei = ethers.utils.parseUnits(tokenAmount.toString(), this.state.tokenDecimals);
      
      // If token amount > 0, we need to approve the trading contract
      if (amount > 0) {
        // Check current allowance
        const tradingContract = this.contractsWithSigner.trading.address;
        const allowance = await this.contracts.skyToken.allowance(
          this.wallet.getState().address,
          tradingContract
        );
        
        // If allowance is insufficient, approve tokens
        if (allowance.lt(amountWei)) {
          const approveTx = await this.contractsWithSigner.skyToken.approve(
            tradingContract,
            amountWei
          );
          
          // Wait for approval transaction to be mined
          await approveTx.wait();
          
          console.log('Token approval for trade successful');
        }
      }
      
      // Create the trade
      const tx = await this.contractsWithSigner.trading.createTrade(
        recipientAddress,
        itemIds,
        amountWei,
        deadline
      );
      
      // Wait for transaction to be mined
      const receipt = await tx.wait();
      
      // Get trade ID from events
      let tradeId = null;
      if (receipt.events) {
        const event = receipt.events.find(e => e.event === 'TradeCreated');
        if (event && event.args) {
          tradeId = event.args.tradeId.toString();
        }
      }
      
      // Refresh trades
      await this.loadTrades();
      
      // If tokens were included, refresh balance
      if (amount > 0) {
        await this.refreshTokenBalance();
      }
      
      // Update UI
      this.updateUI({
        tradeCreationInProgress: false,
        tradeCreationComplete: true,
        tradeCreationSuccess: receipt.status === 1,
        outgoingTrades: this.state.outgoingTrades,
        tokenBalance: this.state.tokenBalance
      });
      
      // Notify game
      if (this.game && this.game.onTradeCreated) {
        this.game.onTradeCreated({
          tradeId,
          recipient: recipientAddress,
          itemIds,
          tokenAmount: tokenAmount.toString(),
          deadline
        });
      }
      
      return { 
        success: receipt.status === 1, 
        tradeId, 
        receipt 
      };
      
    } catch (error) {
      console.error('Error creating trade:', error);
      
      // Update UI with error
      this.updateUI({
        tradeCreationInProgress: false,
        tradeCreationComplete: true,
        tradeCreationSuccess: false,
        tradeCreationError: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Accept an incoming trade
   * @param {string} tradeId - ID of the trade to accept
   * @returns {Promise<object>} Trade acceptance result
   */
  async acceptTrade(tradeId) {
    try {
      // Check if wallet and contract are ready
      if (!this.wallet.getState().connected || !this.contractsWithSigner.trading) {
        throw new Error('Wallet not connected or contract not initialized');
      }
      
      // Find the trade in incoming trades
      const trade = this.state.incomingTrades.find(t => t.id === tradeId);
      
      if (!trade) {
        throw new Error(`Trade ${tradeId} not found or not available for acceptance`);
      }
      
      // Update UI
      this.updateUI({
        tradeAcceptInProgress: true,
        tradeAcceptId: tradeId
      });
      
      // Accept the trade
      const tx = await this.contractsWithSigner.trading.acceptTrade(tradeId);
      
      // Wait for transaction to be mined
      const receipt = await tx.wait();
      
      // Refresh trades
      await this.loadTrades();
      
      // Refresh token balance
      await this.refreshTokenBalance();
      
      // Refresh inventory
      await this.loadInventory();
      
      // Update UI
      this.updateUI({
        tradeAcceptInProgress: false,
        tradeAcceptComplete: true,
        tradeAcceptSuccess: receipt.status === 1,
        incomingTrades: this.state.incomingTrades,
        tokenBalance: this.state.tokenBalance,
        inventory: this.state.inventory
      });
      
      // Notify game
      if (this.game && this.game.onTradeAccepted) {
        this.game.onTradeAccepted({
          tradeId,
          success: receipt.status === 1
        });
      }
      
      return { success: receipt.status === 1, receipt };
      
    } catch (error) {
      console.error('Error accepting trade:', error);
      
      // Update UI with error
      this.updateUI({
        tradeAcceptInProgress: false,
        tradeAcceptComplete: true,
        tradeAcceptSuccess: false,
        tradeAcceptError: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Cancel a trade you've created
   * @param {string} tradeId - ID of the trade to cancel
   * @returns {Promise<object>} Trade cancellation result
   */
  async cancelTrade(tradeId) {
    try {
      // Check if wallet and contract are ready
      if (!this.wallet.getState().connected || !this.contractsWithSigner.trading) {
        throw new Error('Wallet not connected or contract not initialized');
      }
      
      // Find the trade in outgoing trades
      const trade = this.state.outgoingTrades.find(t => t.id === tradeId);
      
      if (!trade) {
        throw new Error(`Trade ${tradeId} not found or not available for cancellation`);
      }
      
      // Update UI
      this.updateUI({
        tradeCancelInProgress: true,
        tradeCancelId: tradeId
      });
      
      // Cancel the trade
      const tx = await this.contractsWithSigner.trading.cancelTrade(tradeId);
      
      // Wait for transaction to be mined
      const receipt = await tx.wait();
      
      // Refresh trades
      await this.loadTrades();
      
      // Refresh token balance (if tokens were in the trade)
      await this.refreshTokenBalance();
      
      // Update UI
      this.updateUI({
        tradeCancelInProgress: false,
        tradeCancelComplete: true,
        tradeCancelSuccess: receipt.status === 1,
        outgoingTrades: this.state.outgoingTrades,
        tokenBalance: this.state.tokenBalance
      });
      
      // Notify game
      if (this.game && this.game.onTradeCancelled) {
        this.game.onTradeCancelled({
          tradeId,
          success: receipt.status === 1
        });
      }
      
      return { success: receipt.status === 1, receipt };
      
    } catch (error) {
      console.error('Error cancelling trade:', error);
      
      // Update UI with error
      this.updateUI({
        tradeCancelInProgress: false,
        tradeCancelComplete: true,
        tradeCancelSuccess: false,
        tradeCancelError: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Gas-efficient batch reward distribution
   * @param {Array<string>} addresses - Array of recipient addresses
   * @param {Array<string|number>} amounts - Array of reward amounts
   * @returns {Promise<object>} Batch reward result
   */
  async batchRewardPlayers(addresses, amounts) {
    try {
      // Check if wallet and contract are ready
      if (!this.wallet.getState().connected || !this.contractsWithSigner.skyToken) {
        throw new Error('Wallet not connected or contract not initialized');
      }
      
      // Check for admin role
      const userAddress = this.wallet.getState().address;
      
      // This would depend on your contract implementation
      // const isAdmin = await this.contracts.skyToken.hasRole('REWARDER_ROLE', userAddress);
      // if (!isAdmin) {
      //   throw new Error('You do not have permission to distribute rewards');
      // }
      
      // Validate input arrays
      if (addresses.length !== amounts.length) {
        throw new Error('Address and amount arrays must have the same length');
      }
      
      if (addresses.length === 0) {
        throw new Error('No recipients specified');
      }
      
      // Update UI
      this.updateUI({
        batchRewardInProgress: true,
        batchRewardDetails: {
          recipientCount: addresses.length,
          totalAmount: amounts.reduce((sum, amount) => sum + parseFloat(amount), 0).toString()
        }
      });
      
      // Process in batches to avoid gas limits
      const results = [];
      const batchSize = this.settings.batchSize;
      
      for (let i = 0; i < addresses.length; i += batchSize) {
        // Get batch
        const addressBatch = addresses.slice(i, i + batchSize);
        const amountBatch = amounts.slice(i, i + batchSize);
        
        // Format amounts
        const formattedAmounts = amountBatch.map(amount => 
          ethers.utils.parseUnits(amount.toString(), this.state.tokenDecimals)
        );
        
        // Perform batch operation
        const tx = await this.contractsWithSigner.skyToken.batchReward(
          addressBatch,
          formattedAmounts
        );
        
        // Wait for transaction to be mined
        const receipt = await tx.wait();
        
        // Store result
        results.push({
          transactionHash: tx.hash,
          status: receipt.status === 1 ? 'success' : 'failed',
          batch: {
            startIndex: i,
            endIndex: Math.min(i + batchSize, addresses.length) - 1,
            count: addressBatch.length
          }
        });
        
        // Update UI with progress
        this.updateUI({
          batchRewardProgress: {
            current: Math.min(i + batchSize, addresses.length),
            total: addresses.length,
            results
          }
        });
      }
      
      // Update UI
      this.updateUI({
        batchRewardInProgress: false,
        batchRewardComplete: true,
        batchRewardSuccess: results.every(r => r.status === 'success'),
        batchRewardResults: results
      });
      
      // Notify game
      if (this.game && this.game.onBatchRewardComplete) {
        this.game.onBatchRewardComplete({
          results,
          success: results.every(r => r.status === 'success')
        });
      }
      
      return { 
        success: results.every(r => r.status === 'success'),
        results 
      };
      
    } catch (error) {
      console.error('Error processing batch rewards:', error);
      
      // Update UI with error
      this.updateUI({
        batchRewardInProgress: false,
        batchRewardComplete: true,
        batchRewardSuccess: false,
        batchRewardError: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Get gas estimate for a transaction
   * @param {object} contractMethod - Contract method to estimate gas for
   * @param {Array} params - Parameters for the contract method
   * @returns {Promise<object>} Gas estimate and price info
   */
  async estimateGas(contractMethod, params) {
    try {
      // Get gas estimate
      const gasEstimate = await contractMethod(...params).estimateGas();
      
      // Get current gas price
      const provider = this.wallet.getState().provider;
      const gasPrice = await provider.getGasPrice();
      
      // Calculate gas cost
      const gasCost = gasEstimate.mul(gasPrice);
      
      // Format for human readability
      const formattedGasEstimate = gasEstimate.toString();
      const formattedGasPrice = ethers.utils.formatUnits(gasPrice, 'gwei');
      const formattedGasCost = ethers.utils.formatEther(gasCost);
      
      return {
        gasEstimate,
        gasPrice,
        gasCost,
        formatted: {
          gasEstimate: formattedGasEstimate,
          gasPrice: `${formattedGasPrice} gwei`,
          gasCost: `${formattedGasCost} ETH`
        }
      };
      
    } catch (error) {
      console.error('Error estimating gas:', error);
      throw error;
    }
  }
  
  /**
   * Get contract state
   * @returns {object} Current contract state for debugging
   */
  getContractState() {
    return {
      skyToken: this.contracts.skyToken?.address || null,
      marketplace: this.contracts.marketplace?.address || null,
      trading: this.contracts.trading?.address || null,
      achievements: this.contracts.achievements?.address || null,
      hasContracts: {
        skyToken: !!this.contracts.skyToken,
        marketplace: !!this.contracts.marketplace,
        trading: !!this.contracts.trading,
        achievements: !!this.contracts.achievements
      }
    };
  }
  
  /**
   * Get current token state
   * @returns {object} Current token state
   */
  getTokenState() {
    return {
      balance: this.state.tokenBalance,
      symbol: this.state.tokenSymbol,
      decimals: this.state.tokenDecimals,
      lastUpdate: this.state.lastBalanceUpdate
    };
  }
}

/**
 * Usage Example:
 * 
 * import { WalletManager } from './wallet/SkyWarsWallet.js';
 * import { SkyTokenIntegration } from './tokens/SkyTokenIntegration.js';
 * 
 * // Initialize wallet manager
 * const walletManager = new WalletManager(gameInstance, uiInstance);
 * 
 * // Initialize token integration
 * const tokens = new SkyTokenIntegration(walletManager, gameInstance, uiInstance);
 * 
 * // In UI component, subscribe to token updates
 * uiInstance.updateTokenUI = function(updates) {
 *   if (updates.tokenBalance !== undefined) {
 *     document.getElementById('token-balance').textContent = updates.tokenBalance;
 *   }
 *   
 *   if (updates.transactions) {
 *     renderTransactionHistory(updates.transactions);
 *   }
 *   
 *   if (updates.rewardReceived) {
 *     showRewardAnimation(updates.rewardReceived.amount, updates.rewardReceived.reason);
 *   }
 * };
 * 
 * // Purchase an item
 * async function buyItem(itemId, itemType, price) {
 *   try {
 *     await tokens.purchaseItem(itemId, itemType, price);
 *     showSuccess('Item purchased successfully!');
 *   } catch (error) {
 *     showError(`Purchase failed: ${error.message}`);
 *   }
 * }
 * 
 * // Create trade with another player
 * async function createTrade(recipientAddress, itemIds, tokenAmount) {
 *   try {
 *     const result = await tokens.createTrade(recipientAddress, itemIds, tokenAmount);
 *     showSuccess(`Trade created with ID: ${result.tradeId}`);
 *   } catch (error) {
 *     showError(`Failed to create trade: ${error.message}`);
 *   }
 * }
 * 
 * // Clean up when done
 * function onGameExit() {
 *   tokens.cleanup();
 * }
 */