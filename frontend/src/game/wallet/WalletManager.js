/**
 * SkyWars Wallet Integration
 * 
 * A comprehensive wallet connection system for the SkyWars plane game
 * supporting MetaMask, WalletConnect, and Coinbase Wallet.
 */

import { ethers } from 'ethers';
import WalletConnectProvider from '@walletconnect/web3-provider';
import CoinbaseWalletSDK from '@coinbase/wallet-sdk';

// SkyToken Contract ABI - Just the functions we need
const SKY_TOKEN_ABI = [
  // Read functions
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  // Write functions
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
];

// Aircraft NFT Contract ABI
const AIRCRAFT_NFT_ABI = [
  // Read functions
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  // Write functions
  "function transferFrom(address from, address to, uint256 tokenId) returns ()",
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];

// Contract addresses (set these to your deployed contract addresses)
const CONTRACT_ADDRESSES = {
  // Mainnet
  1: {
    skyToken: '0x0000000000000000000000000000000000000000',
    aircraftNFT: '0x0000000000000000000000000000000000000000',
    marketplace: '0x0000000000000000000000000000000000000000'
  },
  // Polygon
  137: {
    skyToken: '0x0000000000000000000000000000000000000000',
    aircraftNFT: '0x0000000000000000000000000000000000000000',
    marketplace: '0x0000000000000000000000000000000000000000'
  },
  // Goerli (Ethereum testnet)
  5: {
    skyToken: '0x0000000000000000000000000000000000000000',
    aircraftNFT: '0x0000000000000000000000000000000000000000',
    marketplace: '0x0000000000000000000000000000000000000000'
  },
  // Mumbai (Polygon testnet)
  80001: {
    skyToken: '0x0000000000000000000000000000000000000000',
    aircraftNFT: '0x0000000000000000000000000000000000000000',
    marketplace: '0x0000000000000000000000000000000000000000'
  }
};

// Supported networks
const SUPPORTED_NETWORKS = {
  1: {
    chainId: '0x1',
    chainName: 'Ethereum Mainnet',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    },
    rpcUrls: ['https://mainnet.infura.io/v3/YOUR_INFURA_KEY'],
    blockExplorerUrls: ['https://etherscan.io']
  },
  137: {
    chainId: '0x89',
    chainName: 'Polygon Mainnet',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18
    },
    rpcUrls: ['https://polygon-rpc.com/'],
    blockExplorerUrls: ['https://polygonscan.com']
  },
  5: {
    chainId: '0x5',
    chainName: 'Goerli Testnet',
    nativeCurrency: {
      name: 'Goerli Ether',
      symbol: 'ETH',
      decimals: 18
    },
    rpcUrls: ['https://goerli.infura.io/v3/YOUR_INFURA_KEY'],
    blockExplorerUrls: ['https://goerli.etherscan.io']
  },
  80001: {
    chainId: '0x13881',
    chainName: 'Mumbai Testnet',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18
    },
    rpcUrls: ['https://rpc-mumbai.maticvigil.com'],
    blockExplorerUrls: ['https://mumbai.polygonscan.com']
  }
};

// Default network to use
const DEFAULT_NETWORK = 137; // Polygon Mainnet

/**
 * Main wallet manager for SkyWars
 */
export class WalletManager {
  constructor(game, uiManager, options = {}) {
    // Core references
    this.game = game;
    this.ui = uiManager;
    
    // Options with defaults
    this.options = {
      preferredNetwork: DEFAULT_NETWORK,
      autoConnect: true,
      walletConnectProjectId: 'YOUR_WALLET_CONNECT_PROJECT_ID',
      coinbaseAppName: 'SkyWars',
      coinbaseAppLogoUrl: 'https://skywars.example.com/logo.png',
      infuraKey: 'YOUR_INFURA_KEY',
      alchemyKey: 'YOUR_ALCHEMY_KEY',
      authServerUrl: 'https://auth.skywars.example.com',
      ...options
    };
    
    // Wallet state
    this.state = {
      connected: false,
      connecting: false,
      address: null,
      networkId: null,
      provider: null,
      walletType: null,
      ethBalance: '0',
      skyTokenBalance: '0',
      authToken: null,
      authenticated: false,
      error: null,
      nfts: []
    };
    
    // Keep track of transaction history
    this.transactions = [];
    
    // Contract instances
    this.contracts = {
      skyToken: null,
      aircraftNFT: null
    };
    
    // Initialize event listeners
    this.initializeEventListeners();
  }
  
