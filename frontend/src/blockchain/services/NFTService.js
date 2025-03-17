import { ethers } from 'ethers';
import AircraftNFTABI from '../contracts/AircraftNFTABI.json';
import MarketplaceABI from '../contracts/MarketplaceABI.json';
import { TokenService } from './TokenService';

export class NFTService {
  /**
   * Create a new NFT service instance
   * @param {ethers.JsonRpcSigner} signer - Ethers signer
   * @param {ethers.BrowserProvider} provider - Ethers provider
   */
  constructor(signer, provider) {
    this.signer = signer;
    this.provider = provider;
    this.nftAddress = process.env.VITE_NFT_CONTRACT_ADDRESS;
    this.marketplaceAddress = process.env.VITE_MARKETPLACE_CONTRACT_ADDRESS;
    this.nftContract = null;
    this.nftContractRead = null;
    this.marketplaceContract = null;
    this.marketplaceContractRead = null;
    this.tokenService = null;
    
    // Initialize contracts if signer and provider are provided
    if (signer) {
      this.initWriteContracts();
    }
    
    if (provider) {
      this.initReadContracts();
      this.tokenService = new TokenService(signer, provider);
    }
  }
  
  /**
   * Initialize the write contracts (requires signer)
   */
  initWriteContracts() {
    if (this.signer && this.nftAddress) {
      this.nftContract = new ethers.Contract(
        this.nftAddress,
        AircraftNFTABI,
        this.signer
      );
    }
    
    if (this.signer && this.marketplaceAddress) {
      this.marketplaceContract = new ethers.Contract(
        this.marketplaceAddress,
        MarketplaceABI,
        this.signer
      );
    }
  }
  
  /**
   * Initialize the read contracts (only requires provider)
   */
  initReadContracts() {
    if (this.provider && this.nftAddress) {
      this.nftContractRead = new ethers.Contract(
        this.nftAddress,
        AircraftNFTABI,
        this.provider
      );
    }
    
    if (this.provider && this.marketplaceAddress) {
      this.marketplaceContractRead = new ethers.Contract(
        this.marketplaceAddress,
        MarketplaceABI,
        this.provider
      );
    }
  }
  
  /**
   * Update the signer
   * @param {ethers.JsonRpcSigner} signer - New signer
   */
  updateSigner(signer) {
    this.signer = signer;
    this.initWriteContracts();
    
    if (this.tokenService) {
      this.tokenService.updateSigner(signer);
    } else if (signer && this.provider) {
      this.tokenService = new TokenService(signer, this.provider);
    }
  }
  
  /**
   * Update the provider
   * @param {ethers.BrowserProvider} provider - New provider
   */
  updateProvider(provider) {
    this.provider = provider;
    this.initReadContracts();
    
    if (this.tokenService) {
      this.tokenService.updateProvider(provider);
    } else if (this.signer && provider) {
      this.tokenService = new TokenService(this.signer, provider);
    }
  }
  
