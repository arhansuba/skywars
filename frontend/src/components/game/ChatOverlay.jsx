import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useGameContext } from '../contexts/GameContext';

/**
 * In-game chat overlay component.
 */
const ChatOverlay = ({
  position = 'bottom-left',
  initiallyOpen = false,
  width = 300,
  height = 250,
  className = '',
}) => {
  const { gameInstance, gameState } = useGameContext();
  
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [activeChannel, setActiveChannel] = useState('all');
  const [unreadCount, setUnreadCount] = useState(0);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  
  // Position styling
  const positionStyles = {
    'top-left': 'top-5 left-5',
    'top-right': 'top-5 right-5',
    'bottom-left': 'bottom-20 left-5',
    'bottom-right': 'bottom-20 right-5',
  };
  
  // Channel options
  const channels = [
    { id: 'all', name: 'All', color: 'text-white' },
    { id: 'team', name: 'Team', color: 'text-green-400' },
    { id: 'squad', name: 'Squad', color: 'text-sky-400' },
    { id: 'system', name: 'System', color: 'text-yellow-400', readOnly: true },
  ];
  
  // Subscribe to game chat messages
  useEffect(() => {
    if (!gameInstance) return;
    
    const handleChatMessage = (message) => {
      // Add message to state
      setMessages((prevMessages) => [...prevMessages, message]);
      
      // Increment unread counter if chat is closed
      if (!isOpen) {
        setUnreadCount((prev) => prev + 1);
      }
    };
    
    // Register event listener
    gameInstance.on('chat:message', handleChatMessage);
    
    // Initial system message
    setMessages([
      {
        id: 'system-welcome',
        sender: 'System',
        text: 'Welcome to the battle! Use chat to communicate with your team.',
        channel: 'system',
        timestamp: Date.now(),
      },
    ]);
    
    return () => {
      // Clean up event listener
      gameInstance.off('chat:message', handleChatMessage);
    };
  }, [gameInstance, isOpen]);
  
  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && isOpen) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);
  
  // Reset unread count when opening chat
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      
      // Focus input when chat is opened
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
    }
  }, [isOpen]);
  
  // Toggle chat window
  const toggleChat = () => {
    setIsOpen(!isOpen);
  };
  
  // Switch active channel
  const switchChannel = (channelId) => {
    setActiveChannel(channelId);
    
    // Focus input after switching channel
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };
  
  // Send chat message
  const sendMessage = (e) => {
    e.preventDefault();
    
    if (!gameInstance || !inputValue.trim()) return;
    
    // Create message object
    const message = {
      text: inputValue,
      channel: activeChannel,
    };
    
    // Send message via game instance
    gameInstance.sendChatMessage(message);
    
    // Clear input
    setInputValue('');
  };
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Toggle chat with Enter key when game is active
      if (e.key === 'Enter' && !isOpen && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        setIsOpen(true);
      }
      
      // Close chat with Escape key
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);
  
  // Filter messages by active channel
  const filteredMessages = messages.filter((message) => {
    if (activeChannel === 'all') {
      return true;
    }
    return message.channel === activeChannel;
  });
  
  return (
    <div 
      className={`absolute ${positionStyles[position]} ${className} z-10`}
    >
      {/* Chat window */}
      {isOpen && (
        <div 
          className="bg-slate-900/80 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden shadow-lg flex flex-col"
          style={{ width, height }}
        >
          {/* Chat header */}
          <div className="bg-slate-800 px-3 py-2 flex items-center border-b border-slate-700">
            <div className="text-white font-medium">Chat</div>
            
            {/* Channel tabs */}
            <div className="ml-auto flex space-x-1">
              {channels.map((channel) => (
                <button
                  key={channel.id}
                  className={`px-2 py-1 text-xs rounded ${
                    activeChannel === channel.id
                      ? `bg-slate-700 ${channel.color}`
                      : 'text-slate-400 hover:text-white'
                  }`}
                  onClick={() => switchChannel(channel.id)}
                >
                  {channel.name}
                </button>
              ))}
            </div>
            
            {/* Close button */}
            <button
              className="ml-2 text-slate-400 hover:text-white"
              onClick={toggleChat}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Messages container */}
          <div className="flex-grow overflow-y-auto p-2 space-y-2">
            {filteredMessages.length === 0 ? (
              <div className="text-center text-slate-500 text-sm py-4">
                No messages in this channel
              </div>
            ) : (
              filteredMessages.map((message) => {
                // Get channel color
                const channel = channels.find((c) => c.id === message.channel);
                const channelColor = channel?.color || 'text-white';
                
                return (
                  <div 
                    key={message.id || `${message.sender}-${message.timestamp}`}
                    className="text-sm"
                  >
                    {/* Sender and timestamp */}
                    <div className="flex items-center">
                      <span className={`font-medium ${channelColor}`}>
                        {message.sender || 'Anonymous'}
                      </span>
                      <span className="text-xs text-slate-500 ml-2">
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    
                    {/* Message text */}
                    <div className="text-slate-300 break-words">
                      {message.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Input field */}
          <form onSubmit={sendMessage} className="p-2 border-t border-slate-700">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={`Message ${
                  activeChannel === 'all' ? 'everyone' : 
                  activeChannel === 'team' ? 'your team' : 
                  activeChannel === 'squad' ? 'your squadron' : 
                  ''
                }...`}
                className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                disabled={channels.find(c => c.id === activeChannel)?.readOnly}
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white disabled:opacity-50"
                disabled={!inputValue.trim() || channels.find(c => c.id === activeChannel)?.readOnly}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}
      
      {/* Chat toggle button */}
      {!isOpen && (
        <button
          className="bg-slate-900/80 backdrop-blur-sm border border-slate-700 rounded-lg p-2 flex items-center shadow-lg hover:bg-slate-800/80 transition-colors"
          onClick={toggleChat}
        >
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          
          {/* Unread indicator */}
          {unreadCount > 0 && (
            <span className="ml-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
};

ChatOverlay.propTypes = {
  position: PropTypes.oneOf(['top-left', 'top-right', 'bottom-left', 'bottom-right']),
  initiallyOpen: PropTypes.bool,
  width: PropTypes.number,
  height: PropTypes.number,
  className: PropTypes.string,
};

export default ChatOverlay;