  /**
   * Initialize event listeners
   */
  initializeEventListeners() {
    this.listeners = {
      accountsChanged: this.handleAccountsChanged.bind(this),
      chainChanged: this.handleChainChanged.bind(this),
      disconnect: this.handleDisconnect.bind(this)
    };
  }
  
  /**
   * Connect to a wallet
   * @param {string} walletType - 'metamask', 'walletconnect', or 'coinbase'
   * @returns {Promise<boolean>} Connection success
   */
  async connect(walletType) {
    try {
      // If already connected, disconnect first
      if (this.state.connected) {
        await this.disconnect();
      }
      
      // Update state
      this.state.connecting = true;
      this.state.walletType = walletType;
      this.state.error = null;
      
      // Notify UI of connection attempt
      if (this.ui) {
        this.ui.updateWalletUI({ connecting: true, walletType });
      }
      
      // Initialize provider based on wallet type
      let provider;
      
      switch (walletType) {
        case 'metamask':
          provider = await this.connectMetaMask();
          break;
        case 'walletconnect':
          provider = await this.connectWalletConnect();
          break;
        case 'coinbase':
          provider = await this.connectCoinbaseWallet();
          break;
        default:
          throw new Error(`Unsupported wallet type: ${walletType}`);
      }
      
      // If provider is null, connection failed
      if (!provider) {
        throw new Error(`Failed to connect to ${walletType}`);
      }
      
      // Create ethers.js provider and signer
      this.state.provider = new ethers.providers.Web3Provider(provider, 'any');
      this.signer = this.state.provider.getSigner();
      
      // Get connected accounts
      const accounts = await this.state.provider.listAccounts();
      
      if (accounts.length === 0) {
        throw new Error('No accounts found. Please unlock your wallet and try again.');
      }
      
      // Set active account
      this.state.address = accounts[0];
      
      // Get current network
      const network = await this.state.provider.getNetwork();
      this.state.networkId = network.chainId;
      
      // Check if network is supported
      if (!this.isNetworkSupported(this.state.networkId)) {
        // Try to switch to preferred network
        try {
          await this.switchNetwork(this.options.preferredNetwork);
        } catch (error) {
          console.warn(`Failed to switch network: ${error.message}`);
          // Continue with current network for now
        }
      }
      
      // Initialize contracts
      this.initializeContracts();
      
      // Get balances
      await this.refreshBalances();
      
      // Get owned NFTs
      await this.loadOwnedNFTs();
      
      // Authenticate with server
      if (this.options.authServerUrl) {
        await this.authenticate();
      }
      
      // Setup event listeners
      this.setupWalletEventListeners();
      
      // Update state
      this.state.connected = true;
      this.state.connecting = false;
      
      // Save connection info to local storage for auto-reconnect
      this.saveConnectionInfo();
      
      // Notify UI of successful connection
      if (this.ui) {
        this.ui.updateWalletUI({
          connected: true,
          connecting: false,
          address: this.state.address,
          networkId: this.state.networkId,
          ethBalance: this.state.ethBalance,
          skyTokenBalance: this.state.skyTokenBalance,
          walletType: this.state.walletType
        });
      }
      
      // Notify game of successful connection
      if (this.game && this.game.onWalletConnected) {
        this.game.onWalletConnected(this.state);
      }
      
      console.log(`Connected to ${walletType} wallet: ${this.state.address}`);
      return true;
      
    } catch (error) {
      // Handle connection error
      this.state.connected = false;
      this.state.connecting = false;
      this.state.error = error.message;
      
      console.error(`Wallet connection error:`, error);
      
      // Notify UI of connection error
      if (this.ui) {
        this.ui.updateWalletUI({
          connected: false,
          connecting: false,
          error: error.message
        });
      }
      
      // Notify game of connection error
      if (this.game && this.game.onWalletError) {
        this.game.onWalletError(error);
      }
      
      return false;
    }
  }
  