  /**
   * Get all NFTs owned by an address
   * @param {string} owner - Owner address
   * @returns {Promise<Array>} Array of owned NFTs with metadata
   */
  async getOwnedNFTs(owner) {
    if (!this.nftContractRead) {
      throw new Error('NFT contract is not initialized');
    }
    
    if (!owner) {
      throw new Error('Owner address is required');
    }
    
    try {
      // Get token balance
      const balance = await this.nftContractRead.balanceOf(owner);
      
      // Get token IDs for each owned token
      const tokenIds = [];
      for (let i = 0; i < balance; i++) {
        const tokenId = await this.nftContractRead.tokenOfOwnerByIndex(owner, i);
        tokenIds.push(tokenId);
      }
      
      // Get metadata for each token
      const nfts = await Promise.all(
        tokenIds.map(async (tokenId) => {
          const tokenURI = await this.nftContractRead.tokenURI(tokenId);
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
          
          if (this.marketplaceContractRead) {
            try {
              const listing = await this.marketplaceContractRead.getListing(tokenId);
              isForSale = listing.isActive;
              price = listing.price.toString();
            } catch (err) {
              // NFT might not be listed
              console.log(`NFT ${tokenId} is not listed for sale`);
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
      console.error('Failed to get owned NFTs:', error);
      throw error;
    }
  }
  
  /**
   * Get NFT metadata
   * @param {string|number} tokenId - Token ID
   * @returns {Promise<Object>} NFT metadata
   */
  async getNFTMetadata(tokenId) {
    if (!this.nftContractRead) {
      throw new Error('NFT contract is not initialized');
    }
    
    if (!tokenId) {
      throw new Error('Token ID is required');
    }
    
    try {
      const tokenURI = await this.nftContractRead.tokenURI(tokenId);
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
      
      // Get owner
      const owner = await this.nftContractRead.ownerOf(tokenId);
      
      // Check if the NFT is listed for sale
      let isForSale = false;
      let price = '0';
      
      if (this.marketplaceContractRead) {
        try {
          const listing = await this.marketplaceContractRead.getListing(tokenId);
          isForSale = listing.isActive;
          price = listing.price.toString();
        } catch (err) {
          // NFT might not be listed
          console.log(`NFT ${tokenId} is not listed for sale`);
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
        owner,
        isForSale,
        price: ethers.formatEther(price)
      };
    } catch (error) {
      console.error('Failed to get NFT metadata:', error);
      throw error;
    }
  }
  
  /**
   * List an NFT for sale
   * @param {string|number} tokenId - Token ID
   * @param {string|number} price - Price in SKY tokens
   * @returns {Promise<ethers.TransactionResponse>} Transaction response
   */
  async listForSale(tokenId, price) {
    if (!this.nftContract || !this.marketplaceContract) {
      throw new Error('Contracts are not initialized');
    }
    
    if (!tokenId) {
      throw new Error('Token ID is required');
    }
    
    if (!price) {
      throw new Error('Price is required');
    }
    
    try {
      // Check if caller is the NFT owner
      const owner = await this.nftContractRead.ownerOf(tokenId);
      const signerAddress = await this.signer.getAddress();
      
      if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
        throw new Error('You are not the owner of this NFT');
      }
      
      // Convert price to wei
      const priceInWei = ethers.parseEther(price.toString());
      
      // Approve marketplace to transfer NFT
      const approvedAddress = await this.nftContractRead.getApproved(tokenId);
      
      if (approvedAddress.toLowerCase() !== this.marketplaceAddress.toLowerCase()) {
        const approveTx = await this.nftContract.approve(this.marketplaceAddress, tokenId);
        await approveTx.wait();
      }
      
      // List NFT for sale
      const tx = await this.marketplaceContract.listItem(this.nftAddress, tokenId, priceInWei);
      return tx;
    } catch (error) {
      console.error('Failed to list NFT for sale:', error);
      throw error;
    }
  }
  
  /**
   * Cancel NFT listing
   * @param {string|number} tokenId - Token ID
   * @returns {Promise<ethers.TransactionResponse>} Transaction response
   */
  async cancelListing(tokenId) {
    if (!this.marketplaceContract) {
      throw new Error('Marketplace contract is not initialized');
    }
    
    if (!tokenId) {
      throw new Error('Token ID is required');
    }
    
    try {
      const tx = await this.marketplaceContract.cancelListing(this.nftAddress, tokenId);
      return tx;
    } catch (error) {
      console.error('Failed to cancel NFT listing:', error);
      throw error;
    }
  }
  
  /**
   * Buy an NFT
   * @param {string|number} tokenId - Token ID
   * @param {string|number} price - Price to pay (for verification)
   * @returns {Promise<ethers.TransactionResponse>} Transaction response
   */
  async buyNFT(tokenId, price) {
    if (!this.marketplaceContract || !this.tokenService) {
      throw new Error('Contracts are not initialized');
    }
    
    if (!tokenId) {
      throw new Error('Token ID is required');
    }
    
    try {
      // Get listing to verify price
      const listing = await this.marketplaceContractRead.getListing(tokenId);
      
      if (!listing.isActive) {
        throw new Error('NFT is not for sale');
      }
      
      const listedPrice = ethers.formatEther(listing.price);
      
      // Verify price matches
      if (parseFloat(listedPrice) !== parseFloat(price)) {
        throw new Error(`Price mismatch: listed at ${listedPrice} SKY`);
      }
      
      // Approve token transfer to marketplace
      const signerAddress = await this.signer.getAddress();
      const allowance = await this.tokenService.allowance(
        signerAddress,
        this.marketplaceAddress
      );
      
      if (allowance < listing.price) {
        const approveTx = await this.tokenService.approve(
          this.marketplaceAddress,
          ethers.formatEther(listing.price)
        );
        await approveTx.wait();
      }
      
      // Buy NFT
      const tx = await this.marketplaceContract.buyItem(this.nftAddress, tokenId);
      return tx;
    } catch (error) {
      console.error('Failed to buy NFT:', error);
      throw error;
    }
  }
  
  /**
   * Mint a new aircraft NFT (if allowed by contract)
   * @param {Object} metadata - NFT metadata
   * @returns {Promise<ethers.TransactionResponse>} Transaction response
   */
  async mintAircraft(metadata) {
    if (!this.nftContract) {
      throw new Error('NFT contract is not initialized');
    }
    
    try {
      // Check if caller has minter role
      const signerAddress = await this.signer.getAddress();
      const MINTER_ROLE = ethers.id("MINTER_ROLE");
      const hasMinterRole = await this.nftContractRead.hasRole(MINTER_ROLE, signerAddress);
      
      if (!hasMinterRole) {
        throw new Error('You do not have permission to mint aircraft NFTs');
      }
      
      // Upload metadata to IPFS (would integrate with external IPFS service)
      // For now, we'll assume the metadata is already in the correct format
      // and has been uploaded to IPFS, returning the token URI
      const tokenURI = await this.uploadMetadataToIPFS(metadata);
      
      // Mint NFT
      const tx = await this.nftContract.mintAircraft(signerAddress, tokenURI);
      return tx;
    } catch (error) {
      console.error('Failed to mint aircraft NFT:', error);
      throw error;
    }
  }
  
  /**
   * Upload metadata to IPFS (mock implementation)
   * @param {Object} metadata - NFT metadata
   * @returns {Promise<string>} IPFS URI
   */
  async uploadMetadataToIPFS(metadata) {
    // This is a mock implementation
    // In a real implementation, this would upload the metadata to IPFS
    // and return the IPFS URI
    
    // For now, we'll just return a placeholder URI
    return `ipfs://QmPlaceholderHash`;
  }
}