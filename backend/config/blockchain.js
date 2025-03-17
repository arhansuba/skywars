/**
 * Blockchain Configuration for SkyWars
 * 
 * This file sets up blockchain connections, contract interfaces,
 * and provides functionality for interacting with the game's smart contracts.
 */

const { ethers } = require('ethers');
const logger = require('../utils/logger');

// Import contract ABIs
const SkyTokenABI = require('../blockchain/abis/SkyTokenABI.json');
const AircraftNFTABI = require('../blockchain/abis/AircraftNFTABI.json');
const MarketplaceABI = require('../blockchain/abis/MarketplaceABI.json');

// Load environment variables
const {
  RPC_URL = 'https://rpc-mumbai.maticvigil.com/', // Default to Polygon Mumbai testnet
  CHAIN_ID = '80001',
  TOKEN_CONTRACT_ADDRESS,
  NFT_CONTRACT_ADDRESS,
  MARKETPLACE_CONTRACT_ADDRESS,
  PRIVATE_KEY,
  GAS_PRICE_MULTIPLIER = '1.1',
  NODE_ENV = 'development',
  RETRY_ATTEMPTS = 3,
  RETRY_DELAY_MS = 1000,
} = process.env;

// Validate required environment variables in production
if (NODE_ENV === 'production') {
  if (!TOKEN_CONTRACT_ADDRESS) throw new Error('TOKEN_CONTRACT_ADDRESS is required');
  if (!NFT_CONTRACT_ADDRESS) throw new Error('NFT_CONTRACT_ADDRESS is required');
  if (!MARKETPLACE_CONTRACT_ADDRESS) throw new Error('MARKETPLACE_CONTRACT_ADDRESS is required');
  if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY is required for production');
}

// Cache for provider and contracts
let provider = null;
let wallet = null;
let skyTokenContract = null;
let aircraftNFTContract = null;
let marketplaceContract = null;

/**
 * Initialize blockchain provider and contracts
 * @returns {Promise<void>}
 */
const initialize = async () => {
  try {
    // Create blockchain provider
    provider = new ethers.JsonRpcProvider(RPC_URL);
    
    // Create wallet from private key if available
    if (PRIVATE_KEY) {
      wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      logger.info('Blockchain wallet initialized');
    } else {
      logger.warn('No private key provided. Operating in read-only mode.');
    }
    
    // Verify connection to blockchain
    const network = await provider.getNetwork();
    logger.info(`Connected to blockchain network: ${network.name} (Chain ID: ${network.chainId})`);
    
    // Verify chain ID
    if (network.chainId.toString() !== CHAIN_ID) {
      logger.warn(`Chain ID mismatch: Expected ${CHAIN_ID}, got ${network.chainId}`);
    }
    
    // Initialize contract instances
    if (TOKEN_CONTRACT_ADDRESS) {
      skyTokenContract = new ethers.Contract(
        TOKEN_CONTRACT_ADDRESS,
        SkyTokenABI,
        wallet || provider
      );
      logger.info(`SkyToken contract initialized at ${TOKEN_CONTRACT_ADDRESS}`);
    }
    
    if (NFT_CONTRACT_ADDRESS) {
      aircraftNFTContract = new ethers.Contract(
        NFT_CONTRACT_ADDRESS,
        AircraftNFTABI,
        wallet || provider
      );
      logger.info(`AircraftNFT contract initialized at ${NFT_CONTRACT_ADDRESS}`);
    }
    
    if (MARKETPLACE_CONTRACT_ADDRESS) {
      marketplaceContract = new ethers.Contract(
        MARKETPLACE_CONTRACT_ADDRESS,
        MarketplaceABI,
        wallet || provider
      );
      logger.info(`Marketplace contract initialized at ${MARKETPLACE_CONTRACT_ADDRESS}`);
    }
    
    return { provider, wallet, contracts: { skyTokenContract, aircraftNFTContract, marketplaceContract } };
  } catch (error) {
    logger.error(`Failed to initialize blockchain: ${error.message}`);
    throw error;
  }
};

/**
 * Send a transaction with retry logic
 * @param {Function} txFunction - Function that returns a transaction
 * @param {Object} options - Transaction options
 * @returns {Promise<ethers.TransactionResponse>} Transaction response
 */
const sendTransaction = async (txFunction, options = {}) => {
  if (!wallet) {
    throw new Error('Wallet not initialized');
  }
  
  const retryAttempts = options.retryAttempts || RETRY_ATTEMPTS;
  const retryDelay = options.retryDelay || RETRY_DELAY_MS;
  let lastError = null;
  
  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    try {
      // Get current gas price and apply multiplier for faster confirmation
      const gasPrice = await provider.getFeeData();
      const adjustedGasPrice = gasPrice.gasPrice * parseFloat(GAS_PRICE_MULTIPLIER);
      
      // Get transaction object
      const tx = await txFunction();
      
      // Send transaction with adjusted gas price
      const txResponse = await tx.send({
        gasPrice: adjustedGasPrice,
        ...options,
      });
      
      logger.info(`Transaction sent: ${txResponse.hash}`);
      return txResponse;
    } catch (error) {
      lastError = error;
      logger.warn(`Transaction attempt ${attempt} failed: ${error.message}`);
      
      // Wait before retrying
      if (attempt < retryAttempts) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }
  
  throw new Error(`Transaction failed after ${retryAttempts} attempts: ${lastError.message}`);
};

