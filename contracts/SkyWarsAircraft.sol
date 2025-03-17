// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SkyWarsAircraft
 * @dev Main contract for SkyWars Aircraft NFTs
 */
contract SkyWarsAircraft is ERC721Enumerable, ERC721URIStorage, AccessControl, ReentrancyGuard {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIdCounter;
    
    // Token used for purchases and upgrades
    IERC20 public skyToken;
    
    // Roles for access control
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant GAME_ROLE = keccak256("GAME_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    // Base URI for metadata
    string private _baseTokenURI;
    
    // Mapping for aircraft attributes (on-chain data)
    mapping(uint256 => AircraftAttributes) public attributes;
    
    // Mapping for upgrades applied to aircraft
    mapping(uint256 => mapping(string => uint256)) public upgrades;
    
    // Mapping for customizations applied to aircraft
    mapping(uint256 => mapping(string => string)) public customizations;
    
    // Record of aircraft models
    mapping(string => AircraftModel) public aircraftModels;
    
    // Upgrade types available in the game
    mapping(string => UpgradeType) public upgradeTypes;
    
    // Aircraft base stats schema
    struct AircraftAttributes {
        string model;              // Reference to aircraft model
        uint256 level;             // Aircraft level
        uint256 experience;        // Experience points
        uint256 maxHealth;         // Maximum health points
        uint256 baseSpeed;         // Base speed value
        uint256 baseHandling;      // Base handling value
        uint256 baseAcceleration;  // Base acceleration value
        uint256 baseDefense;       // Base defense value
        uint256 weaponSlots;       // Number of weapon slots
        uint256 utilitySlots;      // Number of utility slots
        uint256 rarity;            // Rarity level (1-5)
        uint256 manufactureDate;   // Timestamp of creation
        uint256 upgradeLimit;      // Maximum upgrades allowed
        uint256 upgradesApplied;   // Current number of upgrades
        bool isLocked;             // Whether aircraft is locked (non-transferable)
    }
    
    // Aircraft model definition
    struct AircraftModel {
        string modelId;            // Unique model identifier
        string name;               // Model name
        string manufacturer;       // Manufacturer name
        string category;           // Aircraft category (fighter, bomber, etc.)
        uint256 basePrice;         // Base price in SKY tokens
        uint256 baseMaxHealth;     // Base maximum health
        uint256 baseSpeed;         // Base speed
        uint256 baseHandling;      // Base handling
        uint256 baseAcceleration;  // Base acceleration
        uint256 baseDefense;       // Base defense
        uint256 baseWeaponSlots;   // Base weapon slots
        uint256 baseUtilitySlots;  // Base utility slots
        uint256 upgradeLimit;      // Maximum upgrades allowed
        uint256 modelRarity;       // Model rarity (1-5)
        bool isAvailable;          // Whether the model is available for minting
    }
    
    // Upgrade type definition
    struct UpgradeType {
        string upgradeId;          // Unique upgrade identifier
        string name;               // Upgrade name
        string description;        // Upgrade description
        string attribute;          // Attribute affected (speed, handling, etc.)
        uint256 baseValue;         // Base improvement value
        uint256 maxLevel;          // Maximum upgrade level
        uint256 baseCost;          // Base cost in SKY tokens
        uint256 costMultiplier;    // Cost multiplier per level
        bool isAvailable;          // Whether the upgrade is available
    }
    
    // Events
    event AircraftMinted(address indexed owner, uint256 indexed tokenId, string model);
    event AircraftUpgraded(uint256 indexed tokenId, string upgradeType, uint256 newLevel, uint256 cost);
    event AircraftCustomized(uint256 indexed tokenId, string customizationType, string customizationValue);
    event AircraftModelAdded(string modelId, string name, uint256 basePrice);
    event UpgradeTypeAdded(string upgradeId, string name, string attribute);
    event AircraftLevelUp(uint256 indexed tokenId, uint256 newLevel, uint256 experience);
    
    /**
     * @dev Constructor
     * @param name The name of the NFT collection
     * @param symbol The symbol of the NFT collection
     * @param skyTokenAddress Address of the SKY token contract
     */
    constructor(
        string memory name,
        string memory symbol,
        address skyTokenAddress,
        string memory baseURI
    ) ERC721(name, symbol) {
        _baseTokenURI = baseURI;
        skyToken = IERC20(skyTokenAddress);
        
        // Setup roles
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(MINTER_ROLE, msg.sender);
        _setupRole(GAME_ROLE, msg.sender);
    }
    
    /**
     * @dev Set base URI for token metadata
     * @param baseURI New base URI
     */
    function setBaseURI(string memory baseURI) external onlyRole(ADMIN_ROLE) {
        _baseTokenURI = baseURI;
    }
    
    /**
     * @dev Override base URI function
     */
    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
    
    /**
     * @dev Add a new aircraft model
     * @param modelData Model data struct
     */
    function addAircraftModel(AircraftModel memory modelData) external onlyRole(ADMIN_ROLE) {
        require(bytes(modelData.modelId).length > 0, "Model ID cannot be empty");
        require(bytes(aircraftModels[modelData.modelId].modelId).length == 0, "Model already exists");
        
        aircraftModels[modelData.modelId] = modelData;
        
        emit AircraftModelAdded(modelData.modelId, modelData.name, modelData.basePrice);
    }
    
    /**
     * @dev Update an existing aircraft model
     * @param modelId Model ID to update
     * @param modelData New model data
     */
    function updateAircraftModel(string memory modelId, AircraftModel memory modelData) external onlyRole(ADMIN_ROLE) {
        require(bytes(aircraftModels[modelId].modelId).length > 0, "Model does not exist");
        
        aircraftModels[modelId] = modelData;
    }
    
    /**
     * @dev Add a new upgrade type
     * @param upgradeData Upgrade type data
     */
    function addUpgradeType(UpgradeType memory upgradeData) external onlyRole(ADMIN_ROLE) {
        require(bytes(upgradeData.upgradeId).length > 0, "Upgrade ID cannot be empty");
        require(bytes(upgradeTypes[upgradeData.upgradeId].upgradeId).length == 0, "Upgrade type already exists");
        
        upgradeTypes[upgradeData.upgradeId] = upgradeData;
        
        emit UpgradeTypeAdded(upgradeData.upgradeId, upgradeData.name, upgradeData.attribute);
    }
    
    /**
     * @dev Update an existing upgrade type
     * @param upgradeId Upgrade ID to update
     * @param upgradeData New upgrade data
     */
    function updateUpgradeType(string memory upgradeId, UpgradeType memory upgradeData) external onlyRole(ADMIN_ROLE) {
        require(bytes(upgradeTypes[upgradeId].upgradeId).length > 0, "Upgrade type does not exist");
        
        upgradeTypes[upgradeId] = upgradeData;
    }
    
    /**
     * @dev Mint a new aircraft NFT
     * @param to Address to mint the aircraft to
     * @param modelId Aircraft model ID
     * @param rarity Rarity level (1-5)
     * @param metadata URI to the aircraft metadata
     */
    function mintAircraft(
        address to,
        string memory modelId,
        uint256 rarity,
        string memory metadata
    ) external onlyRole(MINTER_ROLE) returns (uint256) {
        require(bytes(aircraftModels[modelId].modelId).length > 0, "Invalid aircraft model");
        require(rarity >= 1 && rarity <= 5, "Rarity must be between 1-5");
        
        // Get model data
        AircraftModel memory model = aircraftModels[modelId];
        
        // Get next token ID
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        
        // Mint the NFT
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, metadata);
        
        // Set aircraft attributes based on model and rarity
        AircraftAttributes memory attr = AircraftAttributes({
            model: modelId,
            level: 1,
            experience: 0,
            maxHealth: model.baseMaxHealth * rarity / 3,
            baseSpeed: model.baseSpeed * rarity / 3,
            baseHandling: model.baseHandling * rarity / 3,
            baseAcceleration: model.baseAcceleration * rarity / 3,
            baseDefense: model.baseDefense * rarity / 3,
            weaponSlots: model.baseWeaponSlots + (rarity - 1) / 2,
            utilitySlots: model.baseUtilitySlots + (rarity - 1) / 2,
            rarity: rarity,
            manufactureDate: block.timestamp,
            upgradeLimit: model.upgradeLimit,
            upgradesApplied: 0,
            isLocked: false
        });
        
        // Store attributes
        attributes[tokenId] = attr;
        
        emit AircraftMinted(to, tokenId, modelId);
        
        return tokenId;
    }
    
    /**
     * @dev Purchase and mint a new aircraft
     * @param modelId Aircraft model ID to purchase
     * @param metadata URI to the aircraft metadata
     */
    function purchaseAircraft(string memory modelId, string memory metadata) external nonReentrant returns (uint256) {
        AircraftModel memory model = aircraftModels[modelId];
        require(bytes(model.modelId).length > 0, "Invalid aircraft model");
        require(model.isAvailable, "Aircraft model not available for purchase");
        
        // Calculate price based on rarity
        uint256 price = model.basePrice;
        
        // Transfer tokens from buyer to contract
        require(skyToken.transferFrom(msg.sender, address(this), price), "Token transfer failed");
        
        // Determine rarity (can be enhanced with randomization)
        uint256 rarity = 1;
        
        // Mint the aircraft
        return mintAircraft(msg.sender, modelId, rarity, metadata);
    }
    
    /**
     * @dev Apply an upgrade to an aircraft
     * @param tokenId Aircraft token ID
     * @param upgradeId Upgrade type ID
     */
    function upgradeAircraft(uint256 tokenId, string memory upgradeId) external nonReentrant {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not owner or approved");
        require(bytes(upgradeTypes[upgradeId].upgradeId).length > 0, "Invalid upgrade type");
        require(upgradeTypes[upgradeId].isAvailable, "Upgrade not available");
        
        AircraftAttributes storage attr = attributes[tokenId];
        UpgradeType memory upgradeType = upgradeTypes[upgradeId];
        
        // Check if upgrade limit reached
        require(attr.upgradesApplied < attr.upgradeLimit, "Upgrade limit reached");
        
        // Check current upgrade level
        uint256 currentLevel = upgrades[tokenId][upgradeId];
        require(currentLevel < upgradeType.maxLevel, "Max upgrade level reached for this type");
        
        // Calculate upgrade cost
        uint256 upgradeCost = upgradeType.baseCost * 
                             (upgradeType.costMultiplier ** currentLevel) / 
                             (10 ** (currentLevel - 1));
        
        // Transfer tokens for upgrade
        require(skyToken.transferFrom(msg.sender, address(this), upgradeCost), "Token transfer failed");
        
        // Apply upgrade
        upgrades[tokenId][upgradeId] = currentLevel + 1;
        attr.upgradesApplied += 1;
        
        // Apply stat changes based on upgrade type
        applyUpgradeEffects(tokenId, upgradeId, currentLevel + 1);
        
        emit AircraftUpgraded(tokenId, upgradeId, currentLevel + 1, upgradeCost);
    }
    
    /**
     * @dev Apply effects of an upgrade to aircraft stats
     * @param tokenId Aircraft token ID
     * @param upgradeId Upgrade type ID
     * @param level New upgrade level
     */
    function applyUpgradeEffects(uint256 tokenId, string memory upgradeId, uint256 level) internal {
        AircraftAttributes storage attr = attributes[tokenId];
        UpgradeType memory upgradeType = upgradeTypes[upgradeId];
        
        // Calculate improvement value based on level
        uint256 improvement = upgradeType.baseValue * level;
        
        // Apply to appropriate attribute
        if (compareStrings(upgradeType.attribute, "health")) {
            attr.maxHealth += improvement;
        } else if (compareStrings(upgradeType.attribute, "speed")) {
            attr.baseSpeed += improvement;
        } else if (compareStrings(upgradeType.attribute, "handling")) {
            attr.baseHandling += improvement;
        } else if (compareStrings(upgradeType.attribute, "acceleration")) {
            attr.baseAcceleration += improvement;
        } else if (compareStrings(upgradeType.attribute, "defense")) {
            attr.baseDefense += improvement;
        } else if (compareStrings(upgradeType.attribute, "weaponSlots")) {
            attr.weaponSlots += level; // Usually increases by 1 per level
        } else if (compareStrings(upgradeType.attribute, "utilitySlots")) {
            attr.utilitySlots += level; // Usually increases by 1 per level
        }
    }
    
    /**
     * @dev Apply a customization to an aircraft
     * @param tokenId Aircraft token ID
     * @param customizationType Type of customization (skin, decal, etc.)
     * @param customizationValue Value or ID of the customization
     */
    function customizeAircraft(
        uint256 tokenId, 
        string memory customizationType, 
        string memory customizationValue
    ) external {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not owner or approved");
        
        // Store customization
        customizations[tokenId][customizationType] = customizationValue;
        
        emit AircraftCustomized(tokenId, customizationType, customizationValue);
    }
    
    /**
     * @dev Add experience to an aircraft, potentially leveling it up
     * @param tokenId Aircraft token ID
     * @param experienceAmount Amount of experience to add
     */
    function addExperience(uint256 tokenId, uint256 experienceAmount) external onlyRole(GAME_ROLE) {
        AircraftAttributes storage attr = attributes[tokenId];
        
        // Add experience
        attr.experience += experienceAmount;
        
        // Check for level up
        uint256 nextLevelThreshold = calculateNextLevelThreshold(attr.level);
        
        if (attr.experience >= nextLevelThreshold) {
            attr.level += 1;
            
            // Apply level-up bonuses
            attr.maxHealth += attr.rarity * 5;
            attr.baseSpeed += attr.rarity * 2;
            attr.baseHandling += attr.rarity * 2;
            attr.baseAcceleration += attr.rarity * 2;
            attr.baseDefense += attr.rarity * 2;
            
            // Possibly add weapon/utility slots every few levels
            if (attr.level % 5 == 0) {
                attr.weaponSlots += 1;
                attr.utilitySlots += 1;
            }
            
            emit AircraftLevelUp(tokenId, attr.level, attr.experience);
        }
    }
    
    /**
     * @dev Calculate experience needed for next level
     * @param currentLevel Current aircraft level
     * @return Experience threshold for next level
     */
    function calculateNextLevelThreshold(uint256 currentLevel) internal pure returns (uint256) {
        // Exponential level curve: 100 * level^2
        return 100 * currentLevel * currentLevel;
    }
    
    /**
     * @dev Lock an aircraft to prevent transfers
     * @param tokenId Aircraft token ID
     */
    function lockAircraft(uint256 tokenId) external {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not owner or approved");
        attributes[tokenId].isLocked = true;
    }
    
    /**
     * @dev Unlock an aircraft to allow transfers
     * @param tokenId Aircraft token ID
     */
    function unlockAircraft(uint256 tokenId) external {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not owner or approved");
        attributes[tokenId].isLocked = false;
    }
    
    /**
     * @dev Get all attributes of an aircraft
     * @param tokenId Aircraft token ID
     * @return Aircraft attributes
     */
    function getAircraftAttributes(uint256 tokenId) external view returns (AircraftAttributes memory) {
        require(_exists(tokenId), "Aircraft does not exist");
        return attributes[tokenId];
    }
    
    /**
     * @dev Get an upgrade level for an aircraft
     * @param tokenId Aircraft token ID
     * @param upgradeId Upgrade type ID
     * @return Upgrade level
     */
    function getUpgradeLevel(uint256 tokenId, string memory upgradeId) external view returns (uint256) {
        require(_exists(tokenId), "Aircraft does not exist");
        return upgrades[tokenId][upgradeId];
    }
    
    /**
     * @dev Get a customization value for an aircraft
     * @param tokenId Aircraft token ID
     * @param customizationType Type of customization
     * @return Customization value
     */
    function getCustomization(uint256 tokenId, string memory customizationType) external view returns (string memory) {
        require(_exists(tokenId), "Aircraft does not exist");
        return customizations[tokenId][customizationType];
    }
    
    /**
     * @dev Get all aircraft owned by an address
     * @param owner Address to check
     * @return Array of token IDs owned by the address
     */
    function getAircraftByOwner(address owner) external view returns (uint256[] memory) {
        uint256 balance = balanceOf(owner);
        uint256[] memory result = new uint256[](balance);
        
        for (uint256 i = 0; i < balance; i++) {
            result[i] = tokenOfOwnerByIndex(owner, i);
        }
        
        return result;
    }
    
    /**
     * @dev Check if strings are equal
     * @param a First string
     * @param b Second string
     * @return True if strings are equal
     */
    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(abi.encodePacked(a)) == keccak256(abi.encodePacked(b));
    }
    
    /**
     * @dev Override _beforeTokenTransfer for custom logic
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(ERC721, ERC721Enumerable) {
        // Check if aircraft is locked (except for minting)
        if (from != address(0)) {
            require(!attributes[tokenId].isLocked, "Aircraft is locked and cannot be transferred");
        }
        
        super._beforeTokenTransfer(from, to, tokenId);
    }
    
    /**
     * @dev Withdraw SKY tokens from the contract
     * @param amount Amount to withdraw
     * @param to Address to send tokens to
     */
    function withdrawTokens(uint256 amount, address to) external onlyRole(ADMIN_ROLE) {
        require(skyToken.transfer(to, amount), "Token transfer failed");
    }
    
    // Override required functions from inherited contracts
    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }
    
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

