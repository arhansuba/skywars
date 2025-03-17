// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title SkyToken
 * @dev Implementation of the in-game currency for the SkyWars multiplayer plane game
 * Features include rewarding players, purchasing items, player-to-player trading,
 * and administrative functions for game balance.
 */
contract SkyToken is ERC20, ERC20Burnable, Pausable, Ownable, AccessControl, ReentrancyGuard {
    // Define roles for access control
    bytes32 public constant GAME_SERVER_ROLE = keccak256("GAME_SERVER_ROLE");
    bytes32 public constant REWARD_DISTRIBUTOR_ROLE = keccak256("REWARD_DISTRIBUTOR_ROLE");
    bytes32 public constant MARKETPLACE_ROLE = keccak256("MARKETPLACE_ROLE");

    // Maximum token supply
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 billion tokens with 18 decimals

    // Game economy parameters
    uint256 public transferFeePercentage = 2; // 2% fee on transfers
    uint256 public maxDailyReward = 1000 * 10**18; // 1000 tokens per day per player
    uint256 public maxTransactionAmount = 100_000 * 10**18; // 100,000 tokens per transaction
    bool public areFeesEnabled = true;

    // Reward tracking
    mapping(address => uint256) public dailyRewards;
    mapping(address => uint256) public lastRewardTimestamp;
    
    // In-game store
    struct Item {
        uint256 id;
        string name;
        uint256 price;
        bool available;
    }
    mapping(uint256 => Item) public items;
    uint256 public itemCount;
    
    // Player stats
    struct PlayerStats {
        uint256 tokensEarned;
        uint256 tokensSpent;
        uint256 lastActivity;
    }
    mapping(address => PlayerStats) public playerStats;

    // Treasury for collected fees
    address public treasury;
    
    // Rewards pool
    uint256 public rewardsPool;

    // Events
    event TokensAwarded(address indexed player, uint256 amount, string achievementType);
    event ItemPurchased(address indexed player, uint256 itemId, string itemName, uint256 price);
    event ItemListed(uint256 indexed itemId, string name, uint256 price);
    event ItemUpdated(uint256 indexed itemId, string name, uint256 price, bool available);
    event RewardsPoolReplenished(uint256 amount, uint256 newTotal);
    event FeeCollected(address indexed from, address indexed to, uint256 amount);
    event TransferFeeChanged(uint256 oldFee, uint256 newFee);
    event MaxDailyRewardChanged(uint256 oldMax, uint256 newMax);
    event MaxTransactionAmountChanged(uint256 oldMax, uint256 newMax);
    event TreasuryChanged(address oldTreasury, address newTreasury);
    event FeesToggled(bool enabled);

    /**
     * @dev Constructor that sets up roles and mints initial supply
     * @param initialSupply The amount of tokens to mint initially
     * @param treasuryAddress The address of the treasury to collect fees
     */
    constructor(
        uint256 initialSupply,
        address treasuryAddress
    ) ERC20("SkyWars Token", "SKY") Ownable(msg.sender) {
        require(initialSupply <= MAX_SUPPLY, "Initial supply exceeds maximum");
        require(treasuryAddress != address(0), "Treasury cannot be zero address");
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        
        // Mint initial supply to contract owner
        _mint(msg.sender, initialSupply);
        
        // Set treasury address
        treasury = treasuryAddress;
        
        // Allocate tokens for rewards pool (10% of initial supply)
        rewardsPool = initialSupply / 10;
    }

    /**
     * @dev Pauses all token transfers and operations
     * @notice Only callable by admin
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpauses all token transfers and operations
     * @notice Only callable by admin
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Add a new game server that can award tokens
     * @param serverAddress Address of the game server
     */
    function addGameServer(address serverAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(GAME_SERVER_ROLE, serverAddress);
    }

    /**
     * @dev Remove a game server
     * @param serverAddress Address of the game server to remove
     */
    function removeGameServer(address serverAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(GAME_SERVER_ROLE, serverAddress);
    }

    /**
     * @dev Add a reward distributor role
     * @param distributorAddress Address of the distributor
     */
    function addRewardDistributor(address distributorAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(REWARD_DISTRIBUTOR_ROLE, distributorAddress);
    }

    /**
     * @dev Add a marketplace that can facilitate purchases
     * @param marketplaceAddress Address of the marketplace
     */
    function addMarketplace(address marketplaceAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MARKETPLACE_ROLE, marketplaceAddress);
    }

    /**
     * @dev Update the treasury address
     * @param newTreasury New treasury address
     */
    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newTreasury != address(0), "Treasury cannot be zero address");
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryChanged(oldTreasury, newTreasury);
    }

    /**
     * @dev Change the transfer fee percentage
     * @param newFeePercentage New fee percentage (0-10)
     */
    function setTransferFeePercentage(uint256 newFeePercentage) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newFeePercentage <= 10, "Fee cannot exceed 10%");
        uint256 oldFee = transferFeePercentage;
        transferFeePercentage = newFeePercentage;
        emit TransferFeeChanged(oldFee, newFeePercentage);
    }

    /**
     * @dev Toggle whether fees are charged on transfers
     * @param enabled Whether fees should be enabled
     */
    function toggleFees(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        areFeesEnabled = enabled;
        emit FeesToggled(enabled);
    }

    /**
     * @dev Set the maximum daily reward amount per player
     * @param newMaxReward New maximum daily reward
     */
    function setMaxDailyReward(uint256 newMaxReward) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldMax = maxDailyReward;
        maxDailyReward = newMaxReward;
        emit MaxDailyRewardChanged(oldMax, newMaxReward);
    }

    /**
     * @dev Set the maximum amount allowed in a single transaction
     * @param newMaxAmount New maximum transaction amount
     */
    function setMaxTransactionAmount(uint256 newMaxAmount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldMax = maxTransactionAmount;
        maxTransactionAmount = newMaxAmount;
        emit MaxTransactionAmountChanged(oldMax, newMaxAmount);
    }

    /**
     * @dev Replenish the rewards pool
     * @param amount Amount to add to the rewards pool
     */
    function replenishRewardsPool(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(amount > 0, "Amount must be greater than zero");
        require(totalSupply() + amount <= MAX_SUPPLY, "Would exceed max supply");
        
        // Mint new tokens directly to the contract
        _mint(address(this), amount);
        
        // Update rewards pool
        rewardsPool += amount;
        
        emit RewardsPoolReplenished(amount, rewardsPool);
    }

    /**
     * @dev Withdraw fees collected in the treasury
     * @param recipient Address to receive the fees
     * @param amount Amount to withdraw
     */
    function withdrawFromTreasury(address recipient, uint256 amount) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
        nonReentrant 
    {
        require(recipient != address(0), "Cannot withdraw to zero address");
        require(balanceOf(treasury) >= amount, "Insufficient treasury balance");
        
        _transfer(treasury, recipient, amount);
    }

    /**
     * @dev Add a new item to the in-game store
     * @param name Name of the item
     * @param price Price in tokens
     */
    function addItem(string memory name, uint256 price) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bytes(name).length > 0, "Name cannot be empty");
        require(price > 0, "Price must be greater than zero");
        
        // Increment item count and create new item
        itemCount++;
        
        items[itemCount] = Item({
            id: itemCount,
            name: name,
            price: price,
            available: true
        });
        
        emit ItemListed(itemCount, name, price);
    }

    /**
     * @dev Update an existing item
     * @param itemId ID of the item to update
     * @param name New name (pass empty string to keep current)
     * @param price New price (pass 0 to keep current)
     * @param available Whether the item is available for purchase
     */
    function updateItem(uint256 itemId, string memory name, uint256 price, bool available) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(itemId > 0 && itemId <= itemCount, "Item does not exist");
        
        Item storage item = items[itemId];
        
        // Update fields only if provided
        if (bytes(name).length > 0) {
            item.name = name;
        }
        
        if (price > 0) {
            item.price = price;
        }
        
        item.available = available;
        
        emit ItemUpdated(itemId, item.name, item.price, item.available);
    }

    /**
     * @dev Award tokens to a player for achievements
     * @param player Address of the player to reward
     * @param amount Amount of tokens to award
     * @param achievementType Type of achievement (for event logging)
     */
    function awardTokens(address player, uint256 amount, string memory achievementType) 
        external 
        whenNotPaused
        nonReentrant
    {
        require(
            hasRole(GAME_SERVER_ROLE, msg.sender) || 
            hasRole(REWARD_DISTRIBUTOR_ROLE, msg.sender),
            "Caller cannot award tokens"
        );
        require(player != address(0), "Cannot award to zero address");
        require(amount > 0, "Amount must be greater than zero");
        
        // Enforce daily reward limit
        uint256 today = block.timestamp / 1 days;
        uint256 lastRewardDay = lastRewardTimestamp[player] / 1 days;
        
        // Reset daily tracking if it's a new day
        if (today > lastRewardDay) {
            dailyRewards[player] = 0;
        }
        
        // Calculate how much can be awarded without exceeding daily limit
        uint256 remainingDailyAllowance = maxDailyReward - dailyRewards[player];
        uint256 awardAmount = Math.min(amount, remainingDailyAllowance);
        
        require(awardAmount > 0, "Daily reward limit reached");
        require(rewardsPool >= awardAmount, "Insufficient rewards pool");
        
        // Update reward tracking
        dailyRewards[player] += awardAmount;
        lastRewardTimestamp[player] = block.timestamp;
        rewardsPool -= awardAmount;
        
        // Update player stats
        PlayerStats storage stats = playerStats[player];
        stats.tokensEarned += awardAmount;
        stats.lastActivity = block.timestamp;
        
        // Transfer tokens from contract to player
        _transfer(address(this), player, awardAmount);
        
        emit TokensAwarded(player, awardAmount, achievementType);
    }

    /**
     * @dev Purchase an item from the in-game store
     * @param player Address of the player making the purchase
     * @param itemId ID of the item to purchase
     */
    function purchaseItem(address player, uint256 itemId) 
        external 
        whenNotPaused
        nonReentrant
    {
        // Check if caller is authorized
        bool isAuthorized = player == msg.sender || 
                           hasRole(GAME_SERVER_ROLE, msg.sender) || 
                           hasRole(MARKETPLACE_ROLE, msg.sender);
        require(isAuthorized, "Not authorized to make this purchase");
        
        require(itemId > 0 && itemId <= itemCount, "Item does not exist");
        Item storage item = items[itemId];
        require(item.available, "Item is not available");
        
        uint256 price = item.price;
        require(balanceOf(player) >= price, "Insufficient balance");
        
        // Update player stats
        PlayerStats storage stats = playerStats[player];
        stats.tokensSpent += price;
        stats.lastActivity = block.timestamp;
        
        // Transfer tokens from player to treasury
        _transfer(player, treasury, price);
        
        emit ItemPurchased(player, itemId, item.name, price);
    }

    /**
     * @dev Get player statistics
     * @param player Address of the player
     * @return tokensEarned Total tokens earned by player
     * @return tokensSpent Total tokens spent by player
     * @return lastActivity Timestamp of last activity
     */
    function getPlayerStats(address player) 
        external 
        view 
        returns (uint256 tokensEarned, uint256 tokensSpent, uint256 lastActivity) 
    {
        PlayerStats storage stats = playerStats[player];
        return (stats.tokensEarned, stats.tokensSpent, stats.lastActivity);
    }

    /**
     * @dev Get available items from the store
     * @param startId Starting item ID for pagination
     * @param count Maximum number of items to return
     * @return itemIds Array of item IDs
     * @return names Array of item names
     * @return prices Array of item prices
     */
    function getAvailableItems(uint256 startId, uint256 count) 
        external 
        view 
        returns (
            uint256[] memory itemIds,
            string[] memory names,
            uint256[] memory prices
        ) 
    {
        // Calculate how many items to return
        uint256 availableCount = 0;
        uint256 endId = Math.min(startId + count - 1, itemCount);
        
        // First pass: count available items
        for (uint256 i = startId; i <= endId; i++) {
            if (items[i].available) {
                availableCount++;
            }
        }
        
        // Initialize arrays
        itemIds = new uint256[](availableCount);
        names = new string[](availableCount);
        prices = new uint256[](availableCount);
        
        // Second pass: populate arrays
        uint256 index = 0;
        for (uint256 i = startId; i <= endId; i++) {
            if (items[i].available) {
                itemIds[index] = items[i].id;
                names[index] = items[i].name;
                prices[index] = items[i].price;
                index++;
            }
        }
        
        return (itemIds, names, prices);
    }

    /**
     * @dev Hook that is called before any transfer of tokens
     * @param from Address sending the tokens
     * @param to Address receiving the tokens
     * @param amount Amount of tokens to transfer
     */
    function _update(address from, address to, uint256 amount)
        internal
        override
        whenNotPaused
    {
        require(amount <= maxTransactionAmount, "Amount exceeds transaction limit");
        
        // Skip fee logic for certain cases:
        // 1. Minting (from == address(0))
        // 2. Burning (to == address(0))
        // 3. Transfers involving treasury, game server, or contract itself
        // 4. Fees are disabled
        bool shouldApplyFee = areFeesEnabled && 
                             from != address(0) && 
                             to != address(0) && 
                             from != treasury && 
                             to != treasury &&
                             from != address(this) && 
                             to != address(this) &&
                             !hasRole(GAME_SERVER_ROLE, from) && 
                             !hasRole(GAME_SERVER_ROLE, to);
        
        if (shouldApplyFee) {
            // Calculate fee
            uint256 fee = (amount * transferFeePercentage) / 100;
            
            // Transfer main amount minus fee
            super._update(from, to, amount - fee);
            
            // Transfer fee to treasury
            if (fee > 0) {
                super._update(from, treasury, fee);
                emit FeeCollected(from, to, fee);
            }
        } else {
            // No fee applied
            super._update(from, to, amount);
        }
        
        // Update player stats for normal transfers (not minting/burning)
        if (from != address(0) && to != address(0)) {
            playerStats[from].lastActivity = block.timestamp;
            playerStats[to].lastActivity = block.timestamp;
        }
    }

    // Required override for multiple inheritance
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl, ERC20)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}