  /**
   * Connect to MetaMask
   * @returns {Promise<object>} Provider object
   */
  async connectMetaMask() {
    // Check if MetaMask is installed
    if (!window.ethereum || !window.ethereum.isMetaMask) {
      throw new Error('MetaMask is not installed. Please install MetaMask and try again.');
    }
    
    try {
      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      return window.ethereum;
    } catch (error) {
      if (error.code === 4001) {
        // User rejected the connection
        throw new Error('Connection rejected. Please approve the connection request in MetaMask.');
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Connect to WalletConnect
   * @returns {Promise<object>} Provider object
   */
  async connectWalletConnect() {
    try {
      // Initialize WalletConnect Provider
      const provider = new WalletConnectProvider({
        projectId: this.options.walletConnectProjectId,
        rpc: Object.keys(SUPPORTED_NETWORKS).reduce((obj, chainId) => {
          obj[chainId] = SUPPORTED_NETWORKS[chainId].rpcUrls[0];
          return obj;
        }, {})
      });
      
      // Enable session
      await provider.enable();
      return provider;
      
    } catch (error) {
      if (error.message.includes('User closed')) {
        throw new Error('Connection cancelled. Please approve the connection request in your wallet.');
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Connect to Coinbase Wallet
   * @returns {Promise<object>} Provider object
   */
  async connectCoinbaseWallet() {
    try {
      // Initialize Coinbase Wallet SDK
      const coinbaseWallet = new CoinbaseWalletSDK({
        appName: this.options.coinbaseAppName,
        appLogoUrl: this.options.coinbaseAppLogoUrl,
        darkMode: false
      });
      
      // Initialize a Web3 Provider
      const provider = coinbaseWallet.makeWeb3Provider(
        `https://mainnet.infura.io/v3/${this.options.infuraKey}`,
        this.options.preferredNetwork
      );
      
      // Request account access
      await provider.enable();
      return provider;
      
    } catch (error) {
      if (error.message.includes('User denied account access')) {
        throw new Error('Connection cancelled. Please approve the connection request in Coinbase Wallet.');
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Disconnect wallet
   */
  async disconnect() {
    if (!this.state.connected) return;
    
    try {
      // Remove event listeners
      this.removeWalletEventListeners();
      
      // Provider-specific disconnect logic
      if (this.state.walletType === 'walletconnect' && this.state.provider) {
        // WalletConnect requires explicit disconnect
        const provider = this.state.provider.provider;
        if (provider && provider.disconnect) {
          await provider.disconnect();
        }
      }
      
      // Reset state
      this.state = {
        connected: false,
        connecting: false,
        address: null,
        networkId: null,
        provider: null,
        walletType: null,
        ethBalance: '0',
        skyTokenBalance: '0',
        authToken: null,
        authenticated: false,
        error: null,
        nfts: []
      };
      
      // Clear contract instances
      this.contracts = {
        skyToken: null,
        aircraftNFT: null
      };
      
      // Clear connection info from local storage
      this.clearConnectionInfo();
      
      // Notify UI of disconnection
      if (this.ui) {
        this.ui.updateWalletUI({
          connected: false,
          connecting: false,
          address: null,
          networkId: null,
          ethBalance: '0',
          skyTokenBalance: '0'
        });
      }
      
      // Notify game of disconnection
      if (this.game && this.game.onWalletDisconnected) {
        this.game.onWalletDisconnected();
      }
      
      console.log('Wallet disconnected');
      
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      
      // Still reset our internal state even if the disconnect has an error
      this.state.connected = false;
      this.state.provider = null;
      
      // Notify UI of error
      if (this.ui) {
        this.ui.updateWalletUI({
          connected: false,
          error: error.message
        });
      }
    }
  }
  
  /**
   * Authenticate with the game server
   * @returns {Promise<boolean>} Authentication success
   */
  async authenticate() {
    if (!this.state.connected || !this.state.address) {
      throw new Error('Wallet not connected. Cannot authenticate.');
    }
    
    try {
      // Generate a random nonce for signing
      const nonce = Math.floor(Math.random() * 1000000).toString();
      const timestamp = Date.now().toString();
      
      // Create message to sign
      const message = 
        `Welcome to SkyWars!\n\n` +
        `Sign this message to authenticate your wallet and log in to the game.\n\n` +
        `This request will not trigger a blockchain transaction or cost any gas fees.\n\n` +
        `Wallet address: ${this.state.address}\n` +
        `Nonce: ${nonce}\n` +
        `Timestamp: ${timestamp}`;
      
      // Ask user to sign the message
      const signature = await this.signer.signMessage(message);
      
      // Verify signature before sending to server
      const recoveredAddress = ethers.utils.verifyMessage(message, signature);
      
      if (recoveredAddress.toLowerCase() !== this.state.address.toLowerCase()) {
        throw new Error('Signature verification failed. Invalid signature.');
      }
      
      // Send to server for authentication
      const response = await fetch(`${this.options.authServerUrl}/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          address: this.state.address,
          nonce,
          timestamp,
          signature,
          networkId: this.state.networkId
        })
      });
      
      // Check response
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Authentication failed');
      }
      
      // Parse response
      const data = await response.json();
      
      // Store auth token
      this.state.authToken = data.token;
      this.state.authenticated = true;
      
      // Save to local storage
      localStorage.setItem('skywars_auth_token', data.token);
      
      console.log('Wallet authenticated successfully');
      
      // Notify game of authentication
      if (this.game && this.game.onWalletAuthenticated) {
        this.game.onWalletAuthenticated(this.state.authToken);
      }
      
      return true;
      
    } catch (error) {
      console.error('Authentication error:', error);
      
      // Check if user rejected signing
      if (error.code === 4001) {
        this.state.error = 'Authentication cancelled. Please sign the message to log in.';
      } else {
        this.state.error = `Authentication error: ${error.message}`;
      }
      
      // Notify UI of error
      if (this.ui) {
        this.ui.updateWalletUI({
          authenticated: false,
          error: this.state.error
        });
      }
      
      // Notify game of authentication error
      if (this.game && this.game.onWalletError) {
        this.game.onWalletError(error);
      }
      
      return false;
    }
  }
  
  /**
   * Initialize contract instances
   */
  initializeContracts() {
    // Get contract addresses for current network
    const addresses = CONTRACT_ADDRESSES[this.state.networkId];
    
    if (!addresses) {
      console.warn(`No contract addresses found for network ID ${this.state.networkId}`);
      return;
    }
    
    // Initialize SkyToken contract
    if (addresses.skyToken) {
      this.contracts.skyToken = new ethers.Contract(
        addresses.skyToken,
        SKY_TOKEN_ABI,
        this.state.provider
      );
    }
    
    // Initialize AircraftNFT contract
    if (addresses.aircraftNFT) {
      this.contracts.aircraftNFT = new ethers.Contract(
        addresses.aircraftNFT,
        AIRCRAFT_NFT_ABI,
        this.state.provider
      );
    }
  }
  
  /**
   * Check if a network is supported
   * @param {number} networkId - Chain ID of the network
   * @returns {boolean} Whether the network is supported
   */
  isNetworkSupported(networkId) {
    return Object.keys(SUPPORTED_NETWORKS).includes(networkId.toString());
  }
  
  /**
   * Switch to a different network
   * @param {number} networkId - Chain ID of the network to switch to
   * @returns {Promise<boolean>} Success of network switch
   */
  async switchNetwork(networkId) {
    if (!this.state.connected) {
      throw new Error('Wallet not connected. Cannot switch network.');
    }
    
    // Convert to string for comparison
    networkId = networkId.toString();
    
    // Check if network is supported
    if (!SUPPORTED_NETWORKS[networkId]) {
      throw new Error(`Network with ID ${networkId} is not supported.`);
    }
    
    try {
      // Format chain ID as hex
      const chainIdHex = `0x${parseInt(networkId).toString(16)}`;
      
      // Try to switch to the network
      await this.state.provider.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }]
      });
      
      // Network switch is handled by the chainChanged event listener
      return true;
      
    } catch (error) {
      // Error code 4902 means the network is not yet added to the wallet
      if (error.code === 4902) {
        // Try to add the network
        await this.addNetwork(networkId);
        return true;
      }
      
      // Other errors
      console.error('Error switching network:', error);
      
      // Update state
      this.state.error = `Failed to switch network: ${error.message}`;
      
      // Notify UI of error
      if (this.ui) {
        this.ui.updateWalletUI({
          error: this.state.error
        });
      }
      
      return false;
    }
  }
  
  /**
   * Add a network to the wallet
   * @param {number} networkId - Chain ID of the network to add
   * @returns {Promise<boolean>} Success of network addition
   */
  async addNetwork(networkId) {
    if (!this.state.connected) {
      throw new Error('Wallet not connected. Cannot add network.');
    }
    
    // Convert to string for lookup
    networkId = networkId.toString();
    
    // Check if network is supported
    if (!SUPPORTED_NETWORKS[networkId]) {
      throw new Error(`Network with ID ${networkId} is not supported.`);
    }
    
    try {
      // Get network params
      const networkParams = SUPPORTED_NETWORKS[networkId];
      
      // Request to add the network
      await this.state.provider.provider.request({
        method: 'wallet_addEthereumChain',
        params: [networkParams]
      });
      
      // Network addition is handled by the chainChanged event listener
      return true;
      
    } catch (error) {
      console.error('Error adding network:', error);
      
      // Update state
      this.state.error = `Failed to add network: ${error.message}`;
      
      // Notify UI of error
      if (this.ui) {
        this.ui.updateWalletUI({
          error: this.state.error
        });
      }
      
      return false;
    }
  }
  
  /**
   * Refresh wallet balances
   * @returns {Promise<void>}
   */
  async refreshBalances() {
    if (!this.state.connected || !this.state.address) return;
    
    try {
      // Get ETH balance
      const ethBalance = await this.state.provider.getBalance(this.state.address);
      this.state.ethBalance = ethers.utils.formatEther(ethBalance);
      
      // Get SKY token balance if contract is available
      if (this.contracts.skyToken) {
        const skyBalance = await this.contracts.skyToken.balanceOf(this.state.address);
        this.state.skyTokenBalance = ethers.utils.formatUnits(skyBalance, 18); // Assuming 18 decimals
      }
      
      // Update UI
      if (this.ui) {
        this.ui.updateWalletUI({
          ethBalance: this.state.ethBalance,
          skyTokenBalance: this.state.skyTokenBalance
        });
      }
      
    } catch (error) {
      console.error('Error refreshing balances:', error);
    }
  }
  
  /**
   * Load owned NFTs
   * @returns {Promise<void>}
   */
  async loadOwnedNFTs() {
    if (!this.state.connected || !this.state.address || !this.contracts.aircraftNFT) return;
    
    try {
      // Get number of NFTs owned by address
      const balance = await this.contracts.aircraftNFT.balanceOf(this.state.address);
      
      // Array to store NFT data
      const nfts = [];
      
      // Get each token
      for (let i = 0; i < balance; i++) {
        // Get token ID
        const tokenId = await this.contracts.aircraftNFT.tokenOfOwnerByIndex(this.state.address, i);
        
        // Get token URI
        const tokenURI = await this.contracts.aircraftNFT.tokenURI(tokenId);
        
        // Fetch metadata
        let metadata = {};
        try {
          if (tokenURI.startsWith('ipfs://')) {
            // Convert IPFS URI to HTTPS using gateway
            const ipfsGateway = 'https://ipfs.io/ipfs/';
            const ipfsPath = tokenURI.replace('ipfs://', '');
            const response = await fetch(ipfsGateway + ipfsPath);
            metadata = await response.json();
          } else if (tokenURI.startsWith('http')) {
            // Regular HTTP request
            const response = await fetch(tokenURI);
            metadata = await response.json();
          } else {
            // Base64 encoded JSON
            const base64Data = tokenURI.replace('data:application/json;base64,', '');
            const jsonStr = atob(base64Data);
            metadata = JSON.parse(jsonStr);
          }
        } catch (error) {
          console.warn(`Failed to fetch metadata for token ${tokenId}:`, error);
          metadata = { name: `Aircraft #${tokenId}` };
        }
        
        // Add to NFTs array
        nfts.push({
          tokenId: tokenId.toString(),
          metadata
        });
      }
      
      // Update state
      this.state.nfts = nfts;
      
      // Notify game of NFTs
      if (this.game && this.game.onNFTsLoaded) {
        this.game.onNFTsLoaded(nfts);
      }
      
    } catch (error) {
      console.error('Error loading NFTs:', error);
    }
  }
  
  /**
   * Setup wallet event listeners
   */
  setupWalletEventListeners() {
    if (!this.state.provider || !this.state.provider.provider) return;
    
    const provider = this.state.provider.provider;
    
    // Different providers have different event systems
    if (provider.on) {
      // Metamask and others
      provider.on('accountsChanged', this.listeners.accountsChanged);
      provider.on('chainChanged', this.listeners.chainChanged);
      provider.on('disconnect', this.listeners.disconnect);
    } else if (provider.ethereum && provider.ethereum.on) {
      // Some mobile wallets
      provider.ethereum.on('accountsChanged', this.listeners.accountsChanged);
      provider.ethereum.on('chainChanged', this.listeners.chainChanged);
      provider.ethereum.on('disconnect', this.listeners.disconnect);
    }
  }
  
  /**
   * Remove wallet event listeners
   */
  removeWalletEventListeners() {
    if (!this.state.provider || !this.state.provider.provider) return;
    
    const provider = this.state.provider.provider;
    
    // Remove listeners based on provider type
    if (provider.removeListener) {
      provider.removeListener('accountsChanged', this.listeners.accountsChanged);
      provider.removeListener('chainChanged', this.listeners.chainChanged);
      provider.removeListener('disconnect', this.listeners.disconnect);
    } else if (provider.ethereum && provider.ethereum.removeListener) {
      provider.ethereum.removeListener('accountsChanged', this.listeners.accountsChanged);
      provider.ethereum.removeListener('chainChanged', this.listeners.chainChanged);
      provider.ethereum.removeListener('disconnect', this.listeners.disconnect);
    }
  }
  
  /**
   * Handle accounts changed event
   * @param {Array<string>} accounts - New accounts list
   */
  handleAccountsChanged(accounts) {
    console.log('Accounts changed:', accounts);
    
    if (accounts.length === 0) {
      // User disconnected their wallet
      this.disconnect();
    } else if (accounts[0] !== this.state.address) {
      // User switched accounts
      this.state.address = accounts[0];
      
      // Refresh balances and NFTs
      this.refreshBalances();
      this.loadOwnedNFTs();
      
      // Re-authenticate if needed
      if (this.options.authServerUrl) {
        this.authenticate();
      }
      
      // Update UI
      if (this.ui) {
        this.ui.updateWalletUI({
          address: this.state.address
        });
      }
      
      // Notify game of account change
      if (this.game && this.game.onWalletAccountChanged) {
        this.game.onWalletAccountChanged(this.state.address);
      }
    }
  }
  
  /**
   * Handle chain (network) changed event
   * @param {string} chainIdHex - New chain ID in hex format
   */
  handleChainChanged(chainIdHex) {
    // Convert to decimal
    const chainId = parseInt(chainIdHex, 16);
    console.log('Chain changed:', chainId);
    
    // Update state
    this.state.networkId = chainId;
    
    // Reinitialize contracts for new network
    this.initializeContracts();
    
    // Refresh balances
    this.refreshBalances();
    
    // Load NFTs for new network
    this.loadOwnedNFTs();
    
    // Update UI
    if (this.ui) {
      this.ui.updateWalletUI({
        networkId: chainId
      });
    }
    
    // Check if network is supported
    const isSupported = this.isNetworkSupported(chainId);
    
    // Notify game of network change
    if (this.game && this.game.onWalletNetworkChanged) {
      this.game.onWalletNetworkChanged(chainId, isSupported);
    }
    
    // Display warning if network is not supported
    if (!isSupported) {
      this.state.error = `Network with ID ${chainId} is not supported. Please switch to a supported network.`;
      
      if (this.ui) {
        this.ui.updateWalletUI({
          error: this.state.error
        });
      }
    } else {
      // Clear network-related errors
      if (this.state.error && this.state.error.includes('network')) {
        this.state.error = null;
        
        if (this.ui) {
          this.ui.updateWalletUI({
            error: null
          });
        }
      }
    }
  }
  
  /**
   * Handle disconnect event
   * @param {object} error - Disconnect error, if any
   */
  handleDisconnect(error) {
    console.log('Wallet disconnected:', error);
    
    // Disconnect from wallet
    this.disconnect();
  }
  
  /**
   * Save connection info to local storage for auto-reconnect
   */
  saveConnectionInfo() {
    try {
      const connectionInfo = {
        walletType: this.state.walletType,
        timestamp: Date.now()
      };
      
      localStorage.setItem('skywars_wallet_connection', JSON.stringify(connectionInfo));
    } catch (error) {
      console.warn('Failed to save connection info:', error);
    }
  }
  
  /**
   * Clear connection info from local storage
   */
  clearConnectionInfo() {
    try {
      localStorage.removeItem('skywars_wallet_connection');
      localStorage.removeItem('skywars_auth_token');
    } catch (error) {
      console.warn('Failed to clear connection info:', error);
    }
  }
  
  /**
   * Try to auto-reconnect if possible
   * @returns {Promise<boolean>} Success of auto-reconnect
   */
  async tryAutoReconnect() {
    try {
      // Check if auto-connect is enabled
      if (!this.options.autoConnect) return false;
      
      // Check for saved connection info
      const connectionInfoStr = localStorage.getItem('skywars_wallet_connection');
      if (!connectionInfoStr) return false;
      
      // Parse connection info
      const connectionInfo = JSON.parse(connectionInfoStr);
      
      // Check if connection is still valid (less than 24 hours old)
      const now = Date.now();
      const connectionAge = now - connectionInfo.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      
      if (connectionAge > maxAge) {
        this.clearConnectionInfo();
        return false;
      }
      
      // Try to reconnect
      const connected = await this.connect(connectionInfo.walletType);
      
      // If connected, check for saved auth token
      if (connected) {
        const authToken = localStorage.getItem('skywars_auth_token');
        
        if (authToken) {
          this.state.authToken = authToken;
          this.state.authenticated = true;
          
          // Notify game of authentication
          if (this.game && this.game.onWalletAuthenticated) {
            this.game.onWalletAuthenticated(authToken);
          }
        }
      }
      
      return connected;
      
    } catch (error) {
      console.warn('Auto-reconnect failed:', error);
      this.clearConnectionInfo();
      return false;
    }
  }
  
  /**
   * Get current wallet state
   * @returns {object} Current wallet state
   */
  getState() {
    return { ...this.state };
  }
  
  /**
   * Get transactions history
   * @returns {Array<object>} Transactions history
   */
  getTransactions() {
    return [...this.transactions];
  }
  
  /**
   * Transfer SKY tokens
   * @param {string} to - Recipient address
   * @param {string|number} amount - Amount to transfer
   * @returns {Promise<object>} Transaction receipt
   */
  async transferTokens(to, amount) {
    if (!this.state.connected || !this.contracts.skyToken) {
      throw new Error('Wallet not connected or SkyToken contract not initialized.');
    }
    
    try {
      // Format amount to wei (or the token's decimals)
      const formattedAmount = ethers.utils.parseUnits(amount.toString(), 18); // Assuming 18 decimals
      
      // Get token contract with signer
      const tokenWithSigner = this.contracts.skyToken.connect(this.signer);
      
      // Send transaction
      const tx = await tokenWithSigner.transfer(to, formattedAmount);
      
      // Add to transactions list
      this.transactions.push({
        type: 'token_transfer',
        hash: tx.hash,
        from: this.state.address,
        to,
        amount: amount.toString(),
        status: 'pending',
        timestamp: Date.now()
      });
      
      // Update UI
      if (this.ui) {
        this.ui.updateWalletUI({
          transactionPending: true
        });
      }
      
      // Wait for transaction to be mined
      const receipt = await tx.wait();
      
      // Update transaction status
      const txIndex = this.transactions.findIndex(t => t.hash === tx.hash);
      if (txIndex >= 0) {
        this.transactions[txIndex].status = receipt.status === 1 ? 'confirmed' : 'failed';
      }
      
      // Refresh balances
      await this.refreshBalances();
      
      // Update UI
      if (this.ui) {
        this.ui.updateWalletUI({
          transactionPending: false,
          skyTokenBalance: this.state.skyTokenBalance
        });
      }
      
      // Notify game of transaction
      if (this.game && this.game.onTokenTransfer) {
        this.game.onTokenTransfer({
          to,
          amount: amount.toString(),
          hash: tx.hash,
          status: receipt.status === 1 ? 'confirmed' : 'failed'
        });
      }
      
      return receipt;
      
    } catch (error) {
      console.error('Token transfer error:', error);
      
      // Handle user rejection
      if (error.code === 4001) {
        throw new Error('Transaction cancelled by user.');
      }
      
      // Handle general errors
      throw new Error(`Transaction failed: ${error.message}`);
    }
  }
  
  /**
   * Purchase an item with tokens
   * @param {string} itemId - ID of the item to purchase
   * @param {string|number} price - Price of the item in tokens
   * @returns {Promise<object>} Transaction receipt
   */
  async purchaseItem(itemId, price) {
    // First check if user has enough tokens
    if (parseFloat(this.state.skyTokenBalance) < parseFloat(price)) {
      throw new Error('Insufficient token balance for this purchase.');
    }
    
    try {
      // For marketplace purchases, we need to:
      // 1. Call approve() to allow the marketplace contract to use tokens
      // 2. Call the purchase function on the marketplace contract
      
      // Get marketplace address
      const marketplaceAddress = CONTRACT_ADDRESSES[this.state.networkId]?.marketplace;
      if (!marketplaceAddress) {
        throw new Error('Marketplace contract not found for this network.');
      }
      
      // Format price to wei (or the token's decimals)
      const formattedPrice = ethers.utils.parseUnits(price.toString(), 18); // Assuming 18 decimals
      
      // Get token contract with signer
      const tokenWithSigner = this.contracts.skyToken.connect(this.signer);
      
      // Check current allowance
      const allowance = await tokenWithSigner.allowance(this.state.address, marketplaceAddress);
      
      if (allowance.lt(formattedPrice)) {
        // Need to approve tokens first
        const approveTx = await tokenWithSigner.approve(marketplaceAddress, formattedPrice);
        
        // Wait for approval transaction to be mined
        await approveTx.wait();
      }
      
      // Now call the marketplace contract to complete purchase
      // This is a simplified example - modify based on your actual marketplace contract
      const MarketplaceABI = [
        "function purchaseItem(string itemId, uint256 price) returns (bool)"
      ];
      
      const marketplace = new ethers.Contract(
        marketplaceAddress,
        MarketplaceABI,
        this.signer
      );
      
      // Send purchase transaction
      const tx = await marketplace.purchaseItem(itemId, formattedPrice);
      
      // Add to transactions list
      this.transactions.push({
        type: 'item_purchase',
        hash: tx.hash,
        itemId,
        price: price.toString(),
        status: 'pending',
        timestamp: Date.now()
      });
      
      // Update UI
      if (this.ui) {
        this.ui.updateWalletUI({
          transactionPending: true
        });
      }
      
      // Wait for transaction to be mined
      const receipt = await tx.wait();
      
      // Update transaction status
      const txIndex = this.transactions.findIndex(t => t.hash === tx.hash);
      if (txIndex >= 0) {
        this.transactions[txIndex].status = receipt.status === 1 ? 'confirmed' : 'failed';
      }
      
      // Refresh balances
      await this.refreshBalances();
      
      // Update UI
      if (this.ui) {
        this.ui.updateWalletUI({
          transactionPending: false,
          skyTokenBalance: this.state.skyTokenBalance
        });
      }
      
      // Refresh NFTs list if the purchase was for an NFT
      await this.loadOwnedNFTs();
      
      // Notify game of purchase
      if (this.game && this.game.onItemPurchased) {
        this.game.onItemPurchased({
          itemId,
          price: price.toString(),
          hash: tx.hash,
          status: receipt.status === 1 ? 'confirmed' : 'failed'
        });
      }
      
      return receipt;
      
    } catch (error) {
      console.error('Purchase error:', error);
      
      // Handle user rejection
      if (error.code === 4001) {
        throw new Error('Transaction cancelled by user.');
      }
      
      // Handle general errors
      throw new Error(`Purchase failed: ${error.message}`);
    }
  }
  
  /**
   * Listen for token transfers (for game rewards)
   * @param {Function} callback - Callback to call when tokens are received
   * @returns {Function} Function to stop listening
   */
  listenForTokenTransfers(callback) {
    if (!this.state.connected || !this.contracts.skyToken) {
      console.warn('Wallet not connected or SkyToken contract not initialized.');
      return () => {};
    }
    
    // Listen for Transfer events to the user's address
    const filter = this.contracts.skyToken.filters.Transfer(null, this.state.address);
    
    const handleTransfer = (from, to, amount, event) => {
      // Refresh balance
      this.refreshBalances();
      
      // Call callback
      callback({
        from,
        to,
        amount: ethers.utils.formatUnits(amount, 18), // Assuming 18 decimals
        transactionHash: event.transactionHash
      });
    };
    
    // Add event listener
    this.contracts.skyToken.on(filter, handleTransfer);
    
    // Return function to remove listener
    return () => {
      this.contracts.skyToken.off(filter, handleTransfer);
    };
  }
}

/**
 * Usage Example:
 * 
 * // Initialize WalletManager
 * const walletManager = new WalletManager(
 *   gameInstance,      // Your game instance
 *   uiManagerInstance, // Your UI manager instance
 *   {
 *     preferredNetwork: 137, // Polygon Mainnet
 *     autoConnect: true,
 *     walletConnectProjectId: 'YOUR_WALLET_CONNECT_PROJECT_ID',
 *     authServerUrl: 'https://auth.skywars.example.com'
 *   }
 * );
 * 
 * // Connect to MetaMask
 * await walletManager.connect('metamask');
 * 
 * // In your game UI, handle wallet events:
 * uiManagerInstance.updateWalletUI = function(walletState) {
 *   // Update UI based on wallet state
 *   if (walletState.connected) {
 *     // Show connected wallet interface
 *     showWalletAddress(walletState.address);
 *     showTokenBalance(walletState.skyTokenBalance);
 *   } else if (walletState.connecting) {
 *     // Show connecting indicator
 *     showConnectingSpinner();
 *   } else if (walletState.error) {
 *     // Show error message
 *     showErrorMessage(walletState.error);
 *   } else {
 *     // Show connect wallet button
 *     showConnectButton();
 *   }
 * };
 * 
 * // In your game logic, handle wallet events:
 * gameInstance.onWalletConnected = function(state) {
 *   console.log(`Wallet connected: ${state.address}`);
 *   // Initialize game features that require wallet
 * };
 * 
 * gameInstance.onWalletAuthenticated = function(authToken) {
 *   console.log(`Wallet authenticated with token: ${authToken}`);
 *   // Connect to game server with auth token
 *   connectToGameServer(authToken);
 * };
 * 
 * // Purchase an in-game item
 * try {
 *   await walletManager.purchaseItem('aircraft_001', '500');
 *   showSuccessMessage('Purchase successful!');
 * } catch (error) {
 *   showErrorMessage(`Purchase failed: ${error.message}`);
 * }
 */