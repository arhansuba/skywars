import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import { CSSTransition, TransitionGroup } from 'react-transition-group';

/**
 * Notification component for displaying alerts and messages.
 */
const Notification = ({
  id,
  type = 'info',
  title,
  message,
  autoClose = true,
  duration = 5000,
  onClose,
  actions,
}) => {
  const [progress, setProgress] = useState(100);
  
  // Set up auto-close timer
  useEffect(() => {
    if (autoClose) {
      const interval = setInterval(() => {
        setProgress((prev) => {
          const newProgress = prev - (100 / (duration / 100));
          return Math.max(newProgress, 0);
        });
      }, 100);
      
      const timeout = setTimeout(() => {
        onClose(id);
      }, duration);
      
      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [autoClose, duration, id, onClose]);
  
  // Pause progress when hovering
  const handleMouseEnter = () => {
    if (autoClose) {
      setProgress((prev) => prev);
    }
  };
  
  // Resume progress when not hovering
  const handleMouseLeave = () => {
    if (autoClose) {
      setProgress((prev) => prev);
    }
  };
  
  // Icon based on notification type
  const iconMap = {
    success: (
      <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    error: (
      <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="w-6 h-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    info: (
      <svg className="w-6 h-6 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    token: (
      <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };
  
  // Background color based on notification type
  const bgColorMap = {
    success: 'bg-green-900/20 backdrop-blur-sm border border-green-800',
    error: 'bg-red-900/20 backdrop-blur-sm border border-red-800',
    warning: 'bg-yellow-900/20 backdrop-blur-sm border border-yellow-800',
    info: 'bg-sky-900/20 backdrop-blur-sm border border-sky-800',
    token: 'bg-indigo-900/20 backdrop-blur-sm border border-indigo-800',
  };
  
  return (
    <div
      className={`w-full max-w-md rounded-lg shadow-lg overflow-hidden ${bgColorMap[type]}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            {iconMap[type]}
          </div>
          <div className="ml-3 w-0 flex-1">
            {title && <h3 className="text-sm font-medium text-white">{title}</h3>}
            <div className="mt-1">
              {typeof message === 'string' ? (
                <p className="text-sm text-slate-300">{message}</p>
              ) : (
                message
              )}
            </div>
            {actions && (
              <div className="mt-3 flex space-x-2">
                {actions}
              </div>
            )}
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button
              className="bg-transparent rounded-md inline-flex text-slate-400 hover:text-slate-300"
              onClick={() => onClose(id)}
            >
              <span className="sr-only">Close</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {autoClose && (
        <div className="h-1 w-full bg-slate-700">
          <div
            className={`h-full ${
              type === 'success' ? 'bg-green-500' :
              type === 'error' ? 'bg-red-500' :
              type === 'warning' ? 'bg-yellow-500' :
              type === 'token' ? 'bg-indigo-500' :
              'bg-sky-500'
            } transition-all duration-100 ease-linear`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};

Notification.propTypes = {
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  type: PropTypes.oneOf(['success', 'error', 'warning', 'info', 'token']),
  title: PropTypes.string,
  message: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  autoClose: PropTypes.bool,
  duration: PropTypes.number,
  onClose: PropTypes.func.isRequired,
  actions: PropTypes.node,
};

/**
 * Notification container for managing multiple notifications.
 */
const NotificationContainer = ({ position = 'top-right' }) => {
  const [notifications, setNotifications] = useState([]);
  
  // Position styles
  const positionStyles = {
    'top-right': 'top-0 right-0',
    'top-left': 'top-0 left-0',
    'bottom-right': 'bottom-0 right-0',
    'bottom-left': 'bottom-0 left-0',
    'top-center': 'top-0 left-1/2 -translate-x-1/2',
    'bottom-center': 'bottom-0 left-1/2 -translate-x-1/2',
  };
  
  // Add notification
  const addNotification = (notification) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 5);
    setNotifications((prev) => [...prev, { ...notification, id }]);
    return id;
  };
  
  // Remove notification
  const removeNotification = (id) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  };
  
  // Create a global method to add notifications
  useEffect(() => {
    window.notify = {
      success: (message, options) => 
        addNotification({ type: 'success', message, ...options }),
      error: (message, options) => 
        addNotification({ type: 'error', message, ...options }),
      warning: (message, options) => 
        addNotification({ type: 'warning', message, ...options }),
      info: (message, options) => 
        addNotification({ type: 'info', message, ...options }),
      token: (message, options) => 
        addNotification({ type: 'token', message, ...options }),
      remove: removeNotification,
    };
    
    return () => {
      delete window.notify;
    };
  }, []);
  
  return ReactDOM.createPortal(
    <div className={`fixed z-50 p-4 max-w-md w-full ${positionStyles[position]}`}>
      <TransitionGroup>
        {notifications.map((notification) => (
          <CSSTransition
            key={notification.id}
            timeout={300}
            classNames="notification"
          >
            <div className="mb-3">
              <Notification
                {...notification}
                onClose={removeNotification}
              />
            </div>
          </CSSTransition>
        ))}
      </TransitionGroup>
    </div>,
    document.getElementById('notification-root') || document.body
  );
};

NotificationContainer.propTypes = {
  position: PropTypes.oneOf(['top-right', 'top-left', 'bottom-right', 'bottom-left', 'top-center', 'bottom-center']),
};

export { NotificationContainer, Notification };
export default NotificationContainer;