/**
 * Get token balance for an address
 * @param {string} address - Ethereum address
 * @returns {Promise<ethers.BigNumber>} Token balance
 */
const getTokenBalance = async (address) => {
  if (!skyTokenContract) {
    throw new Error('SkyToken contract not initialized');
  }
  
  try {
    const balance = await skyTokenContract.balanceOf(address);
    return balance;
  } catch (error) {
    logger.error(`Failed to get token balance: ${error.message}`);
    throw error;
  }
};

/**
 * Award tokens to a player
 * @param {string} playerAddress - Player's Ethereum address
 * @param {string|number} amount - Amount to award (in token units)
 * @returns {Promise<ethers.TransactionResponse>} Transaction response
 */
const awardTokens = async (playerAddress, amount) => {
  if (!skyTokenContract || !wallet) {
    throw new Error('SkyToken contract or wallet not initialized');
  }
  
  try {
    // Check if caller has minter role
    const MINTER_ROLE = ethers.id("MINTER_ROLE");
    const hasMinterRole = await skyTokenContract.hasRole(MINTER_ROLE, wallet.address);
    
    if (!hasMinterRole) {
      throw new Error('Server wallet does not have minter role');
    }
    
    // Convert amount to wei
    const amountInWei = ethers.parseUnits(amount.toString(), 18);
    
    // Create transaction function
    const txFunction = () => skyTokenContract.mint(playerAddress, amountInWei);
    
    // Send transaction with retry logic
    return await sendTransaction(txFunction);
  } catch (error) {
    logger.error(`Failed to award tokens: ${error.message}`);
    throw error;
  }
};

/**
 * Get NFTs owned by an address
 * @param {string} address - Ethereum address
 * @returns {Promise<Array>} Array of owned NFTs with metadata
 */
const getOwnedNFTs = async (address) => {
  if (!aircraftNFTContract) {
    throw new Error('AircraftNFT contract not initialized');
  }
  
  try {
    // Get token balance
    const balance = await aircraftNFTContract.balanceOf(address);
    
    // Get token IDs for each owned token
    const tokenIds = [];
    for (let i = 0; i < balance; i++) {
      const tokenId = await aircraftNFTContract.tokenOfOwnerByIndex(address, i);
      tokenIds.push(tokenId);
    }
    
    // Get metadata for each token
    const nfts = await Promise.all(
      tokenIds.map(async (tokenId) => {
        const tokenURI = await aircraftNFTContract.tokenURI(tokenId);
        let metadata;
        
        // Handle IPFS URIs or HTTP URIs
        if (tokenURI.startsWith('ipfs://')) {
          const ipfsHash = tokenURI.replace('ipfs://', '');
          const response = await fetch(`https://ipfs.io/ipfs/${ipfsHash}`);
          metadata = await response.json();
        } else {
          const response = await fetch(tokenURI);
          metadata = await response.json();
        }
        
        // Check if the NFT is listed for sale
        let isForSale = false;
        let price = '0';
        
        if (marketplaceContract) {
          try {
            const listing = await marketplaceContract.getListing(tokenId);
            isForSale = listing.isActive;
            price = listing.price.toString();
          } catch (err) {
            // NFT might not be listed
            logger.debug(`NFT ${tokenId} is not listed for sale`);
          }
        }
        
        return {
          tokenId: tokenId.toString(),
          name: metadata.name,
          description: metadata.description,
          image: metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/'),
          attributes: metadata.attributes.reduce((acc, attr) => {
            acc[attr.trait_type.toLowerCase()] = attr.value;
            return acc;
          }, {}),
          isForSale,
          price: ethers.formatEther(price)
        };
      })
    );
    
    return nfts;
  } catch (error) {
    logger.error(`Failed to get owned NFTs: ${error.message}`);
    throw error;
  }
};

/**
 * Get blockchain provider and contracts
 * @returns {Object} Provider and contract instances
 */
const getBlockchainInstances = () => {
  return {
    provider,
    wallet: wallet ? wallet.address : null,
    contracts: {
      skyToken: skyTokenContract,
      aircraftNFT: aircraftNFTContract,
      marketplace: marketplaceContract,
    },
  };
};

module.exports = {
  initialize,
  getTokenBalance,
  awardTokens,
  getOwnedNFTs,
  sendTransaction,
  getBlockchainInstances,
  // Export contract addresses for reference
  contractAddresses: {
    skyToken: TOKEN_CONTRACT_ADDRESS,
    aircraftNFT: NFT_CONTRACT_ADDRESS,
    marketplace: MARKETPLACE_CONTRACT_ADDRESS,
  },
};