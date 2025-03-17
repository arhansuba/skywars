/**
 * SkyWars Game UI System
 * 
 * A comprehensive UI framework for the SkyWars multiplayer plane game
 * including HUD, menus, wallet connection, store, and chat system.
 */

// Main UI Manager Class
class SkyWarsUI {
    constructor(game) {
      // Store reference to game instance
      this.game = game;
      
      // UI state
      this.state = {
        activeScreen: 'loading', // 'loading', 'main-menu', 'hangar', 'settings', 'store', 'game'
        hudVisible: true,
        chatVisible: false,
        notificationQueue: [],
        walletConnected: false,
        walletAddress: '',
        tokenBalance: 0,
        modalStack: []
      };
      
      // Initialize UI components
      this.initUI();
      
      // Bind event handlers
      this.bindEvents();
      
      // Show loading screen by default
      this.showScreen('loading');
      
      // Debug flag
      this.debug = false;
    }
    
    /**
     * Initialize UI components and create DOM elements
     */
    initUI() {
      // Create main UI container
      this.container = document.createElement('div');
      this.container.id = 'skywars-ui';
      this.container.className = 'skywars-ui';
      document.body.appendChild(this.container);
      
      // Add stylesheet
      this.addStylesheet();
      
      // Initialize UI components
      this.initScreens();
      this.initHUD();
      this.initChat();
      this.initNotifications();
      
      // Add loading indicators
      this.loadingProgress = 0;
      this.updateLoadingScreen();
    }
    
    /**
     * Add UI stylesheet to document
     */
    addStylesheet() {
      const style = document.createElement('style');
      style.textContent = `
        /* SkyWars UI Stylesheet */
        
        /* Base Styles */
        :root {
          --primary-color: #3498db;
          --secondary-color: #2ecc71;
          --accent-color: #f39c12;
          --danger-color: #e74c3c;
          --dark-color: #2c3e50;
          --light-color: #ecf0f1;
          --bg-translucent: rgba(0, 0, 0, 0.7);
          --text-color: #fff;
          --border-radius: 4px;
          --shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
          --menu-width: 400px;
          --hud-size: 18px;
          --anim-speed: 0.3s;
        }
        
        /* Reset and Base Styles */
        .skywars-ui * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          font-family: 'Exo 2', Arial, sans-serif;
          user-select: none;
        }
        
        .skywars-ui {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 1000;
          overflow: hidden;
        }
        
        /* Buttons */
        .sw-button {
          background: linear-gradient(to bottom, var(--primary-color), #2980b9);
          color: var(--text-color);
          border: none;
          border-radius: var(--border-radius);
          padding: 12px 24px;
          font-size: 18px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s;
          pointer-events: auto;
          text-shadow: 0 1px 2px rgba(0,0,0,0.3);
          box-shadow: var(--shadow);
          text-transform: uppercase;
          letter-spacing: 1px;
          position: relative;
          overflow: hidden;
        }
        
        .sw-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        
        .sw-button:active {
          transform: translateY(1px);
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        
        .sw-button::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            to right,
            transparent,
            rgba(255,255,255,0.2),
            transparent
          );
          transition: left 0.5s;
        }
        
        .sw-button:hover::after {
          left: 100%;
        }
        
        .sw-button.secondary {
          background: linear-gradient(to bottom, var(--secondary-color), #27ae60);
        }
        
        .sw-button.accent {
          background: linear-gradient(to bottom, var(--accent-color), #d35400);
        }
        
        .sw-button.danger {
          background: linear-gradient(to bottom, var(--danger-color), #c0392b);
        }
        
        .sw-button.small {
          padding: 8px 16px;
          font-size: 14px;
        }
        
        .sw-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
        
        /* UI Screens */
        .sw-screen {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
          opacity: 0;
          visibility: hidden;
          transition: opacity var(--anim-speed), visibility var(--anim-speed);
          z-index: 10;
        }
        
        .sw-screen.active {
          opacity: 1;
          visibility: visible;
        }
        
        /* Background overlay */
        .sw-screen-bg {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: var(--bg-translucent);
          backdrop-filter: blur(5px);
          z-index: -1;
        }
        
        /* Screen Container */
        .sw-screen-container {
          width: var(--menu-width);
          max-width: 90%;
          max-height: 90%;
          background: var(--dark-color);
          border-radius: var(--border-radius);
          box-shadow: var(--shadow);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        
        /* Screen Header */
        .sw-screen-header {
          padding: 20px;
          background: rgba(0, 0, 0, 0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        
        .sw-screen-title {
          font-size: 24px;
          font-weight: bold;
          color: var(--text-color);
          text-transform: uppercase;
          letter-spacing: 2px;
          text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        }
        
        .sw-screen-content {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }
        
        .sw-screen-footer {
          padding: 15px 20px;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          background: rgba(0, 0, 0, 0.2);
          border-top: 1px solid rgba(255,255,255,0.1);
        }
        
        /* Loading Screen */
        .sw-loading-screen {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 30px;
          color: var(--text-color);
        }
        
        .sw-loading-logo {
          width: 200px;
          height: 200px;
          animation: pulse 2s infinite;
        }
        
        .sw-loading-progress {
          width: 300px;
          height: 10px;
          background: rgba(255,255,255,0.1);
          border-radius: 5px;
          overflow: hidden;
          position: relative;
        }
        
        .sw-loading-bar {
          height: 100%;
          width: 0%;
          background: var(--primary-color);
          border-radius: 5px;
          transition: width 0.5s;
        }
        
        .sw-loading-text {
          font-size: 18px;
          text-align: center;
        }
        
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        
        /* Main Menu Screen */
        .sw-main-menu {
          text-align: center;
        }
        
        .sw-menu-logo {
          width: 300px;
          max-width: 100%;
          margin-bottom: 40px;
        }
        
        .sw-menu-buttons {
          display: flex;
          flex-direction: column;
          gap: 15px;
          width: 80%;
          margin: 0 auto;
        }
        
        /* HUD Elements */
        .sw-hud {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          opacity: 0;
          visibility: hidden;
          transition: opacity var(--anim-speed), visibility var(--anim-speed);
          z-index: 20;
        }
        
        .sw-hud.active {
          opacity: 1;
          visibility: visible;
        }
        
        .sw-hud-element {
          position: absolute;
          color: var(--text-color);
          font-size: var(--hud-size);
          text-shadow: 0 0 5px rgba(0,0,0,0.5), 0 0 20px rgba(0,0,0,0.3);
          font-weight: bold;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        
        .sw-hud-value {
          font-weight: normal;
        }
        
        /* Altitude Indicator */
        .sw-hud-altitude {
          right: 20px;
          top: 20px;
        }
        
        /* Speed Indicator */
        .sw-hud-speed {
          left: 20px;
          top: 20px;
        }
        
        /* Heading Indicator */
        .sw-hud-heading {
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
        }
        
        /* Aircraft Status */
        .sw-hud-status {
          left: 20px;
          bottom: 20px;
        }
        
        /* Target Indicator */
        .sw-hud-target {
          right: 20px;
          bottom: 20px;
        }
        
        /* Center Indicators */
        .sw-hud-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
        
        .sw-hud-crosshair {
          width: 40px;
          height: 40px;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        
        .sw-crosshair-inner {
          width: 5px;
          height: 5px;
          background: var(--text-color);
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(255,255,255,0.8);
        }
        
        .sw-crosshair-outer {
          position: absolute;
          width: 30px;
          height: 30px;
          border: 2px solid var(--text-color);
          border-radius: 50%;
          opacity: 0.6;
        }
        
        /* Compass */
        .sw-hud-compass-container {
          position: absolute;
          top: 50px;
          left: 50%;
          transform: translateX(-50%);
          width: 300px;
          height: 40px;
          overflow: hidden;
        }
        
        .sw-hud-compass {
          position: absolute;
          width: 900px; /* 360 degrees * 2.5px per degree */
          height: 100%;
          left: 0;
          top: 0;
          display: flex;
          align-items: center;
          transition: transform 0.1s linear;
          background: rgba(0,0,0,0.3);
          border-radius: 5px;
        }
        
        .sw-compass-marker {
          position: absolute;
          top: 0;
          width: 2px;
          height: 100%;
          background: var(--text-color);
          left: 50%;
          transform: translateX(-50%);
        }
        
        .sw-compass-tick {
          position: absolute;
          width: 1px;
          height: 10px;
          background: rgba(255,255,255,0.5);
          bottom: 0;
        }
        
        .sw-compass-tick.major {
          height: 15px;
          width: 2px;
          background: rgba(255,255,255,0.8);
        }
        
        .sw-compass-label {
          position: absolute;
          font-size: 14px;
          color: var(--text-color);
          bottom: 18px;
          transform: translateX(-50%);
          font-weight: bold;
        }
        
        /* Wallet Display */
        .sw-wallet-display {
          position: absolute;
          top: 20px;
          right: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--bg-translucent);
          padding: 8px 15px;
          border-radius: var(--border-radius);
          pointer-events: auto;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .sw-wallet-display:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        }
        
        .sw-wallet-icon {
          font-size: 20px;
          color: var(--accent-color);
        }
        
        .sw-token-amount {
          font-weight: bold;
          color: var(--text-color);
        }
        
        .sw-token-symbol {
          font-size: 14px;
          color: rgba(255,255,255,0.8);
        }
        
        .sw-wallet-address {
          font-size: 12px;
          color: rgba(255,255,255,0.7);
          max-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        /* Chat System */
        .sw-chat {
          position: absolute;
          bottom: 20px;
          left: 20px;
          width: 350px;
          max-width: calc(100% - 40px);
          display: flex;
          flex-direction: column;
          pointer-events: auto;
          z-index: 30;
          transition: transform var(--anim-speed);
          transform: translateY(calc(100% - 40px));
        }
        
        .sw-chat.active {
          transform: translateY(0);
        }
        
        .sw-chat-header {
          background: var(--dark-color);
          padding: 10px;
          border-radius: var(--border-radius) var(--border-radius) 0 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
        }
        
        .sw-chat-title {
          color: var(--text-color);
          font-weight: bold;
        }
        
        .sw-chat-toggle {
          color: var(--text-color);
          font-size: 18px;
          background: transparent;
          border: none;
          cursor: pointer;
        }
        
        .sw-chat-messages {
          background: var(--bg-translucent);
          border-radius: 0;
          height: 200px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          padding: 10px;
          gap: 8px;
        }
        
        .sw-chat-message {
          display: flex;
          flex-direction: column;
          color: var(--text-color);
          font-size: 14px;
          animation: message-fade 0.3s ease-in-out;
        }
        
        @keyframes message-fade {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .sw-chat-sender {
          font-weight: bold;
          color: var(--primary-color);
        }
        
        .sw-chat-sender.system {
          color: var(--accent-color);
        }
        
        .sw-chat-content {
          word-break: break-word;
        }
        
        .sw-chat-input-container {
          display: flex;
          background: var(--dark-color);
          border-radius: 0 0 var(--border-radius) var(--border-radius);
          overflow: hidden;
        }
        
        .sw-chat-input {
          flex: 1;
          background: rgba(255,255,255,0.1);
          border: none;
          padding: 10px;
          color: var(--text-color);
          font-size: 14px;
        }
        
        .sw-chat-input:focus {
          outline: none;
        }
        
        .sw-chat-send {
          background: var(--primary-color);
          color: var(--text-color);
          border: none;
          padding: 0 15px;
          cursor: pointer;
        }
        
        /* Notification System */
        .sw-notifications {
          position: absolute;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 300px;
          max-width: 90%;
          z-index: 50;
        }
        
        .sw-notification {
          background: var(--bg-translucent);
          backdrop-filter: blur(5px);
          border-radius: var(--border-radius);
          padding: 15px;
          color: var(--text-color);
          box-shadow: var(--shadow);
          animation: notification-slide-in 0.3s ease-out forwards;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .sw-notification.removing {
          animation: notification-slide-out 0.3s ease-in forwards;
        }
        
        @keyframes notification-slide-in {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes notification-slide-out {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-20px); }
        }
        
        .sw-notification-icon {
          font-size: 20px;
        }
        
        .sw-notification-icon.info { color: var(--primary-color); }
        .sw-notification-icon.success { color: var(--secondary-color); }
        .sw-notification-icon.warning { color: var(--accent-color); }
        .sw-notification-icon.error { color: var(--danger-color); }
        
        .sw-notification-content {
          flex: 1;
        }
        
        .sw-notification-title {
          font-weight: bold;
          margin-bottom: 3px;
        }
        
        .sw-notification-message {
          font-size: 14px;
          opacity: 0.9;
        }
        
        /* Modal System */
        .sw-modal-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          pointer-events: none;
        }
        
        .sw-modal {
          position: relative;
          background: var(--dark-color);
          border-radius: var(--border-radius);
          width: 400px;
          max-width: 90%;
          max-height: 90vh;
          box-shadow: var(--shadow);
          display: flex;
          flex-direction: column;
          pointer-events: auto;
          opacity: 0;
          transform: scale(0.9);
          transition: opacity 0.3s, transform 0.3s;
          overflow: hidden;
        }
        
        .sw-modal.active {
          opacity: 1;
          transform: scale(1);
        }
        
        .sw-modal-backdrop {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(5px);
          pointer-events: auto;
          opacity: 0;
          transition: opacity 0.3s;
          z-index: -1;
        }
        
        .sw-modal-backdrop.active {
          opacity: 1;
        }
        
        .sw-modal-header {
          padding: 15px 20px;
          background: rgba(0, 0, 0, 0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        
        .sw-modal-title {
          font-size: 20px;
          font-weight: bold;
          color: var(--text-color);
        }
        
        .sw-modal-close {
          background: transparent;
          border: none;
          color: var(--text-color);
          font-size: 20px;
          cursor: pointer;
          padding: 5px;
          opacity: 0.7;
          transition: opacity 0.2s;
        }
        
        .sw-modal-close:hover {
          opacity: 1;
        }
        
        .sw-modal-content {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
          color: var(--text-color);
        }
        
        .sw-modal-footer {
          padding: 15px 20px;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          background: rgba(0, 0, 0, 0.2);
          border-top: 1px solid rgba(255,255,255,0.1);
        }
        
        /* Settings Screen */
        .sw-settings {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        .sw-settings-section {
          margin-bottom: 20px;
        }
        
        .sw-settings-title {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 15px;
          color: var(--primary-color);
          border-bottom: 1px solid rgba(255,255,255,0.1);
          padding-bottom: 5px;
        }
        
        .sw-settings-group {
          display: flex;
          flex-direction: column;
          gap: 15px;
          margin-bottom: 15px;
        }
        
        .sw-setting-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .sw-setting-label {
          flex: 1;
          font-size: 16px;
        }
        
        .sw-setting-control {
          flex: 1;
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 10px;
        }
        
        .sw-slider {
          flex: 1;
          -webkit-appearance: none;
          height: 8px;
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
        }
        
        .sw-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--primary-color);
          cursor: pointer;
        }
        
        .sw-select {
          background: rgba(255,255,255,0.1);
          color: var(--text-color);
          border: none;
          padding: 8px 12px;
          border-radius: var(--border-radius);
          width: 150px;
        }
        
        .sw-select option {
          background: var(--dark-color);
        }
        
        .sw-checkbox {
          -webkit-appearance: none;
          width: 50px;
          height: 24px;
          background: rgba(255,255,255,0.1);
          border-radius: 12px;
          position: relative;
          cursor: pointer;
          transition: background 0.3s;
        }
        
        .sw-checkbox:checked {
          background: var(--primary-color);
        }
        
        .sw-checkbox::after {
          content: '';
          position: absolute;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--text-color);
          top: 3px;
          left: 3px;
          transition: left 0.3s;
        }
        
        .sw-checkbox:checked::after {
          left: 29px;
        }
        
        /* Hangar Screen */
        .sw-hangar {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        .sw-aircraft-list {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          justify-content: center;
        }
        
        .sw-aircraft-card {
          width: 180px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: var(--border-radius);
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
          cursor: pointer;
        }
        
        .sw-aircraft-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.3);
        }
        
        .sw-aircraft-card.selected {
          border: 2px solid var(--primary-color);
        }
        
        .sw-aircraft-image {
          width: 100%;
          height: 100px;
          background-size: contain;
          background-position: center;
          background-repeat: no-repeat;
          background-color: rgba(0,0,0,0.5);
        }
        
        .sw-aircraft-info {
          padding: 10px;
        }
        
        .sw-aircraft-name {
          font-weight: bold;
          margin-bottom: 5px;
          color: var(--text-color);
        }
        
        .sw-aircraft-stats {
          display: flex;
          flex-direction: column;
          gap: 5px;
          font-size: 12px;
          color: rgba(255,255,255,0.8);
        }
        
        .sw-stat {
          display: flex;
          justify-content: space-between;
        }
        
        .sw-stat-value {
          font-weight: bold;
        }
        
        .sw-aircraft-status {
          display: flex;
          justify-content: space-between;
          padding: 8px;
          border-top: 1px solid rgba(255,255,255,0.1);
          font-size: 12px;
          color: var(--text-color);
        }
        
        .sw-aircraft-price {
          color: var(--accent-color);
          font-weight: bold;
        }
        
        /* Store Screen */
        .sw-store {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        .sw-store-tabs {
          display: flex;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        
        .sw-store-tab {
          padding: 10px 20px;
          color: var(--text-color);
          cursor: pointer;
          opacity: 0.7;
          transition: opacity 0.2s, border-bottom 0.2s;
          border-bottom: 2px solid transparent;
        }
        
        .sw-store-tab:hover {
          opacity: 1;
        }
        
        .sw-store-tab.active {
          opacity: 1;
          border-bottom: 2px solid var(--primary-color);
        }
        
        .sw-store-content {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          justify-content: center;
          padding: 10px 0;
        }
        
        .sw-store-item {
          width: 160px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: var(--border-radius);
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
          cursor: pointer;
        }
        
        .sw-store-item:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.3);
        }
        
        .sw-item-image {
          width: 100%;
          height: 100px;
          background-size: contain;
          background-position: center;
          background-repeat: no-repeat;
          background-color: rgba(0,0,0,0.5);
        }
        
        .sw-item-info {
          padding: 10px;
        }
        
        .sw-item-name {
          font-weight: bold;
          margin-bottom: 5px;
          color: var(--text-color);
        }
        
        .sw-item-description {
          font-size: 12px;
          color: rgba(255,255,255,0.8);
          height: 40px;
          overflow: hidden;
        }
        
        .sw-item-price-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 10px;
        }
        
        .sw-item-price {
          display: flex;
          align-items: center;
          gap: 5px;
          color: var(--accent-color);
          font-weight: bold;
        }
        
        .sw-item-buy {
          background: var(--secondary-color);
          color: var(--text-color);
          border: none;
          border-radius: 3px;
          padding: 5px 10px;
          font-size: 12px;
          cursor: pointer;
        }
        
        /* Wallet Connection Modal */
        .sw-wallet-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        .sw-wallet-options {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        
        .sw-wallet-option {
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 15px;
          border-radius: var(--border-radius);
          background: rgba(255,255,255,0.05);
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .sw-wallet-option:hover {
          background: rgba(255,255,255,0.1);
        }
        
        .sw-wallet-logo {
          width: 30px;
          height: 30px;
          background-size: contain;
          background-position: center;
          background-repeat: no-repeat;
        }
        
        .sw-wallet-name {
          font-weight: bold;
          color: var(--text-color);
        }
        
        .sw-wallet-status {
          margin-top: 15px;
          padding: 10px;
          border-radius: var(--border-radius);
          background: rgba(0,0,0,0.2);
          font-size: 14px;
          color: var(--text-color);
        }
        
        /* Responsive Styles */
        @media (max-width: 768px) {
          :root {
            --hud-size: 14px;
            --menu-width: 90%;
          }
          
          .sw-wallet-display {
            top: 10px;
            right: 10px;
            padding: 5px 10px;
          }
          
          .sw-hud-altitude,
          .sw-hud-speed {
            font-size: 14px;
          }
          
          .sw-hud-compass-container {
            width: 200px;
            top: 30px;
          }
          
          .sw-aircraft-card {
            width: 140px;
          }
          
          .sw-store-item {
            width: 130px;
          }
          
          .sw-chat {
            width: 280px;
            bottom: 10px;
            left: 10px;
          }
          
          .sw-chat-messages {
            height: 150px;
          }
          
          .sw-chat-input {
            font-size: 12px;
          }
        }
      `;
      
      document.head.appendChild(style);
      
      // Add font if not already loaded
      if (!document.getElementById('skywars-font')) {
        const fontLink = document.createElement('link');
        fontLink.id = 'skywars-font';
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;700&display=swap';
        document.head.appendChild(fontLink);
      }
    }
    