/**
 * @title SkyWarsMarketplace
 * @dev Marketplace contract for buying and selling SkyWars Aircraft NFTs
 */
contract SkyWarsMarketplace is ReentrancyGuard, AccessControl {
    using Counters for Counters.Counter;
    Counters.Counter private _listingIds;
    
    // SkyWarsAircraft NFT contract
    SkyWarsAircraft public aircraftContract;
    
    // SkyToken contract for payments
    IERC20 public skyToken;
    
    // Role for admin functions
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    // Fee configuration
    uint256 public feePercentage = 250; // 2.5% (in basis points)
    address public feeRecipient;
    
    // Listing status enum
    enum ListingStatus { Active, Sold, Cancelled }
    
    // Listing struct
    struct Listing {
        uint256 listingId;
        uint256 tokenId;
        address seller;
        uint256 price;
        ListingStatus status;
        uint256 createdAt;
        uint256 updatedAt;
    }
    
    // Mapping of listing ID to listing data
    mapping(uint256 => Listing) public listings;
    
    // Events
    event ListingCreated(uint256 indexed listingId, uint256 indexed tokenId, address indexed seller, uint256 price);
    event ListingSold(uint256 indexed listingId, uint256 indexed tokenId, address seller, address buyer, uint256 price);
    event ListingCancelled(uint256 indexed listingId, uint256 indexed tokenId, address seller);
    event ListingPriceChanged(uint256 indexed listingId, uint256 oldPrice, uint256 newPrice);
    event FeePercentageChanged(uint256 oldFeePercentage, uint256 newFeePercentage);
    event FeeRecipientChanged(address oldFeeRecipient, address newFeeRecipient);
    
    /**
     * @dev Constructor
     * @param _aircraftContract Address of SkyWarsAircraft contract
     * @param _skyToken Address of SkyToken contract
     * @param _feeRecipient Address to receive marketplace fees
     */
    constructor(
        address _aircraftContract,
        address _skyToken,
        address _feeRecipient
    ) {
        require(_aircraftContract != address(0), "Invalid aircraft contract");
        require(_skyToken != address(0), "Invalid token contract");
        require(_feeRecipient != address(0), "Invalid fee recipient");
        
        aircraftContract = SkyWarsAircraft(_aircraftContract);
        skyToken = IERC20(_skyToken);
        feeRecipient = _feeRecipient;
        
        // Setup roles
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
    }
    
    /**
     * @dev Create a new listing
     * @param tokenId Aircraft token ID to list
     * @param price Listing price in SKY tokens
     */
    function createListing(uint256 tokenId, uint256 price) external nonReentrant returns (uint256) {
        require(price > 0, "Price must be greater than zero");
        require(aircraftContract.ownerOf(tokenId) == msg.sender, "Not the owner of the aircraft");
        
        // Ensure marketplace is approved to transfer the NFT
        require(
            aircraftContract.getApproved(tokenId) == address(this) || 
            aircraftContract.isApprovedForAll(msg.sender, address(this)),
            "Marketplace not approved to transfer this NFT"
        );
        
        // Get next listing ID
        uint256 listingId = _listingIds.current();
        _listingIds.increment();
        
        // Create listing
        listings[listingId] = Listing({
            listingId: listingId,
            tokenId: tokenId,
            seller: msg.sender,
            price: price,
            status: ListingStatus.Active,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });
        
        emit ListingCreated(listingId, tokenId, msg.sender, price);
        
        return listingId;
    }
    
    /**
     * @dev Purchase an aircraft from a listing
     * @param listingId Listing ID to purchase
     */
    function purchaseListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        
        require(listing.status == ListingStatus.Active, "Listing is not active");
        require(listing.seller != msg.sender, "Cannot buy your own listing");
        
        // Check if seller still owns and has approved the NFT
        require(
            aircraftContract.ownerOf(listing.tokenId) == listing.seller,
            "Seller no longer owns this aircraft"
        );
        
        require(
            aircraftContract.getApproved(listing.tokenId) == address(this) || 
            aircraftContract.isApprovedForAll(listing.seller, address(this)),
            "Marketplace not approved to transfer this NFT"
        );
        
        // Calculate fees
        uint256 fee = (listing.price * feePercentage) / 10000;
        uint256 sellerProceeds = listing.price - fee;
        
        // Process payment
        require(skyToken.transferFrom(msg.sender, listing.seller, sellerProceeds), "Payment to seller failed");
        if (fee > 0) {
            require(skyToken.transferFrom(msg.sender, feeRecipient, fee), "Fee payment failed");
        }
        
        // Transfer NFT to buyer
        aircraftContract.safeTransferFrom(listing.seller, msg.sender, listing.tokenId);
        
        // Update listing status
        listing.status = ListingStatus.Sold;
        listing.updatedAt = block.timestamp;
        
        emit ListingSold(listingId, listing.tokenId, listing.seller, msg.sender, listing.price);
    }
    
    /**
     * @dev Cancel a listing
     * @param listingId Listing ID to cancel
     */
    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        
        require(listing.status == ListingStatus.Active, "Listing is not active");
        require(listing.seller == msg.sender || hasRole(ADMIN_ROLE, msg.sender), "Not the seller or admin");
        
        // Update listing status
        listing.status = ListingStatus.Cancelled;
        listing.updatedAt = block.timestamp;
        
        emit ListingCancelled(listingId, listing.tokenId, listing.seller);
    }
    
    /**
     * @dev Change the price of a listing
     * @param listingId Listing ID to update
     * @param newPrice New listing price
     */
    function updateListingPrice(uint256 listingId, uint256 newPrice) external nonReentrant {
        require(newPrice > 0, "Price must be greater than zero");
        
        Listing storage listing = listings[listingId];
        
        require(listing.status == ListingStatus.Active, "Listing is not active");
        require(listing.seller == msg.sender, "Not the seller");
        
        uint256 oldPrice = listing.price;
        listing.price = newPrice;
        listing.updatedAt = block.timestamp;
        
        emit ListingPriceChanged(listingId, oldPrice, newPrice);
    }
    
    /**
     * @dev Get all active listings
     * @return Array of active listing IDs
     */
    function getActiveListings() external view returns (uint256[] memory) {
        uint256 totalListings = _listingIds.current();
        uint256 activeCount = 0;
        
        // Count active listings
        for (uint256 i = 0; i < totalListings; i++) {
            if (listings[i].status == ListingStatus.Active) {
                activeCount++;
            }
        }
        
        // Create result array
        uint256[] memory result = new uint256[](activeCount);
        uint256 index = 0;
        
        // Fill result array
        for (uint256 i = 0; i < totalListings; i++) {
            if (listings[i].status == ListingStatus.Active) {
                result[index] = i;
                index++;
            }
        }
        
        return result;
    }
    
    /**
     * @dev Get listings by seller
     * @param seller Seller address
     * @return Array of listing IDs
     */
    function getListingsBySeller(address seller) external view returns (uint256[] memory) {
        uint256 totalListings = _listingIds.current();
        uint256 sellerCount = 0;
        
        // Count seller's listings
        for (uint256 i = 0; i < totalListings; i++) {
            if (listings[i].seller == seller) {
                sellerCount++;
            }
        }
        
        // Create result array
        uint256[] memory result = new uint256[](sellerCount);
        uint256 index = 0;
        
        // Fill result array
        for (uint256 i = 0; i < totalListings; i++) {
            if (listings[i].seller == seller) {
                result[index] = i;
                index++;
            }
        }
        
        return result;
    }
    
    /**
     * @dev Get a listing
     * @param listingId Listing ID
     * @return Listing data
     */
    function getListing(uint256 listingId) external view returns (Listing memory) {
        return listings[listingId];
    }
    
    /**
     * @dev Set fee percentage
     * @param _feePercentage New fee percentage (in basis points)
     */
    function setFeePercentage(uint256 _feePercentage) external onlyRole(ADMIN_ROLE) {
        require(_feePercentage <= 1000, "Fee percentage too high"); // Max 10%
        
        uint256 oldFeePercentage = feePercentage;
        feePercentage = _feePercentage;
        
        emit FeePercentageChanged(oldFeePercentage, _feePercentage);
    }
    
    /**
     * @dev Set fee recipient
     * @param _feeRecipient New fee recipient address
     */
    function setFeeRecipient(address _feeRecipient) external onlyRole(ADMIN_ROLE) {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        
        address oldFeeRecipient = feeRecipient;
        feeRecipient = _feeRecipient;
        
        emit FeeRecipientChanged(oldFeeRecipient, _feeRecipient);
    }
    
    /**
     * @dev Emergency function to rescue stuck NFTs
     * @param tokenId NFT token ID to rescue
     * @param to Address to send NFT to
     */
    function rescueStuckNFT(uint256 tokenId, address to) external onlyRole(ADMIN_ROLE) {
        require(to != address(0), "Cannot send to zero address");
        require(aircraftContract.ownerOf(tokenId) == address(this), "NFT not owned by marketplace");
        
        aircraftContract.safeTransferFrom(address(this), to, tokenId);
    }
    
    /**
     * @dev Emergency function to rescue stuck tokens
     * @param token Token contract address
     * @param amount Amount to withdraw
     * @param to Recipient address
     */
    function rescueStuckTokens(address token, uint256 amount, address to) external onlyRole(ADMIN_ROLE) {
        require(to != address(0), "Cannot send to zero address");
        require(IERC20(token).transfer(to, amount), "Token transfer failed");
    }
}