# SkyWars: Multiplayer Blockchain-Powered Plane Game

SkyWars is a high-performance multiplayer aerial combat game with integrated blockchain economy. Players engage in dogfights, complete missions, and trade unique aircraft NFTs in a dynamic, physics-based 3D environment.

## 🚀 Features

- **Immersive 3D Gameplay**: Realistic flight physics and combat using Three.js
- **Multiplayer Action**: Real-time aerial combat with players worldwide
- **Blockchain Integration**: Own your aircraft as NFTs and earn SkyTokens
- **Aircraft Marketplace**: Buy, sell, and trade unique aircraft with other players
- **Progressive Missions**: Complete challenges to earn tokens and unlock new content

## 🔧 Technology Stack

### Frontend
- **Game Engine**: Three.js for 3D rendering and physics
- **UI Framework**: React with TypeScript
- **Blockchain**: Web3.js/ethers.js for wallet connectivity
- **Networking**: Socket.io for real-time communication

### Backend
- **Server**: Node.js with Express
- **Game Server**: Custom WebSocket implementation with Socket.io
- **Database**: MongoDB for user data and game state
- **Authentication**: JWT-based auth system

### Blockchain
- **Smart Contracts**: Solidity (ERC20 for SkyToken, ERC721 for Aircraft NFTs)
- **Networks**: Ethereum, Polygon (with planned expansion to other chains)
- **Wallet Support**: MetaMask, WalletConnect, Coinbase Wallet

## 🏗️ Architecture

SkyWars follows a modular architecture with clear separation between game logic, networking, and blockchain components:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌───────────┐      ┌─────────────┐       ┌──────────────────────────┐  │
│  │           │      │             │       │                          │  │
│  │  Client   │◄────►│   Server    │◄─────►│       Blockchain         │  │
│  │           │      │             │       │                          │  │
│  └───────────┘      └─────────────┘       └──────────────────────────┘  │
│        ▲                   ▲                          ▲                 │
│        │                   │                          │                 │
│        │                   │                          │                 │
│        │                   ▼                          │                 │
│        │             ┌─────────────┐                  │                 │
│        │             │             │                  │                 │
│        └─────────────┤   Database  ├──────────────────┘                 │
│                      │             │                                    │
│                      └─────────────┘                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 🚀 Getting Started

### Prerequisites
- Node.js 16+
- MongoDB
- MetaMask or compatible Web3 wallet
- Git

### Installation

1. Clone the repository
```bash
git clone https://github.com/your-org/skywars.git
cd skywars
```

2. Install dependencies
```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..

# Install contract dependencies
cd contracts
npm install
cd ..
```

3. Set up environment variables
```bash
# Copy example environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp contracts/.env.example contracts/.env
```

4. Start the development environment
```bash
# Start the entire stack with Docker Compose
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

5. Deploy smart contracts to local network
```bash
cd contracts
npx hardhat run scripts/deploy.js --network localhost
```

6. Access the application
```
Frontend: http://localhost:80
Backend API: http://localhost:3001
```

## 💼 Smart Contracts

### SkyToken (ERC20)
The in-game currency token used for:
- Purchasing aircraft and upgrades
- Trading between players
- Rewards for achievements and gameplay

### AircraftNFT (ERC721)
Represents ownership of unique aircraft with:
- Visual appearance and customization
- Performance characteristics
- Special abilities and weapons
- Rarity and collectible value

### Marketplace
Facilitates trading of aircraft NFTs with:
- Secure escrow functionality
- Fixed price and auction listings
- Transaction fee mechanism

## 🛠️ Development Workflow

### Local Development
1. Run the game in local development mode:
```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

2. Test smart contracts:
```bash
cd contracts
npx hardhat test
```

### Deployment
The project uses GitHub Actions for CI/CD:
- Pull requests trigger test workflows
- Merges to main branch deploy to staging
- Tagged releases deploy to production

## 📚 Documentation

- [Architecture Overview](docs/architecture.md)
- [API Documentation](docs/api.md)
- [Smart Contract Specification](docs/contracts.md)
- [Game Mechanics](docs/gameplay.md)
- [Deployment Guide](docs/deployment.md)

## 🗺️ Roadmap

### Phase 1: Aircraft & Environment Expansion
- New aircraft types including fighters, bombers, and support classes
- Expanded environments: canyons, arctic, night operations, and oceanic
- First seasonal event: "Skies Ablaze"

### Phase 2: Advanced Game Modes
- Competitive leagues with ELO rating system
- Mission-based gameplay with single-player and co-op options
- Special game modes: Capture the Flag, Air Superiority, Racing, Battle Royale

### Phase 3: Social Features & Guilds
- Squadron system for player guilds
- Social hub for player interaction
- Friend system and enhanced communication

### Phase 4: DAO Governance & Economic Maturity
- SkyWars DAO implementation for community governance
- Advanced economic mechanics including aircraft lending
- User-generated content platform

## 👥 Contributing

We welcome contributions from the community! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting pull requests.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Contact