    /**
     * Initialize various UI screens
     */
    initScreens() {
      // Create screens container
      this.screens = {};
      
      // Initialize all screens
      this.initLoadingScreen();
      this.initMainMenuScreen();
      this.initSettingsScreen();
      this.initHangarScreen();
      this.initStoreScreen();
      
      // Create modal container
      this.modalContainer = document.createElement('div');
      this.modalContainer.className = 'sw-modal-container';
      this.container.appendChild(this.modalContainer);
    }
    
    /**
     * Initialize loading screen
     */
    initLoadingScreen() {
      const screen = document.createElement('div');
      screen.className = 'sw-screen';
      screen.id = 'screen-loading';
      
      // Background
      const bg = document.createElement('div');
      bg.className = 'sw-screen-bg';
      screen.appendChild(bg);
      
      // Loading content
      const content = document.createElement('div');
      content.className = 'sw-loading-screen';
      
      // Logo
      const logo = document.createElement('div');
      logo.className = 'sw-loading-logo';
      logo.innerHTML = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <path fill="#3498db" d="M50 15 L90 85 L50 70 L10 85 Z" />
        <circle cx="50" cy="40" r="8" fill="#f39c12" />
      </svg>`;
      content.appendChild(logo);
      
      // Progress bar
      const progress = document.createElement('div');
      progress.className = 'sw-loading-progress';
      const bar = document.createElement('div');
      bar.className = 'sw-loading-bar';
      progress.appendChild(bar);
      content.appendChild(progress);
      
      // Loading text
      const text = document.createElement('div');
      text.className = 'sw-loading-text';
      text.innerText = 'Loading game assets...';
      content.appendChild(text);
      
      screen.appendChild(content);
      this.container.appendChild(screen);
      
      // Store references
      this.screens.loading = {
        element: screen,
        progressBar: bar,
        progressText: text
      };
    }
    
    /**
     * Initialize main menu screen
     */
    initMainMenuScreen() {
      const screen = document.createElement('div');
      screen.className = 'sw-screen';
      screen.id = 'screen-main-menu';
      
      // Background
      const bg = document.createElement('div');
      bg.className = 'sw-screen-bg';
      screen.appendChild(bg);
      
      // Content container
      const content = document.createElement('div');
      content.className = 'sw-main-menu';
      
      // Logo
      const logo = document.createElement('div');
      logo.className = 'sw-menu-logo';
      logo.innerHTML = `<svg viewBox="0 0 300 100" xmlns="http://www.w3.org/2000/svg">
        <path fill="#3498db" d="M20 70 L50 20 L80 70 Z" />
        <path fill="#f39c12" d="M100 70 L130 20 L160 70 Z" />
        <path fill="#2ecc71" d="M180 70 L210 20 L240 70 Z" />
        <text x="150" y="90" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">SKYWARS</text>
      </svg>`;
      content.appendChild(logo);
      
      // Menu buttons
      const buttons = document.createElement('div');
      buttons.className = 'sw-menu-buttons';
      
      // Play button
      const playBtn = document.createElement('button');
      playBtn.className = 'sw-button';
      playBtn.innerText = 'PLAY NOW';
      playBtn.addEventListener('click', () => this.startGame());
      buttons.appendChild(playBtn);
      
      // Hangar button
      const hangarBtn = document.createElement('button');
      hangarBtn.className = 'sw-button secondary';
      hangarBtn.innerText = 'HANGAR';
      hangarBtn.addEventListener('click', () => this.showScreen('hangar'));
      buttons.appendChild(hangarBtn);
      
      // Store button
      const storeBtn = document.createElement('button');
      storeBtn.className = 'sw-button accent';
      storeBtn.innerText = 'STORE';
      storeBtn.addEventListener('click', () => this.showScreen('store'));
      buttons.appendChild(storeBtn);
      
      // Settings button
      const settingsBtn = document.createElement('button');
      settingsBtn.className = 'sw-button';
      settingsBtn.innerText = 'SETTINGS';
      settingsBtn.addEventListener('click', () => this.showScreen('settings'));
      buttons.appendChild(settingsBtn);
      
      // Wallet button (only shows if not connected)
      const walletBtn = document.createElement('button');
      walletBtn.className = 'sw-button';
      walletBtn.innerText = 'CONNECT WALLET';
      walletBtn.addEventListener('click', () => this.showWalletModal());
      walletBtn.id = 'main-wallet-button';
      walletBtn.style.display = this.state.walletConnected ? 'none' : 'block';
      buttons.appendChild(walletBtn);
      
      content.appendChild(buttons);
      screen.appendChild(content);
      this.container.appendChild(screen);
      
      // Store references
      this.screens.mainMenu = {
        element: screen,
        walletButton: walletBtn
      };
    }
    
    /**
     * Initialize settings screen
     */
    initSettingsScreen() {
      const screen = document.createElement('div');
      screen.className = 'sw-screen';
      screen.id = 'screen-settings';
      
      // Background
      const bg = document.createElement('div');
      bg.className = 'sw-screen-bg';
      screen.appendChild(bg);
      
      // Container
      const container = document.createElement('div');
      container.className = 'sw-screen-container';
      
      // Header
      const header = document.createElement('div');
      header.className = 'sw-screen-header';
      
      const title = document.createElement('div');
      title.className = 'sw-screen-title';
      title.innerText = 'SETTINGS';
      header.appendChild(title);
      
      container.appendChild(header);
      
      // Content
      const content = document.createElement('div');
      content.className = 'sw-screen-content';
      
      const settings = document.createElement('div');
      settings.className = 'sw-settings';
      
      // Graphics section
      const graphicsSection = document.createElement('div');
      graphicsSection.className = 'sw-settings-section';
      
      const graphicsTitle = document.createElement('div');
      graphicsTitle.className = 'sw-settings-title';
      graphicsTitle.innerText = 'Graphics';
      graphicsSection.appendChild(graphicsTitle);
      
      const graphicsGroup = document.createElement('div');
      graphicsGroup.className = 'sw-settings-group';
      
      // Quality setting
      const qualitySetting = document.createElement('div');
      qualitySetting.className = 'sw-setting-item';
      
      const qualityLabel = document.createElement('div');
      qualityLabel.className = 'sw-setting-label';
      qualityLabel.innerText = 'Quality';
      qualitySetting.appendChild(qualityLabel);
      
      const qualityControl = document.createElement('div');
      qualityControl.className = 'sw-setting-control';
      
      const qualitySelect = document.createElement('select');
      qualitySelect.className = 'sw-select';
      
      const qualities = ['Low', 'Medium', 'High', 'Ultra'];
      qualities.forEach(quality => {
        const option = document.createElement('option');
        option.value = quality.toLowerCase();
        option.innerText = quality;
        if (quality === 'High') option.selected = true;
        qualitySelect.appendChild(option);
      });
      
      qualityControl.appendChild(qualitySelect);
      qualitySetting.appendChild(qualityControl);
      graphicsGroup.appendChild(qualitySetting);
      
      // FPS Limit
      const fpsSetting = document.createElement('div');
      fpsSetting.className = 'sw-setting-item';
      
      const fpsLabel = document.createElement('div');
      fpsLabel.className = 'sw-setting-label';
      fpsLabel.innerText = 'FPS Limit';
      fpsSetting.appendChild(fpsLabel);
      
      const fpsControl = document.createElement('div');
      fpsControl.className = 'sw-setting-control';
      
      const fpsSelect = document.createElement('select');
      fpsSelect.className = 'sw-select';
      
      const fpsOptions = ['30', '60', '120', 'Unlimited'];
      fpsOptions.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option.toLowerCase();
        opt.innerText = option;
        if (option === '60') opt.selected = true;
        fpsSelect.appendChild(opt);
      });
      
      fpsControl.appendChild(fpsSelect);
      fpsSetting.appendChild(fpsControl);
      graphicsGroup.appendChild(fpsSetting);
      
      graphicsSection.appendChild(graphicsGroup);
      settings.appendChild(graphicsSection);
      
      // Gameplay section
      const gameplaySection = document.createElement('div');
      gameplaySection.className = 'sw-settings-section';
      
      const gameplayTitle = document.createElement('div');
      gameplayTitle.className = 'sw-settings-title';
      gameplayTitle.innerText = 'Gameplay';
      gameplaySection.appendChild(gameplayTitle);
      
      const gameplayGroup = document.createElement('div');
      gameplayGroup.className = 'sw-settings-group';
      
      // Control sensitivity
      const sensitivitySetting = document.createElement('div');
      sensitivitySetting.className = 'sw-setting-item';
      
      const sensitivityLabel = document.createElement('div');
      sensitivityLabel.className = 'sw-setting-label';
      sensitivityLabel.innerText = 'Control Sensitivity';
      sensitivitySetting.appendChild(sensitivityLabel);
      
      const sensitivityControl = document.createElement('div');
      sensitivityControl.className = 'sw-setting-control';
      
      const sensitivityValue = document.createElement('span');
      sensitivityValue.innerText = '100%';
      
      const sensitivitySlider = document.createElement('input');
      sensitivitySlider.type = 'range';
      sensitivitySlider.min = '50';
      sensitivitySlider.max = '150';
      sensitivitySlider.value = '100';
      sensitivitySlider.className = 'sw-slider';
      sensitivitySlider.addEventListener('input', () => {
        sensitivityValue.innerText = `${sensitivitySlider.value}%`;
      });
      
      sensitivityControl.appendChild(sensitivitySlider);
      sensitivityControl.appendChild(sensitivityValue);
      sensitivitySetting.appendChild(sensitivityControl);
      gameplayGroup.appendChild(sensitivitySetting);
      
      // Invert Y Axis
      const invertYSetting = document.createElement('div');
      invertYSetting.className = 'sw-setting-item';
      
      const invertYLabel = document.createElement('div');
      invertYLabel.className = 'sw-setting-label';
      invertYLabel.innerText = 'Invert Y Axis';
      invertYSetting.appendChild(invertYLabel);
      
      const invertYControl = document.createElement('div');
      invertYControl.className = 'sw-setting-control';
      
      const invertYCheckbox = document.createElement('input');
      invertYCheckbox.type = 'checkbox';
      invertYCheckbox.className = 'sw-checkbox';
      
      invertYControl.appendChild(invertYCheckbox);
      invertYSetting.appendChild(invertYControl);
      gameplayGroup.appendChild(invertYSetting);
      
      gameplaySection.appendChild(gameplayGroup);
      settings.appendChild(gameplaySection);
      
      // Sound section
      const soundSection = document.createElement('div');
      soundSection.className = 'sw-settings-section';
      
      const soundTitle = document.createElement('div');
      soundTitle.className = 'sw-settings-title';
      soundTitle.innerText = 'Sound';
      soundSection.appendChild(soundTitle);
      
      const soundGroup = document.createElement('div');
      soundGroup.className = 'sw-settings-group';
      
      // Master Volume
      const masterVolumeSetting = document.createElement('div');
      masterVolumeSetting.className = 'sw-setting-item';
      
      const masterVolumeLabel = document.createElement('div');
      masterVolumeLabel.className = 'sw-setting-label';
      masterVolumeLabel.innerText = 'Master Volume';
      masterVolumeSetting.appendChild(masterVolumeLabel);
      
      const masterVolumeControl = document.createElement('div');
      masterVolumeControl.className = 'sw-setting-control';
      
      const masterVolumeValue = document.createElement('span');
      masterVolumeValue.innerText = '100%';
      
      const masterVolumeSlider = document.createElement('input');
      masterVolumeSlider.type = 'range';
      masterVolumeSlider.min = '0';
      masterVolumeSlider.max = '100';
      masterVolumeSlider.value = '100';
      masterVolumeSlider.className = 'sw-slider';
      masterVolumeSlider.addEventListener('input', () => {
        masterVolumeValue.innerText = `${masterVolumeSlider.value}%`;
      });
      
      masterVolumeControl.appendChild(masterVolumeSlider);
      masterVolumeControl.appendChild(masterVolumeValue);
      masterVolumeSetting.appendChild(masterVolumeControl);
      soundGroup.appendChild(masterVolumeSetting);
      
      // Music Volume
      const musicVolumeSetting = document.createElement('div');
      musicVolumeSetting.className = 'sw-setting-item';
      
      const musicVolumeLabel = document.createElement('div');
      musicVolumeLabel.className = 'sw-setting-label';
      musicVolumeLabel.innerText = 'Music Volume';
      musicVolumeSetting.appendChild(musicVolumeLabel);
      
      const musicVolumeControl = document.createElement('div');
      musicVolumeControl.className = 'sw-setting-control';
      
      const musicVolumeValue = document.createElement('span');
      musicVolumeValue.innerText = '80%';
      
      const musicVolumeSlider = document.createElement('input');
      musicVolumeSlider.type = 'range';
      musicVolumeSlider.min = '0';
      musicVolumeSlider.max = '100';
      musicVolumeSlider.value = '80';
      musicVolumeSlider.className = 'sw-slider';
      musicVolumeSlider.addEventListener('input', () => {
        musicVolumeValue.innerText = `${musicVolumeSlider.value}%`;
      });
      
      musicVolumeControl.appendChild(musicVolumeSlider);
      musicVolumeControl.appendChild(musicVolumeValue);
      musicVolumeSetting.appendChild(musicVolumeControl);
      soundGroup.appendChild(musicVolumeSetting);
      
      soundSection.appendChild(soundGroup);
      settings.appendChild(soundSection);
      
      content.appendChild(settings);
      container.appendChild(content);
      
      // Footer
      const footer = document.createElement('div');
      footer.className = 'sw-screen-footer';
      
      const backBtn = document.createElement('button');
      backBtn.className = 'sw-button';
      backBtn.innerText = 'Back';
      backBtn.addEventListener('click', () => this.showScreen('main-menu'));
      
      const saveBtn = document.createElement('button');
      saveBtn.className = 'sw-button secondary';
      saveBtn.innerText = 'Save Settings';
      saveBtn.addEventListener('click', () => this.saveSettings());
      
      footer.appendChild(backBtn);
      footer.appendChild(saveBtn);
      container.appendChild(footer);
      
      screen.appendChild(container);
      this.container.appendChild(screen);
      
      // Store references
      this.screens.settings = {
        element: screen,
        controls: {
          quality: qualitySelect,
          fps: fpsSelect,
          sensitivity: sensitivitySlider,
          invertY: invertYCheckbox,
          masterVolume: masterVolumeSlider,
          musicVolume: musicVolumeSlider
        }
      };
    }
    
    /**
     * Initialize hangar screen
     */
    initHangarScreen() {
      const screen = document.createElement('div');
      screen.className = 'sw-screen';
      screen.id = 'screen-hangar';
      
      // Background
      const bg = document.createElement('div');
      bg.className = 'sw-screen-bg';
      screen.appendChild(bg);
      
      // Container
      const container = document.createElement('div');
      container.className = 'sw-screen-container';
      
      // Header
      const header = document.createElement('div');
      header.className = 'sw-screen-header';
      
      const title = document.createElement('div');
      title.className = 'sw-screen-title';
      title.innerText = 'HANGAR';
      header.appendChild(title);
      
      container.appendChild(header);
      
      // Content
      const content = document.createElement('div');
      content.className = 'sw-screen-content';
      
      const hangar = document.createElement('div');
      hangar.className = 'sw-hangar';
      
      // Aircraft list
      const aircraftList = document.createElement('div');
      aircraftList.className = 'sw-aircraft-list';
      
      // Sample aircraft data (would come from game data)
      const aircraftData = [
        {
          id: 'cessna172',
          name: 'Cessna 172',
          image: 'cessna.jpg',
          stats: {
            speed: 60,
            handling: 70,
            armor: 30
          },
          owned: true,
          selected: true,
          price: 0
        },
        {
          id: 'spitfire',
          name: 'Spitfire',
          image: 'spitfire.jpg',
          stats: {
            speed: 85,
            handling: 75,
            armor: 50
          },
          owned: true,
          selected: false,
          price: 1000
        },
        {
          id: 'fa18',
          name: 'F/A-18 Hornet',
          image: 'fa18.jpg',
          stats: {
            speed: 95,
            handling: 90,
            armor: 80
          },
          owned: false,
          selected: false,
          price: 5000
        }
      ];
      
      // Generate aircraft cards
      aircraftData.forEach(aircraft => {
        const card = document.createElement('div');
        card.className = `sw-aircraft-card ${aircraft.selected ? 'selected' : ''}`;
        card.dataset.id = aircraft.id;
        
        // Use SVG placeholders for images
        const svgBackground = aircraft.id === 'cessna172' ? 
          '#3498db' : aircraft.id === 'spitfire' ? '#e74c3c' : '#f39c12';
          
        const image = document.createElement('div');
        image.className = 'sw-aircraft-image';
        image.innerHTML = `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="50" fill="#1a1a1a" />
          <path fill="${svgBackground}" d="M20 30 L50 10 L80 30 L50 25 Z" />
          <circle cx="50" cy="20" r="3" fill="#fff" />
        </svg>`;
        card.appendChild(image);
        
        const info = document.createElement('div');
        info.className = 'sw-aircraft-info';
        
        const name = document.createElement('div');
        name.className = 'sw-aircraft-name';
        name.innerText = aircraft.name;
        info.appendChild(name);
        
        const stats = document.createElement('div');
        stats.className = 'sw-aircraft-stats';
        
        // Create stat bars
        for (const [key, value] of Object.entries(aircraft.stats)) {
          const stat = document.createElement('div');
          stat.className = 'sw-stat';
          
          const statName = document.createElement('div');
          statName.innerText = key.charAt(0).toUpperCase() + key.slice(1);
          
          const statValue = document.createElement('div');
          statValue.className = 'sw-stat-value';
          statValue.innerText = value;
          
          stat.appendChild(statName);
          stat.appendChild(statValue);
          stats.appendChild(stat);
        }
        
        info.appendChild(stats);
        card.appendChild(info);
        
        const status = document.createElement('div');
        status.className = 'sw-aircraft-status';
        
        const statusText = document.createElement('div');
        statusText.innerText = aircraft.owned ? 'Owned' : 'Locked';
        
        const price = document.createElement('div');
        price.className = 'sw-aircraft-price';
        price.innerText = aircraft.owned ? '' : `${aircraft.price} SKY`;
        
        status.appendChild(statusText);
        status.appendChild(price);
        card.appendChild(status);
        
        // Add click event
        card.addEventListener('click', () => {
          if (aircraft.owned) {
            // Select aircraft
            this.selectAircraft(aircraft.id);
          } else {
            // Show purchase modal
            this.showPurchaseModal(aircraft);
          }
        });
        
        aircraftList.appendChild(card);
      });
      
      hangar.appendChild(aircraftList);
      content.appendChild(hangar);
      container.appendChild(content);
      
      // Footer
      const footer = document.createElement('div');
      footer.className = 'sw-screen-footer';
      
      const backBtn = document.createElement('button');
      backBtn.className = 'sw-button';
      backBtn.innerText = 'Back';
      backBtn.addEventListener('click', () => this.showScreen('main-menu'));
      
      const selectBtn = document.createElement('button');
      selectBtn.className = 'sw-button secondary';
      selectBtn.innerText = 'Select Aircraft';
      selectBtn.addEventListener('click', () => this.confirmAircraftSelection());
      
      footer.appendChild(backBtn);
      footer.appendChild(selectBtn);
      container.appendChild(footer);
      
      screen.appendChild(container);
      this.container.appendChild(screen);
      
      // Store references
      this.screens.hangar = {
        element: screen,
        aircraftList: aircraftList,
        selectButton: selectBtn
      };
    }
    
    /**
     * Initialize store screen
     */
    initStoreScreen() {
      const screen = document.createElement('div');
      screen.className = 'sw-screen';
      screen.id = 'screen-store';
      
      // Background
      const bg = document.createElement('div');
      bg.className = 'sw-screen-bg';
      screen.appendChild(bg);
      
      // Container
      const container = document.createElement('div');
      container.className = 'sw-screen-container';
      
      // Header
      const header = document.createElement('div');
      header.className = 'sw-screen-header';
      
      const title = document.createElement('div');
      title.className = 'sw-screen-title';
      title.innerText = 'STORE';
      header.appendChild(title);
      
      // Token display in store header
      const tokenDisplay = document.createElement('div');
      tokenDisplay.className = 'sw-token-display';
      
      const tokenIcon = document.createElement('span');
      tokenIcon.className = 'sw-token-icon';
      tokenIcon.innerHTML = '⭐';
      tokenDisplay.appendChild(tokenIcon);
      
      const tokenAmount = document.createElement('span');
      tokenAmount.className = 'sw-token-amount';
      tokenAmount.innerText = '0';
      tokenDisplay.appendChild(tokenAmount);
      
      const tokenSymbol = document.createElement('span');
      tokenSymbol.className = 'sw-token-symbol';
      tokenSymbol.innerText = 'SKY';
      tokenDisplay.appendChild(tokenSymbol);
      
      header.appendChild(tokenDisplay);
      container.appendChild(header);
      
      // Content
      const content = document.createElement('div');
      content.className = 'sw-screen-content';
      
      const store = document.createElement('div');
      store.className = 'sw-store';
      
      // Store tabs
      const tabs = document.createElement('div');
      tabs.className = 'sw-store-tabs';
      
      const categories = ['Aircraft', 'Weapons', 'Upgrades', 'Cosmetics'];
      categories.forEach((category, index) => {
        const tab = document.createElement('div');
        tab.className = `sw-store-tab ${index === 0 ? 'active' : ''}`;
        tab.innerText = category;
        tab.dataset.category = category.toLowerCase();
        tab.addEventListener('click', () => this.switchStoreTab(category.toLowerCase()));
        tabs.appendChild(tab);
      });
      
      store.appendChild(tabs);
      
      // Store content
      const storeContent = document.createElement('div');
      storeContent.className = 'sw-store-content';
      
      // Sample store items (would come from game data)
      const storeItems = [
        {
          id: 'missile_1',
          name: 'Sidewinder Missile',
          description: 'Basic heat-seeking missile with moderate damage',
          price: 500,
          category: 'weapons',
          image: 'missile1.jpg'
        },
        {
          id: 'missile_2',
          name: 'AMRAAM Missile',
          description: 'Advanced medium-range missile with high damage',
          price: 1200,
          category: 'weapons',
          image: 'missile2.jpg'
        },
        {
          id: 'engine_1',
          name: 'Turbo Engine',
          description: '15% speed boost for your aircraft',
          price: 800,
          category: 'upgrades',
          image: 'engine.jpg'
        },
        {
          id: 'armor_1',
          name: 'Reinforced Armor',
          description: '20% damage reduction from attacks',
          price: 1000,
          category: 'upgrades',
          image: 'armor.jpg'
        },
        {
          id: 'skin_1',
          name: 'Digital Camo',
          description: 'Modern digital camouflage pattern',
          price: 300,
          category: 'cosmetics',
          image: 'skin1.jpg'
        },
        {
          id: 'skin_2',
          name: 'Gold Plated',
          description: 'Luxurious gold finish for your aircraft',
          price: 2000,
          category: 'cosmetics',
          image: 'skin2.jpg'
        }
      ];
      
      // Function to render store items based on category
      const renderStoreItems = (category) => {
        storeContent.innerHTML = '';
        
        // Filter items by category
        const items = category === 'aircraft' ? 
          [] : storeItems.filter(item => item.category === category);
        
        if (items.length === 0 && category === 'aircraft') {
          // Show aircraft from hangar that aren't owned
          const aircraftData = [
            {
              id: 'fa18',
              name: 'F/A-18 Hornet',
              description: 'Modern fighter jet with superior speed and handling',
              price: 5000,
              category: 'aircraft'
            },
            {
              id: 'f22',
              name: 'F-22 Raptor',
              description: 'Stealth fighter with advanced capabilities',
              price: 10000,
              category: 'aircraft'
            }
          ];
          
          aircraftData.forEach(item => {
            const storeItem = this.createStoreItem(item);
            storeContent.appendChild(storeItem);
          });
        } else if (items.length === 0) {
          // Show empty state
          const emptyState = document.createElement('div');
          emptyState.innerText = 'No items available in this category';
          emptyState.style.padding = '20px';
          emptyState.style.color = 'var(--text-color)';
          storeContent.appendChild(emptyState);
        } else {
          // Show filtered items
          items.forEach(item => {
            const storeItem = this.createStoreItem(item);
            storeContent.appendChild(storeItem);
          });
        }
      };
      
      store.appendChild(storeContent);
      content.appendChild(store);
      container.appendChild(content);
      
      // Footer
      const footer = document.createElement('div');
      footer.className = 'sw-screen-footer';
      
      const backBtn = document.createElement('button');
      backBtn.className = 'sw-button';
      backBtn.innerText = 'Back';
      backBtn.addEventListener('click', () => this.showScreen('main-menu'));
      
      footer.appendChild(backBtn);
      container.appendChild(footer);
      
      screen.appendChild(container);
      this.container.appendChild(screen);
      
      // Store references
      this.screens.store = {
        element: screen,
        tokenAmount: tokenAmount,
        tabs: tabs,
        content: storeContent,
        renderItems: renderStoreItems
      };
      
      // Initialize with the first tab
      renderStoreItems('aircraft');
    }
    
    /**
     * Create a store item element
     */
    createStoreItem(item) {
      const storeItem = document.createElement('div');
      storeItem.className = 'sw-store-item';
      storeItem.dataset.id = item.id;
      
      // Use SVG placeholders for images
      const svgBackground = item.category === 'aircraft' ? 
        '#3498db' : item.category === 'weapons' ? '#e74c3c' : 
        item.category === 'upgrades' ? '#2ecc71' : '#f39c12';
        
      const image = document.createElement('div');
      image.className = 'sw-item-image';
      image.innerHTML = `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="50" fill="#1a1a1a" />
        <rect x="20" y="15" width="60" height="20" fill="${svgBackground}" rx="5" />
        <circle cx="50" cy="25" r="8" fill="#fff" />
      </svg>`;
      storeItem.appendChild(image);
      
      const info = document.createElement('div');
      info.className = 'sw-item-info';
      
      const name = document.createElement('div');
      name.className = 'sw-item-name';
      name.innerText = item.name;
      info.appendChild(name);
      
      const description = document.createElement('div');
      description.className = 'sw-item-description';
      description.innerText = item.description;
      info.appendChild(description);
      
      const priceContainer = document.createElement('div');
      priceContainer.className = 'sw-item-price-container';
      
      const price = document.createElement('div');
      price.className = 'sw-item-price';
      price.innerHTML = `⭐ ${item.price}`;
      priceContainer.appendChild(price);
      
      const buyButton = document.createElement('button');
      buyButton.className = 'sw-item-buy';
      buyButton.innerText = 'Buy';
      buyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.purchaseItem(item);
      });
      priceContainer.appendChild(buyButton);
      
      info.appendChild(priceContainer);
      storeItem.appendChild(info);
      
      return storeItem;
    }
    
    /**
     * Initialize HUD elements
     */
    initHUD() {
      // Create HUD container
      this.hud = document.createElement('div');
      this.hud.className = 'sw-hud';
      this.container.appendChild(this.hud);
      
      // Create various HUD elements
      this.initAltitudeIndicator();
      this.initSpeedIndicator();
      this.initHeadingIndicator();
      this.initAircraftStatus();
      this.initTargetIndicator();
      this.initCenterCrosshair();
      this.initCompass();
      this.initWalletDisplay();
    }
    
    /**
     * Initialize altitude indicator
     */
    initAltitudeIndicator() {
      const altitude = document.createElement('div');
      altitude.className = 'sw-hud-element sw-hud-altitude';
      altitude.innerHTML = 'ALT: <span class="sw-hud-value">0</span> ft';
      this.hud.appendChild(altitude);
      
      // Store reference
      this.hudElements = this.hudElements || {};
      this.hudElements.altitude = altitude.querySelector('.sw-hud-value');
    }
    
    /**
     * Initialize speed indicator
     */
    initSpeedIndicator() {
      const speed = document.createElement('div');
      speed.className = 'sw-hud-element sw-hud-speed';
      speed.innerHTML = 'SPD: <span class="sw-hud-value">0</span> kts';
      this.hud.appendChild(speed);
      
      // Store reference
      this.hudElements = this.hudElements || {};
      this.hudElements.speed = speed.querySelector('.sw-hud-value');
    }
    
    /**
     * Initialize heading indicator
     */
    initHeadingIndicator() {
      const heading = document.createElement('div');
      heading.className = 'sw-hud-element sw-hud-heading';
      heading.innerHTML = 'HDG: <span class="sw-hud-value">000</span>°';
      this.hud.appendChild(heading);
      
      // Store reference
      this.hudElements = this.hudElements || {};
      this.hudElements.heading = heading.querySelector('.sw-hud-value');
    }
    
    /**
     * Initialize aircraft status
     */
    initAircraftStatus() {
      const status = document.createElement('div');
      status.className = 'sw-hud-element sw-hud-status';
      status.innerHTML = 'STATUS: <span class="sw-hud-value">OK</span>';
      this.hud.appendChild(status);
      
      // Store reference
      this.hudElements = this.hudElements || {};
      this.hudElements.status = status.querySelector('.sw-hud-value');
    }
    
    /**
     * Initialize target indicator
     */
    initTargetIndicator() {
      const target = document.createElement('div');
      target.className = 'sw-hud-element sw-hud-target';
      target.innerHTML = 'TARGET: <span class="sw-hud-value">None</span>';
      this.hud.appendChild(target);
      
      // Store reference
      this.hudElements = this.hudElements || {};
      this.hudElements.target = target.querySelector('.sw-hud-value');
    }
    
    /**
     * Initialize center crosshair
     */
    initCenterCrosshair() {
      const center = document.createElement('div');
      center.className = 'sw-hud-center';
      
      const crosshair = document.createElement('div');
      crosshair.className = 'sw-hud-crosshair';
      
      const inner = document.createElement('div');
      inner.className = 'sw-crosshair-inner';
      crosshair.appendChild(inner);
      
      const outer = document.createElement('div');
      outer.className = 'sw-crosshair-outer';
      crosshair.appendChild(outer);
      
      center.appendChild(crosshair);
      this.hud.appendChild(center);
      
      // Store reference
      this.hudElements = this.hudElements || {};
      this.hudElements.crosshair = {
        inner: inner,
        outer: outer
      };
    }
    
    /**
     * Initialize compass
     */
    initCompass() {
      const compassContainer = document.createElement('div');
      compassContainer.className = 'sw-hud-compass-container';
      
      const compass = document.createElement('div');
      compass.className = 'sw-hud-compass';
      
      // Create compass ticks and labels
      for (let i = 0; i < 360; i += 5) {
        const isMajor = i % 30 === 0;
        const hasLabel = i % 90 === 0;
        
        const tick = document.createElement('div');
        tick.className = `sw-compass-tick ${isMajor ? 'major' : ''}`;
        tick.style.left = `${i * 2.5}px`; // 2.5px per degree
        compass.appendChild(tick);
        
        if (hasLabel) {
          const label = document.createElement('div');
          label.className = 'sw-compass-label';
          label.style.left = `${i * 2.5}px`;
          
          let labelText = '';
          switch (i) {
            case 0: labelText = 'N'; break;
            case 90: labelText = 'E'; break;
            case 180: labelText = 'S'; break;
            case 270: labelText = 'W'; break;
          }
          
          label.innerText = labelText;
          compass.appendChild(label);
        }
      }
      
      // Center marker
      const marker = document.createElement('div');
      marker.className = 'sw-compass-marker';
      
      compassContainer.appendChild(compass);
      compassContainer.appendChild(marker);
      this.hud.appendChild(compassContainer);
      
      // Store reference
      this.hudElements = this.hudElements || {};
      this.hudElements.compass = compass;
    }
    
    /**
     * Initialize wallet display
     */
    initWalletDisplay() {
      const wallet = document.createElement('div');
      wallet.className = 'sw-wallet-display';
      wallet.style.display = this.state.walletConnected ? 'flex' : 'none';
      
      const icon = document.createElement('div');
      icon.className = 'sw-wallet-icon';
      icon.innerHTML = '⭐';
      wallet.appendChild(icon);
      
      const amount = document.createElement('div');
      amount.className = 'sw-token-amount';
      amount.innerText = this.state.tokenBalance;
      wallet.appendChild(amount);
      
      const symbol = document.createElement('div');
      symbol.className = 'sw-token-symbol';
      symbol.innerText = 'SKY';
      wallet.appendChild(symbol);
      
      const address = document.createElement('div');
      address.className = 'sw-wallet-address';
      address.innerText = this.state.walletAddress || '0x0000...0000';
      wallet.appendChild(address);
      
      // Click handler to open wallet details
      wallet.addEventListener('click', () => this.showWalletDetails());
      
      this.hud.appendChild(wallet);
      
      // Store reference
      this.hudElements = this.hudElements || {};
      this.hudElements.wallet = {
        container: wallet,
        amount: amount,
        address: address
      };
    }
    
    /**
     * Initialize chat system
     */
    initChat() {
      const chat = document.createElement('div');
      chat.className = 'sw-chat';
      
      // Chat header
      const header = document.createElement('div');
      header.className = 'sw-chat-header';
      
      const title = document.createElement('div');
      title.className = 'sw-chat-title';
      title.innerText = 'Game Chat';
      header.appendChild(title);
      
      const toggle = document.createElement('button');
      toggle.className = 'sw-chat-toggle';
      toggle.innerHTML = '▲';
      toggle.addEventListener('click', () => this.toggleChat());
      header.appendChild(toggle);
      
      chat.appendChild(header);
      
      // Chat messages
      const messages = document.createElement('div');
      messages.className = 'sw-chat-messages';
      chat.appendChild(messages);
      
      // Chat input
      const inputContainer = document.createElement('div');
      inputContainer.className = 'sw-chat-input-container';
      
      const input = document.createElement('input');
      input.className = 'sw-chat-input';
      input.type = 'text';
      input.placeholder = 'Type a message...';
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendChatMessage(input.value);
          input.value = '';
        }
      });
      inputContainer.appendChild(input);
      
      const sendButton = document.createElement('button');
      sendButton.className = 'sw-chat-send';
      sendButton.innerText = 'Send';
      sendButton.addEventListener('click', () => {
        this.sendChatMessage(input.value);
        input.value = '';
      });
      inputContainer.appendChild(sendButton);
      
      chat.appendChild(inputContainer);
      
      this.container.appendChild(chat);
      
      // Store references
      this.chat = {
        element: chat,
        messages: messages,
        input: input,
        toggle: toggle
      };
      
      // Add welcome message
      this.addChatMessage('System', 'Welcome to SkyWars! Connect your wallet to earn tokens.', 'system');
    }
    
    /**
     * Initialize notifications system
     */
    initNotifications() {
      const notifications = document.createElement('div');
      notifications.className = 'sw-notifications';
      this.container.appendChild(notifications);
      
      // Store reference
      this.notifications = {
        container: notifications,
        items: []
      };
    }
    
    /**
     * Update loading screen progress
     */
    updateLoadingScreen(progress, message) {
      if (!this.screens.loading) return;
      
      // Update progress if provided
      if (progress !== undefined) {
        this.loadingProgress = progress;
        this.screens.loading.progressBar.style.width = `${progress}%`;
      }
      
      // Update message if provided
      if (message !== undefined) {
        this.screens.loading.progressText.innerText = message;
      }
      
      // Auto-transition to main menu if loading is complete
      if (this.loadingProgress >= 100) {
        setTimeout(() => {
          this.showScreen('main-menu');
        }, 500);
      }
    }
    
    /**
     * Show a specific UI screen
     */
    showScreen(screenId) {
      // Hide all screens
      Object.values(this.screens).forEach(screen => {
        if (screen.element) {
          screen.element.classList.remove('active');
        }
      });
      
      // Show requested screen
      const screen = this.screens[screenId] || this.screens[screenId.replace('-', '')];
      if (screen && screen.element) {
        screen.element.classList.add('active');
        this.state.activeScreen = screenId;
        
        // Additional screen-specific initialization
        if (screenId === 'store') {
          // Update token display
          this.screens.store.tokenAmount.innerText = this.state.tokenBalance;
          
          // Re-render store items for active tab
          const activeTab = this.screens.store.tabs.querySelector('.active');
          if (activeTab) {
            this.screens.store.renderItems(activeTab.dataset.category);
          }
        }
      }
    }
    
    /**
     * Switch store tab
     */
    switchStoreTab(category) {
      // Update active tab
      const tabs = this.screens.store.tabs.querySelectorAll('.sw-store-tab');
      tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === category);
      });
      
      // Render items for this category
      this.screens.store.renderItems(category);
    }
    
    /**
     * Start the game
     */
    startGame() {
      // Show HUD
      this.showHUD();
      
      // Hide other screens
      this.showScreen('game');
      
      // Send game start event
      if (this.game) {
        this.game.startGame();
      }
      
      // Show welcome notification
      this.showNotification('Game Started', 'Welcome to SkyWars! Defeat enemies to earn tokens.', 'info');
      
      // Add system chat message
      this.addChatMessage('System', 'Game started! Good luck!', 'system');
    }
    
    /**
     * Show HUD elements
     */
    showHUD() {
      this.hud.classList.add('active');
      this.state.hudVisible = true;
    }
    
    /**
     * Hide HUD elements
     */
    hideHUD() {
      this.hud.classList.remove('active');
      this.state.hudVisible = false;
    }
    
    /**
     * Toggle chat visibility
     */
    toggleChat() {
      const isActive = this.chat.element.classList.toggle('active');
      this.state.chatVisible = isActive;
      
      // Update toggle button
      this.chat.toggle.innerHTML = isActive ? '▼' : '▲';
    }
    
    /**
     * Add a message to the chat
     */
    addChatMessage(sender, content, type = 'player') {
      const message = document.createElement('div');
      message.className = 'sw-chat-message';
      
      const senderElement = document.createElement('div');
      senderElement.className = `sw-chat-sender ${type}`;
      senderElement.innerText = sender;
      message.appendChild(senderElement);
      
      const contentElement = document.createElement('div');
      contentElement.className = 'sw-chat-content';
      contentElement.innerText = content;
      message.appendChild(contentElement);
      
      this.chat.messages.appendChild(message);
      
      // Scroll to bottom
      this.chat.messages.scrollTop = this.chat.messages.scrollHeight;
      
      // Show chat if it's a new message and chat is hidden
      if (!this.state.chatVisible) {
        this.toggleChat();
        
        // Auto-hide after a few seconds
        setTimeout(() => {
          if (this.state.chatVisible) {
            this.toggleChat();
          }
        }, 5000);
      }
    }
    
    /**
     * Send a chat message
     */
    sendChatMessage(content) {
      if (!content || content.trim() === '') return;
      
      // Add to local chat
      this.addChatMessage('You', content);
      
      // Send to game/server
      if (this.game) {
        this.game.sendChatMessage(content);
      }
    }
    
    /**
     * Show a notification
     */
    showNotification(title, message, type = 'info', duration = 5000) {
      const notification = document.createElement('div');
      notification.className = 'sw-notification';
      
      // Icon based on type
      const icon = document.createElement('div');
      icon.className = `sw-notification-icon ${type}`;
      
      // Different icons based on type
      switch (type) {
        case 'info': icon.innerHTML = 'ℹ️'; break;
        case 'success': icon.innerHTML = '✅'; break;
        case 'warning': icon.innerHTML = '⚠️'; break;
        case 'error': icon.innerHTML = '❌'; break;
      }
      
      notification.appendChild(icon);
      
      const content = document.createElement('div');
      content.className = 'sw-notification-content';
      
      const titleElement = document.createElement('div');
      titleElement.className = 'sw-notification-title';
      titleElement.innerText = title;
      content.appendChild(titleElement);
      
      const messageElement = document.createElement('div');
      messageElement.className = 'sw-notification-message';
      messageElement.innerText = message;
      content.appendChild(messageElement);
      
      notification.appendChild(content);
      
      // Add to notifications container
      this.notifications.container.appendChild(notification);
      
      // Track notification
      const notificationInfo = { element: notification, timer: null };
      this.notifications.items.push(notificationInfo);
      
      // Auto-remove after duration
      notificationInfo.timer = setTimeout(() => {
        this.removeNotification(notificationInfo);
      }, duration);
      
      return notificationInfo;
    }
    
    /**
     * Remove a notification
     */
    removeNotification(notification) {
      // Add removing class for animation
      notification.element.classList.add('removing');
      
      // Remove from DOM after animation
      setTimeout(() => {
        if (notification.element.parentNode) {
          notification.element.parentNode.removeChild(notification.element);
        }
        
        // Remove from tracked notifications
        const index = this.notifications.items.indexOf(notification);
        if (index >= 0) {
          this.notifications.items.splice(index, 1);
        }
      }, 300);
      
      // Clear timer if exists
      if (notification.timer) {
        clearTimeout(notification.timer);
      }
    }
    
    /**
     * Show a modal dialog
     */
    showModal(title, content, buttons = [], closable = true) {
      // Create modal backdrop
      const backdrop = document.createElement('div');
      backdrop.className = 'sw-modal-backdrop';
      this.modalContainer.appendChild(backdrop);
      
      // Create modal
      const modal = document.createElement('div');
      modal.className = 'sw-modal';
      
      // Modal header
      const header = document.createElement('div');
      header.className = 'sw-modal-header';
      
      const titleElement = document.createElement('div');
      titleElement.className = 'sw-modal-title';
      titleElement.innerText = title;
      header.appendChild(titleElement);
      
      if (closable) {
        const closeButton = document.createElement('button');
        closeButton.className = 'sw-modal-close';
        closeButton.innerHTML = '×';
        closeButton.addEventListener('click', () => this.closeModal(modal));
        header.appendChild(closeButton);
      }
      
      modal.appendChild(header);
      
      // Modal content
      const contentContainer = document.createElement('div');
      contentContainer.className = 'sw-modal-content';
      
      // Content can be string or DOM element
      if (typeof content === 'string') {
        contentContainer.innerHTML = content;
      } else {
        contentContainer.appendChild(content);
      }
      
      modal.appendChild(contentContainer);
      
      // Modal footer with buttons
      if (buttons.length > 0) {
        const footer = document.createElement('div');
        footer.className = 'sw-modal-footer';
        
        buttons.forEach(button => {
          const btn = document.createElement('button');
          btn.className = `sw-button ${button.type || ''}`;
          btn.innerText = button.text;
          btn.addEventListener('click', () => {
            if (button.callback) button.callback();
            if (button.closeOnClick !== false) this.closeModal(modal);
          });
          footer.appendChild(btn);
        });
        
        modal.appendChild(footer);
      }
      
      this.modalContainer.appendChild(modal);
      
      // Add to modal stack
      this.state.modalStack.push({
        backdrop: backdrop,
        modal: modal
      });
      
      // Animate in
      setTimeout(() => {
        backdrop.classList.add('active');
        modal.classList.add('active');
      }, 10);
      
      return modal;
    }
    
    /**
     * Close a modal dialog
     */
    closeModal(modal) {
      // Find the modal in the stack
      const index = this.state.modalStack.findIndex(m => m.modal === modal);
      if (index >= 0) {
        const { backdrop, modal } = this.state.modalStack[index];
        
        // Animate out
        backdrop.classList.remove('active');
        modal.classList.remove('active');
        
        // Remove from DOM after animation
        setTimeout(() => {
          if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
          if (modal.parentNode) modal.parentNode.removeChild(modal);
          
          // Remove from stack
          this.state.modalStack.splice(index, 1);
        }, 300);
      }
    }
    
    /**
     * Close all open modals
     */
    closeAllModals() {
      // Close modals in reverse order
      [...this.state.modalStack].reverse().forEach(({ modal }) => {
        this.closeModal(modal);
      });
    }
    
    /**
     * Show wallet connection modal
     */
    showWalletModal() {
      const content = document.createElement('div');
      content.className = 'sw-wallet-container';
      
      const info = document.createElement('div');
      info.innerText = 'Connect your wallet to buy aircraft, weapons, and earn tokens for completing missions.';
      content.appendChild(info);
      
      const options = document.createElement('div');
      options.className = 'sw-wallet-options';
      
      // MetaMask option
      const metamask = document.createElement('div');
      metamask.className = 'sw-wallet-option';
      
      const metamaskLogo = document.createElement('div');
      metamaskLogo.className = 'sw-wallet-logo';
      metamaskLogo.innerHTML = `<svg viewBox="0 0 35 33" xmlns="http://www.w3.org/2000/svg">
        <path d="M32.9582 1L19.8241 10.7183L22.2541 5.0167L32.9582 1Z" fill="#E17726"/>
        <path d="M2.04187 1L15.0698 10.809L12.7454 5.0167L2.04187 1Z" fill="#E27625"/>
      </svg>`;
      metamask.appendChild(metamaskLogo);
      
      const metamaskName = document.createElement('div');
      metamaskName.className = 'sw-wallet-name';
      metamaskName.innerText = 'MetaMask';
      metamask.appendChild(metamaskName);
      
      metamask.addEventListener('click', () => this.connectWallet('metamask'));
      options.appendChild(metamask);
      
      // WalletConnect option
      const walletconnect = document.createElement('div');
      walletconnect.className = 'sw-wallet-option';
      
      const walletconnectLogo = document.createElement('div');
      walletconnectLogo.className = 'sw-wallet-logo';
      walletconnectLogo.innerHTML = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <path fill="#3B99FC" d="M16 0C7.163 0 0 7.163 0 16c0 8.837 7.163 16 16 16s16-7.163 16-16C32 7.163 24.837 0 16 0z" />
        <path fill="#FFFFFF" d="M16.5 6.5c-5.523 0-10 4.477-10 10 0 5.523 4.477 10 10 10s10-4.477 10-10c0-5.523-4.477-10-10-10zm0 18 />
        <path fill="#FFFFFF" d="M16.5 6.5c-5.523 0-10 4.477-10 10 0 5.523 4.477 10 10 10s10-4.477 10-10c0-5.523-4.477-10-10-10zm0 18 />
    /* Continuing the SkyWars UI implementation */

  /**
   * Show wallet connection modal
   */
  showWalletModal() {
    const content = document.createElement('div');
    content.className = 'sw-wallet-container';
    
    const info = document.createElement('div');
    info.innerText = 'Connect your wallet to buy aircraft, weapons, and earn tokens for completing missions.';
    content.appendChild(info);
    
    const options = document.createElement('div');
    options.className = 'sw-wallet-options';
    
    // MetaMask option
    const metamask = document.createElement('div');
    metamask.className = 'sw-wallet-option';
    
    const metamaskLogo = document.createElement('div');
    metamaskLogo.className = 'sw-wallet-logo';
    metamaskLogo.innerHTML = `<svg viewBox="0 0 35 33" xmlns="http://www.w3.org/2000/svg">
      <path d="M32.9582 1L19.8241 10.7183L22.2541 5.0167L32.9582 1Z" fill="#E17726"/>
      <path d="M2.04187 1L15.0698 10.809L12.7454 5.0167L2.04187 1Z" fill="#E27625"/>
    </svg>`;
    metamask.appendChild(metamaskLogo);
    
    const metamaskName = document.createElement('div');
    metamaskName.className = 'sw-wallet-name';
    metamaskName.innerText = 'MetaMask';
    metamask.appendChild(metamaskName);
    
    metamask.addEventListener('click', () => this.connectWallet('metamask'));
    options.appendChild(metamask);
    
    // WalletConnect option
    const walletconnect = document.createElement('div');
    walletconnect.className = 'sw-wallet-option';
    
    const walletconnectLogo = document.createElement('div');
    walletconnectLogo.className = 'sw-wallet-logo';
    walletconnectLogo.innerHTML = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <path fill="#3B99FC" d="M16 0C7.163 0 0 7.163 0 16c0 8.837 7.163 16 16 16s16-7.163 16-16C32 7.163 24.837 0 16 0z" />
      <path fill="#FFFFFF" d="M7.94 16.33c4.45-4.45 11.67-4.45 16.12 0l.53.53c.22.22.22.58 0 .8L23.1 19.17c-.11.11-.29.11-.4 0l-.74-.74c-3.12-3.12-8.17-3.12-11.29 0l-.79.79c-.11.11-.29.11-.4 0l-1.49-1.5c-.22-.22-.22-.58 0-.8l.95-.59zm17.97 1.85l1.35 1.35c.22.22.22.58 0 .8l-6.1 6.1c-.22.22-.58.22-.8 0l-4.32-4.32c-.05-.06-.14-.06-.2 0l-4.32 4.33c-.22.22-.58.22-.8 0l-6.1-6.1c-.22-.22-.22-.58 0-.8l1.35-1.35c.22-.22.58-.22.8 0l4.32 4.32c.05.06.14.06.2 0l4.32-4.32c.22-.22.58-.22.8 0l4.32 4.32c.05.06.14.06.2 0l4.32-4.32c.22-.22.58-.22.8 0z"/>
    </svg>`;
    walletconnect.appendChild(walletconnectLogo);
    
    const walletconnectName = document.createElement('div');
    walletconnectName.className = 'sw-wallet-name';
    walletconnectName.innerText = 'WalletConnect';
    walletconnect.appendChild(walletconnectName);
    
    walletconnect.addEventListener('click', () => this.connectWallet('walletconnect'));
    options.appendChild(walletconnect);
    
    // Coinbase Wallet option
    const coinbase = document.createElement('div');
    coinbase.className = 'sw-wallet-option';
    
    const coinbaseLogo = document.createElement('div');
    coinbaseLogo.className = 'sw-wallet-logo';
    coinbaseLogo.innerHTML = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <path fill="#0052FF" d="M16 0C7.163 0 0 7.163 0 16s7.163 16 16 16s16-7.163 16-16S24.837 0 16 0z"/>
      <path fill="#FFFFFF" d="M16 6.5A9.5 9.5 0 1 0 25.5 16A9.51 9.51 0 0 0 16 6.5zm0 14.25A4.75 4.75 0 1 1 20.75 16A4.76 4.76 0 0 1 16 20.75z"/>
    </svg>`;
    coinbase.appendChild(coinbaseLogo);
    
    const coinbaseName = document.createElement('div');
    coinbaseName.className = 'sw-wallet-name';
    coinbaseName.innerText = 'Coinbase Wallet';
    coinbase.appendChild(coinbaseName);
    
    coinbase.addEventListener('click', () => this.connectWallet('coinbase'));
    options.appendChild(coinbase);
    
    content.appendChild(options);
    
    // Connection status
    const status = document.createElement('div');
    status.className = 'sw-wallet-status';
    status.innerText = 'Click on a wallet to connect';
    content.appendChild(status);
    
    // Show modal
    const modal = this.showModal('Connect Wallet', content, [
      {
        text: 'Cancel',
        type: 'danger'
      }
    ]);
    
    // Store status reference for updates
    modal.statusElement = status;
    
    return modal;
  }
  
  /**
   * Connect to a wallet
   */
  connectWallet(type) {
    // Find active modal
    const modal = this.state.modalStack[this.state.modalStack.length - 1]?.modal;
    if (!modal || !modal.statusElement) return;
    
    // Update status
    modal.statusElement.innerText = `Connecting to ${type}...`;
    
    // Simulate connection process
    setTimeout(() => {
      // In a real implementation, you would use the Web3 API to connect
      // For this demo, we'll simulate a successful connection
      
      if (this.debug) {
        // In debug mode, always succeed
        this.walletConnected({
          address: '0x1234...5678',
          type: type,
          balance: 5000
        });
        this.closeModal(modal);
      } else {
        // In production, we'd use the actual Web3 connection
        if (type === 'metamask') {
          if (window.ethereum) {
            window.ethereum.request({ method: 'eth_requestAccounts' })
              .then(accounts => {
                if (accounts.length > 0) {
                  // Successfully connected
                  const address = accounts[0];
                  this.getTokenBalance(address).then(balance => {
                    this.walletConnected({
                      address: address,
                      type: type,
                      balance: balance
                    });
                    this.closeModal(modal);
                  });
                } else {
                  modal.statusElement.innerText = 'No accounts found. Please unlock your wallet.';
                }
              })
              .catch(error => {
                modal.statusElement.innerText = `Error: ${error.message || 'Could not connect to wallet'}`;
              });
          } else {
            modal.statusElement.innerText = 'MetaMask not detected. Please install the MetaMask extension.';
          }
        } else {
          // For other wallet types, we'd use their respective SDKs
          // For the demo, just simulate success
          this.walletConnected({
            address: '0x1234...5678',
            type: type,
            balance: 1000
          });
          this.closeModal(modal);
        }
      }
    }, 1500);
  }
  
  /**
   * Handle successful wallet connection
   */
  walletConnected(walletInfo) {
    // Update state
    this.state.walletConnected = true;
    this.state.walletAddress = walletInfo.address;
    this.state.tokenBalance = walletInfo.balance;
    
    // Update UI
    if (this.hudElements.wallet) {
      this.hudElements.wallet.container.style.display = 'flex';
      this.hudElements.wallet.amount.innerText = this.state.tokenBalance;
      this.hudElements.wallet.address.innerText = this.state.walletAddress;
    }
    
    // Hide connect wallet button in main menu
    if (this.screens.mainMenu && this.screens.mainMenu.walletButton) {
      this.screens.mainMenu.walletButton.style.display = 'none';
    }
    
    // Show notification
    this.showNotification('Wallet Connected', `Successfully connected to ${walletInfo.type}`, 'success');
    
    // Add system chat message
    this.addChatMessage('System', 'Wallet connected! You can now earn and spend tokens.', 'system');
  }
  
  /**
   * Get token balance for an address
   */
  async getTokenBalance(address) {
    // In a real implementation, you would query the blockchain
    // For this demo, return a mock balance
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(1000);
      }, 500);
    });
  }
  
  /**
   * Show wallet details modal
   */
  showWalletDetails() {
    if (!this.state.walletConnected) {
      this.showWalletModal();
      return;
    }
    
    const content = document.createElement('div');
    content.className = 'sw-wallet-container';
    
    // Wallet info
    const info = document.createElement('div');
    info.style.marginBottom = '20px';
    
    const addressRow = document.createElement('div');
    addressRow.style.marginBottom = '10px';
    addressRow.innerHTML = `<strong>Address:</strong> ${this.state.walletAddress}`;
    info.appendChild(addressRow);
    
    const balanceRow = document.createElement('div');
    balanceRow.innerHTML = `<strong>Balance:</strong> ${this.state.tokenBalance} SKY`;
    info.appendChild(balanceRow);
    
    content.appendChild(info);
    
    // Recent transactions
    const transactionsTitle = document.createElement('div');
    transactionsTitle.className = 'sw-settings-title';
    transactionsTitle.innerText = 'Recent Transactions';
    content.appendChild(transactionsTitle);
    
    const transactions = document.createElement('div');
    transactions.style.marginBottom = '20px';
    
    // Mock transaction data
    const txData = [
      { type: 'Reward', amount: 100, desc: 'Mission Completed', time: '10 min ago' },
      { type: 'Purchase', amount: -500, desc: 'Sidewinder Missile', time: '1 hour ago' },
      { type: 'Reward', amount: 250, desc: 'Enemy Destroyed', time: '2 hours ago' }
    ];
    
    if (txData.length === 0) {
      transactions.innerText = 'No recent transactions';
    } else {
      // Create transaction list
      txData.forEach(tx => {
        const txRow = document.createElement('div');
        txRow.style.display = 'flex';
        txRow.style.justifyContent = 'space-between';
        txRow.style.padding = '8px 0';
        txRow.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
        
        const txLeft = document.createElement('div');
        
        const txType = document.createElement('div');
        txType.style.fontWeight = 'bold';
        txType.innerText = tx.type;
        txLeft.appendChild(txType);
        
        const txDesc = document.createElement('div');
        txDesc.style.fontSize = '12px';
        txDesc.style.color = 'rgba(255,255,255,0.7)';
        txDesc.innerText = tx.desc;
        txLeft.appendChild(txDesc);
        
        const txRight = document.createElement('div');
        txRight.style.textAlign = 'right';
        
        const txAmount = document.createElement('div');
        txAmount.style.fontWeight = 'bold';
        txAmount.style.color = tx.amount > 0 ? 'var(--secondary-color)' : 'var(--danger-color)';
        txAmount.innerText = `${tx.amount > 0 ? '+' : ''}${tx.amount} SKY`;
        txRight.appendChild(txAmount);
        
        const txTime = document.createElement('div');
        txTime.style.fontSize = '12px';
        txTime.style.color = 'rgba(255,255,255,0.7)';
        txTime.innerText = tx.time;
        txRight.appendChild(txTime);
        
        txRow.appendChild(txLeft);
        txRow.appendChild(txRight);
        transactions.appendChild(txRow);
      });
    }
    
    content.appendChild(transactions);
    
    // Action buttons
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '10px';
    
    const disconnectBtn = document.createElement('button');
    disconnectBtn.className = 'sw-button danger';
    disconnectBtn.innerText = 'Disconnect Wallet';
    disconnectBtn.addEventListener('click', () => {
      this.disconnectWallet();
      this.closeAllModals();
    });
    actions.appendChild(disconnectBtn);
    
    const buyTokensBtn = document.createElement('button');
    buyTokensBtn.className = 'sw-button accent';
    buyTokensBtn.innerText = 'Buy Tokens';
    buyTokensBtn.addEventListener('click', () => {
      this.closeAllModals();
      this.showBuyTokensModal();
    });
    actions.appendChild(buyTokensBtn);
    
    content.appendChild(actions);
    
    this.showModal('Wallet Details', content, [
      {
        text: 'Close',
        type: ''
      }
    ]);
  }
  
  /**
   * Disconnect wallet
   */
  disconnectWallet() {
    this.state.walletConnected = false;
    this.state.walletAddress = '';
    this.state.tokenBalance = 0;
    
    // Update UI
    if (this.hudElements.wallet) {
      this.hudElements.wallet.container.style.display = 'none';
    }
    
    // Show connect wallet button in main menu
    if (this.screens.mainMenu && this.screens.mainMenu.walletButton) {
      this.screens.mainMenu.walletButton.style.display = 'block';
    }
    
    // Show notification
    this.showNotification('Wallet Disconnected', 'Your wallet has been disconnected', 'info');
  }
  
  /**
   * Show buy tokens modal
   */
  showBuyTokensModal() {
    const content = document.createElement('div');
    
    const info = document.createElement('div');
    info.style.marginBottom = '20px';
    info.innerText = 'Purchase SKY tokens to buy aircraft, weapons, and upgrades.';
    content.appendChild(info);
    
    // Token packages
    const packages = document.createElement('div');
    packages.style.display = 'flex';
    packages.style.flexDirection = 'column';
    packages.style.gap = '10px';
    packages.style.marginBottom = '20px';
    
    const tokenPackages = [
      { amount: 1000, price: '$9.99', bonus: '' },
      { amount: 5000, price: '$39.99', bonus: '+ 500 bonus tokens' },
      { amount: 10000, price: '$79.99', bonus: '+ 2000 bonus tokens' }
    ];
    
    tokenPackages.forEach(pkg => {
      const packageRow = document.createElement('div');
      packageRow.className = 'sw-wallet-option';
      packageRow.style.justifyContent = 'space-between';
      
      const packageLeft = document.createElement('div');
      
      const packageAmount = document.createElement('div');
      packageAmount.className = 'sw-wallet-name';
      packageAmount.innerText = `${pkg.amount} SKY`;
      packageLeft.appendChild(packageAmount);
      
      if (pkg.bonus) {
        const packageBonus = document.createElement('div');
        packageBonus.style.fontSize = '12px';
        packageBonus.style.color = 'var(--secondary-color)';
        packageBonus.innerText = pkg.bonus;
        packageLeft.appendChild(packageBonus);
      }
      
      const packagePrice = document.createElement('button');
      packagePrice.className = 'sw-button accent small';
      packagePrice.innerText = pkg.price;
      packagePrice.addEventListener('click', () => {
        // In a real implementation, this would open a payment flow
        this.simulatePurchase(pkg.amount);
      });
      
      packageRow.appendChild(packageLeft);
      packageRow.appendChild(packagePrice);
      packages.appendChild(packageRow);
    });
    
    content.appendChild(packages);
    
    // Custom amount
    const customAmount = document.createElement('div');
    customAmount.style.marginTop = '20px';
    
    const customTitle = document.createElement('div');
    customTitle.style.marginBottom = '10px';
    customTitle.innerText = 'Custom amount:';
    customAmount.appendChild(customTitle);
    
    const customForm = document.createElement('div');
    customForm.style.display = 'flex';
    customForm.style.gap = '10px';
    
    const customInput = document.createElement('input');
    customInput.className = 'sw-chat-input';
    customInput.type = 'number';
    customInput.min = '100';
    customInput.step = '100';
    customInput.value = '500';
    customInput.style.minWidth = '100px';
    customForm.appendChild(customInput);
    
    const customButton = document.createElement('button');
    customButton.className = 'sw-button accent';
    customButton.innerText = 'Buy';
    customButton.addEventListener('click', () => {
      const amount = parseInt(customInput.value, 10);
      if (amount && amount >= 100) {
        this.simulatePurchase(amount);
      }
    });
    customForm.appendChild(customButton);
    
    customAmount.appendChild(customForm);
    content.appendChild(customAmount);
    
    this.showModal('Buy Tokens', content, [
      {
        text: 'Close',
        type: ''
      }
    ]);
  }
  
  /**
   * Simulate token purchase (for demo)
   */
  simulatePurchase(amount) {
    // Show loading notification
    const notification = this.showNotification('Processing Purchase', 'Please wait...', 'info', 10000);
    
    // Simulate processing delay
    setTimeout(() => {
      // Update token balance
      this.state.tokenBalance += amount;
      
      // Update UI
      if (this.hudElements.wallet) {
        this.hudElements.wallet.amount.innerText = this.state.tokenBalance;
      }
      
      // Update store token display if visible
      if (this.state.activeScreen === 'store' && this.screens.store) {
        this.screens.store.tokenAmount.innerText = this.state.tokenBalance;
      }
      
      // Remove loading notification
      this.removeNotification(notification);
      
      // Show success notification
      this.showNotification('Purchase Complete', `Added ${amount} SKY tokens to your wallet`, 'success');
      
      // Close modals
      this.closeAllModals();
    }, 2000);
  }
  
  /**
   * Show purchase modal for an aircraft
   */
  showPurchaseModal(aircraft) {
    const content = document.createElement('div');
    
    const info = document.createElement('div');
    info.style.textAlign = 'center';
    info.style.marginBottom = '20px';
    
    const aircraftName = document.createElement('div');
    aircraftName.style.fontSize = '20px';
    aircraftName.style.fontWeight = 'bold';
    aircraftName.style.marginBottom = '10px';
    aircraftName.innerText = aircraft.name;
    info.appendChild(aircraftName);
    
    // Aircraft image (SVG placeholder)
    const svgBackground = aircraft.id === 'cessna172' ? 
      '#3498db' : aircraft.id === 'spitfire' ? '#e74c3c' : '#f39c12';
      
    const image = document.createElement('div');
    image.style.width = '200px';
    image.style.height = '100px';
    image.style.margin = '0 auto 20px';
    image.innerHTML = `<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="50" fill="#1a1a1a" />
      <path fill="${svgBackground}" d="M20 30 L50 10 L80 30 L50 25 Z" />
      <circle cx="50" cy="20" r="3" fill="#fff" />
    </svg>`;
    info.appendChild(image);
    
    // Price
    const price = document.createElement('div');
    price.style.fontSize = '24px';
    price.style.fontWeight = 'bold';
    price.style.color = 'var(--accent-color)';
    price.innerText = `${aircraft.price} SKY`;
    info.appendChild(price);
    
    content.appendChild(info);
    
    // Balance check
    let canAfford = this.state.tokenBalance >= aircraft.price;
    
    if (!this.state.walletConnected) {
      const connectWarning = document.createElement('div');
      connectWarning.style.padding = '10px';
      connectWarning.style.backgroundColor = 'rgba(0,0,0,0.2)';
      connectWarning.style.borderRadius = 'var(--border-radius)';
      connectWarning.style.color = 'var(--accent-color)';
      connectWarning.style.marginBottom = '20px';
      connectWarning.innerText = 'You need to connect a wallet to purchase aircraft.';
      content.appendChild(connectWarning);
      
      canAfford = false;
    } else if (!canAfford) {
      const balanceWarning = document.createElement('div');
      balanceWarning.style.padding = '10px';
      balanceWarning.style.backgroundColor = 'rgba(0,0,0,0.2)';
      balanceWarning.style.borderRadius = 'var(--border-radius)';
      balanceWarning.style.color = 'var(--danger-color)';
      balanceWarning.style.marginBottom = '20px';
      balanceWarning.innerText = `Insufficient balance. You need ${aircraft.price - this.state.tokenBalance} more SKY.`;
      content.appendChild(balanceWarning);
    }
    
    // Stats display
    if (aircraft.stats) {
      const statsTitle = document.createElement('div');
      statsTitle.className = 'sw-settings-title';
      statsTitle.innerText = 'Aircraft Stats';
      content.appendChild(statsTitle);
      
      const stats = document.createElement('div');
      stats.className = 'sw-aircraft-stats';
      stats.style.marginBottom = '20px';
      
      // Create stat bars
      for (const [key, value] of Object.entries(aircraft.stats)) {
        const stat = document.createElement('div');
        stat.className = 'sw-stat';
        
        const statName = document.createElement('div');
        statName.innerText = key.charAt(0).toUpperCase() + key.slice(1);
        
        const statValue = document.createElement('div');
        statValue.className = 'sw-stat-value';
        statValue.innerText = value;
        
        stat.appendChild(statName);
        stat.appendChild(statValue);
        stats.appendChild(stat);
      }
      
      content.appendChild(stats);
    }
    
    // Buttons
    const buttons = [
      {
        text: 'Cancel',
        type: '',
        callback: () => {}
      }
    ];
    
    // Only show purchase button if can afford
    if (canAfford) {
      buttons.push({
        text: 'Purchase',
        type: 'accent',
        callback: () => this.purchaseAircraft(aircraft)
      });
    } else if (!this.state.walletConnected) {
      buttons.push({
        text: 'Connect Wallet',
        type: 'secondary',
        callback: () => {
          this.closeAllModals();
          this.showWalletModal();
        }
      });
    } else {
      buttons.push({
        text: 'Buy Tokens',
        type: 'secondary',
        callback: () => {
          this.closeAllModals();
          this.showBuyTokensModal();
        }
      });
    }
    
    this.showModal(`Purchase Aircraft`, content, buttons);
  }
  
  /**
   * Purchase an aircraft
   */
  purchaseAircraft(aircraft) {
    // Check if can afford
    if (this.state.tokenBalance < aircraft.price) {
      this.showNotification('Purchase Failed', 'Insufficient tokens', 'error');
      return;
    }
    
    // Show loading notification
    const notification = this.showNotification('Processing Purchase', 'Please wait...', 'info', 10000);
    
    // Simulate processing delay
    setTimeout(() => {
      // Deduct tokens
      this.state.tokenBalance -= aircraft.price;
      
      // Update UI
      if (this.hudElements.wallet) {
        this.hudElements.wallet.amount.innerText = this.state.tokenBalance;
      }
      
      // Update store token display if visible
      if (this.state.activeScreen === 'store' && this.screens.store) {
        this.screens.store.tokenAmount.innerText = this.state.tokenBalance;
      }
      
      // Remove loading notification
      this.removeNotification(notification);
      
      // Show success notification
      this.showNotification('Purchase Complete', `You now own the ${aircraft.name}!`, 'success');
      
      // Mark aircraft as owned and update UI
      this.updateAircraftOwnership(aircraft.id, true);
      
      // Select the new aircraft
      this.selectAircraft(aircraft.id);
      
      // Close modals
      this.closeAllModals();
    }, 2000);
  }
  
  /**
   * Update aircraft ownership status
   */
  updateAircraftOwnership(aircraftId, owned) {
    // Update DOM in hangar screen
    if (this.screens.hangar && this.screens.hangar.aircraftList) {
      const aircraftCard = this.screens.hangar.aircraftList.querySelector(`[data-id="${aircraftId}"]`);
      
      if (aircraftCard) {
        const statusText = aircraftCard.querySelector('.sw-aircraft-status div:first-child');
        const priceElement = aircraftCard.querySelector('.sw-aircraft-price');
        
        if (statusText) {
          statusText.innerText = owned ? 'Owned' : 'Locked';
        }
        
        if (priceElement) {
          priceElement.style.display = owned ? 'none' : 'block';
        }
      }
    }
  }
  
  /**
   * Select an aircraft in the hangar
   */
  selectAircraft(aircraftId) {
    // Update DOM in hangar screen
    if (this.screens.hangar && this.screens.hangar.aircraftList) {
      // Remove selected class from all aircraft
      const aircraftCards = this.screens.hangar.aircraftList.querySelectorAll('.sw-aircraft-card');
      aircraftCards.forEach(card => {
        card.classList.remove('selected');
      });
      
      // Add selected class to selected aircraft
      const selectedCard = this.screens.hangar.aircraftList.querySelector(`[data-id="${aircraftId}"]`);
      if (selectedCard) {
        selectedCard.classList.add('selected');
      }
    }
    
    // Notify game of aircraft selection
    if (this.game) {
      this.game.selectAircraft(aircraftId);
    }
  }
  
  /**
   * Confirm aircraft selection
   */
  confirmAircraftSelection() {
    // Find selected aircraft
    const selectedCard = this.screens.hangar.aircraftList.querySelector('.sw-aircraft-card.selected');
    
    if (selectedCard) {
      const aircraftId = selectedCard.dataset.id;
      const aircraftName = selectedCard.querySelector('.sw-aircraft-name').innerText;
      
      // Show notification
      this.showNotification('Aircraft Selected', `${aircraftName} is now your active aircraft`, 'success');
      
      // Return to main menu
      this.showScreen('main-menu');
    }
  }
  
  /**
   * Purchase an item from the store
   */
  purchaseItem(item) {
    // Check if wallet is connected
    if (!this.state.walletConnected) {
      this.showWalletModal();
      return;
    }
    
    // Check if can afford
    if (this.state.tokenBalance < item.price) {
      this.showNotification('Purchase Failed', 'Insufficient tokens', 'error');
      
      // Ask if want to buy tokens
      this.showModal('Insufficient Tokens', 
        `You need ${item.price - this.state.tokenBalance} more SKY tokens to purchase this item.`, 
        [
          {
            text: 'Cancel',
            type: ''
          },
          {
            text: 'Buy Tokens',
            type: 'accent',
            callback: () => this.showBuyTokensModal()
          }
        ]
      );
      
      return;
    }
    
    // Show confirmation
    this.showModal(`Purchase ${item.name}`,
      `Are you sure you want to purchase ${item.name} for ${item.price} SKY?`,
      [
        {
          text: 'Cancel',
          type: ''
        },
        {
          text: 'Confirm Purchase',
          type: 'accent',
          callback: () => this.confirmPurchase(item)
        }
      ]
    );
  }
  
  /**
   * Confirm purchase of store item
   */
  confirmPurchase(item) {
    // Show loading notification
    const notification = this.showNotification('Processing Purchase', 'Please wait...', 'info', 10000);
    
    // Simulate processing delay
    setTimeout(() => {
      // Deduct tokens
      this.state.tokenBalance -= item.price;
      
      // Update UI
      if (this.hudElements.wallet) {
        this.hudElements.wallet.amount.innerText = this.state.tokenBalance;
      }
      
      // Update store token display if visible
      if (this.state.activeScreen === 'store' && this.screens.store) {
        this.screens.store.tokenAmount.innerText = this.state.tokenBalance;
      }
      
      // Remove loading notification
      this.removeNotification(notification);
      
      // Show success notification
      this.showNotification('Purchase Complete', `You have purchased ${item.name}!`, 'success');
      
      // Notify game of purchase
      if (this.game) {
        this.game.itemPurchased(item);
      }
    }, 1500);
  }
  
  /**
   * Save settings changes
   */
  saveSettings() {
    // Gather all settings
    const settings = {
      graphics: {
        quality: this.screens.settings.controls.quality.value,
        fps: this.screens.settings.controls.fps.value
      },
      gameplay: {
        sensitivity: parseInt(this.screens.settings.controls.sensitivity.value, 10) / 100,
        invertY: this.screens.settings.controls.invertY.checked
      },
      sound: {
        masterVolume: parseInt(this.screens.settings.controls.masterVolume.value, 10) / 100,
        musicVolume: parseInt(this.screens.settings.controls.musicVolume.value, 10) / 100
      }
    };
    
    // Apply settings to game
    if (this.game) {
      this.game.applySettings(settings);
    }
    
    // Show notification
    this.showNotification('Settings Saved', 'Your settings have been updated', 'success');
    
    // Return to main menu
    this.showScreen('main-menu');
  }
  
  /**
   * Update HUD with flight data
   */
  updateHUD(data) {
    if (!this.hudElements) return;
    
    // Update altitude
    if (data.altitude !== undefined && this.hudElements.altitude) {
      this.hudElements.altitude.innerText = Math.round(data.altitude);
    }
    
    // Update speed
    if (data.airspeed !== undefined && this.hudElements.speed) {
      this.hudElements.speed.innerText = Math.round(data.airspeed);
    }
    
    // Update heading
    if (data.heading !== undefined && this.hudElements.heading) {
      // Format heading to always have 3 digits (e.g. 001, 042, 358)
      const formattedHeading = data.heading.toString().padStart(3, '0');
      this.hudElements.heading.innerText = formattedHeading;
      
      // Update compass
      if (this.hudElements.compass) {
        // Compass strip is 900px wide (360 degrees * 2.5px)
        // We need to position it so the current heading is in the center
        const compassPosition = -data.heading * 2.5 + 450; // Center offset
        this.hudElements.compass.style.transform = `translateX(${compassPosition}px)`;
      }
    }
    
    // Update status
    if (data.status !== undefined && this.hudElements.status) {
      this.hudElements.status.innerText = data.status;
      
      // Change color based on status
      if (data.status === 'OK') {
        this.hudElements.status.style.color = 'var(--secondary-color)';
      } else if (data.status === 'WARNING') {
        this.hudElements.status.style.color = 'var(--accent-color)';
      } else if (data.status === 'CRITICAL') {
        this.hudElements.status.style.color = 'var(--danger-color)';
      }
    }
    
    // Update target
    if (data.target !== undefined && this.hudElements.target) {
      this.hudElements.target.innerText = data.target || 'None';
      
      // Change color if target is active
      this.hudElements.target.style.color = data.target ? 'var(--accent-color)' : '';
    }
    
    // Update crosshair for aiming
    if (data.aimStatus !== undefined && this.hudElements.crosshair) {
      // Change crosshair color based on aim status
      if (data.aimStatus === 'locked') {
        this.hudElements.crosshair.inner.style.backgroundColor = 'var(--danger-color)';
        this.hudElements.crosshair.outer.style.borderColor = 'var(--danger-color)';
        this.hudElements.crosshair.outer.style.animation = 'pulse 0.5s infinite';
      } else if (data.aimStatus === 'aiming') {
        this.hudElements.crosshair.inner.style.backgroundColor = 'var(--accent-color)';
        this.hudElements.crosshair.outer.style.borderColor = 'var(--accent-color)';
        this.hudElements.crosshair.outer.style.animation = '';
      } else {
        this.hudElements.crosshair.inner.style.backgroundColor = 'var(--text-color)';
        this.hudElements.crosshair.outer.style.borderColor = 'var(--text-color)';
        this.hudElements.crosshair.outer.style.animation = '';
      }
    }
  }
  
  /**
   * Award tokens to the player
   */
  awardTokens(amount, reason) {
    if (!this.state.walletConnected) return;
    
    // Update token balance
    this.state.tokenBalance += amount;
    
    // Update UI
    if (this.hudElements.wallet) {
      this.hudElements.wallet.amount.innerText = this.state.tokenBalance;
    }
    
    // Show notification
    this.showNotification('Tokens Earned', `+${amount} SKY tokens - ${reason}`, 'success');
    
    // Add system chat message
    this.addChatMessage('System', `You earned ${amount} SKY tokens - ${reason}`, 'system');
  }
  
  /**
   * Toggle debug mode
   */
  toggleDebug() {
    this.debug = !this.debug;
    
    if (this.debug) {
      console.log('UI Debug mode enabled');
      console.log('UI State:', this.state);
    }
  }
  
  /**
   * Bind event handlers
   */
  bindEvents() {
    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      // ESC key to close modal or return to main menu
      if (e.key === 'Escape') {
        if (this.state.modalStack.length > 0) {
          const { modal } = this.state.modalStack[this.state.modalStack.length - 1];
          this.closeModal(modal);
        } else if (this.state.activeScreen !== 'main-menu' && this.state.activeScreen !== 'loading') {
          this.showScreen('main-menu');
        }
      }
      
      // Tab key to toggle chat
      if (e.key === 'Tab' && this.state.activeScreen === 'game') {
        e.preventDefault();
        this.toggleChat();
      }
      
      // Debug key (Ctrl+D)
      if (e.key === 'd' && e.ctrlKey) {
        this.toggleDebug();
      }
    });
    
    // Window resize
    window.addEventListener('resize', () => {
      // Adjust UI for new window size
      this.handleResize();
    });
  }
  
  /**
   * Handle window resize
   */
  handleResize() {
    // Update any size-dependent elements
    // For now, most of this is handled by CSS
  }
}

// Export the UI class
export default SkyWarsUI;