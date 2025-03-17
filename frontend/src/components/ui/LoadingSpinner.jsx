import React from 'react';
import PropTypes from 'prop-types';

/**
 * Loading spinner component with multiple variants.
 */
const LoadingSpinner = ({
  size = 'md',
  variant = 'primary',
  label = '',
  showLabel = true,
  className = '',
  fullPage = false,
}) => {
  // Size mappings
  const sizeMap = {
    xs: 'h-4 w-4',
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  };
  
  // Variant color mappings
  const variantMap = {
    primary: 'border-sky-500',
    secondary: 'border-slate-300',
    white: 'border-white',
    success: 'border-green-500',
    danger: 'border-red-500',
  };
  
  // Spinner styles
  const spinnerClasses = `
    ${sizeMap[size] || sizeMap.md}
    ${variantMap[variant] || variantMap.primary}
    animate-spin rounded-full border-t-transparent border-2 sm:border-4
    ${className}
  `;
  
  // Full page spinner
  if (fullPage) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm z-50">
        <div className={spinnerClasses}></div>
        {showLabel && label && (
          <p className="mt-4 text-white text-lg">{label}</p>
        )}
      </div>
    );
  }
  
  // Regular spinner
  return (
    <div className={`flex flex-col items-center justify-center ${fullPage ? 'h-full w-full' : ''}`}>
      <div className={spinnerClasses}></div>
      {showLabel && label && (
        <p className="mt-2 text-slate-300 text-sm">{label}</p>
      )}
    </div>
  );
};

LoadingSpinner.propTypes = {
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl']),
  variant: PropTypes.oneOf(['primary', 'secondary', 'white', 'success', 'danger']),
  label: PropTypes.string,
  showLabel: PropTypes.bool,
  className: PropTypes.string,
  fullPage: PropTypes.bool,
};

export default LoadingSpinner;