import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import { CSSTransition } from 'react-transition-group';
import Button from './Button';

/**
 * Modal component for dialogs and popups.
 */
const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnOutsideClick = true,
  showCloseButton = true,
  className = '',
  ...props
}) => {
  const modalRef = useRef(null);
  
  // Close modal when Escape key is pressed
  useEffect(() => {
    const handleEscapeKey = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscapeKey);
    
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOpen, onClose]);
  
  // Prevent body scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);
  
  // Handle outside click
  const handleBackdropClick = (e) => {
    if (closeOnOutsideClick && modalRef.current && !modalRef.current.contains(e.target)) {
      onClose();
    }
  };
  
  // Define size styles
  const sizeStyles = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-full h-full m-0 rounded-none',
  };
  
  if (!isOpen) return null;
  
  return ReactDOM.createPortal(
    <CSSTransition
      in={isOpen}
      timeout={300}
      classNames="modal"
      unmountOnExit
    >
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={handleBackdropClick}
      >
        <div 
          ref={modalRef}
          className={`bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full ${sizeStyles[size]} ${className} transition-transform`}
          {...props}
        >
          {/* Modal header */}
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              {title && <h3 className="text-xl font-semibold text-white">{title}</h3>}
              {showCloseButton && (
                <button 
                  onClick={onClose}
                  className="p-1 hover:bg-slate-700 rounded-full transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
          
          {/* Modal content */}
          <div className="p-4 overflow-auto">
            {children}
          </div>
          
          {/* Modal footer */}
          {footer && (
            <div className="p-4 border-t border-slate-700 bg-slate-800">
              {footer}
            </div>
          )}
        </div>
      </div>
    </CSSTransition>,
    document.getElementById('modal-root') || document.body
  );
};

Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.node,
  children: PropTypes.node.isRequired,
  footer: PropTypes.node,
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl', 'full']),
  closeOnOutsideClick: PropTypes.bool,
  showCloseButton: PropTypes.bool,
  className: PropTypes.string,
};

/**
 * Confirm modal component for simple yes/no dialogs.
 */
export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  ...props
}) => {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };
  
  const footer = (
    <div className="flex justify-end space-x-3">
      <Button variant="ghost" onClick={onClose}>
        {cancelText}
      </Button>
      <Button variant={confirmVariant} onClick={handleConfirm}>
        {confirmText}
      </Button>
    </div>
  );
  
  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={title}
      footer={footer}
      size="sm"
      {...props}
    >
      {typeof message === 'string' ? <p className="text-slate-300">{message}</p> : message}
    </Modal>
  );
};

ConfirmModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  title: PropTypes.string,
  message: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  confirmText: PropTypes.string,
  cancelText: PropTypes.string,
  confirmVariant: PropTypes.string,
};

export default Modal;