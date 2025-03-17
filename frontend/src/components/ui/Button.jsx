import React from 'react';
import PropTypes from 'prop-types';

/**
 * Button component with different variants for the SkyWars UI.
 */
const Button = ({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  className = '',
  startIcon,
  endIcon,
  ...props
}) => {
  // Define styles based on variant and size
  const baseStyle = 'flex items-center justify-center font-medium rounded-md transition-all duration-200 focus:outline-none';
  
  const variantStyles = {
    primary: 'bg-sky-600 hover:bg-sky-700 text-white shadow-md hover:shadow-lg active:bg-sky-800',
    secondary: 'bg-slate-700 hover:bg-slate-800 text-white shadow-md hover:shadow-lg active:bg-slate-900',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-md hover:shadow-lg active:bg-red-800',
    success: 'bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg active:bg-green-800',
    outline: 'bg-transparent border-2 border-sky-600 text-sky-600 hover:bg-sky-600/10 active:bg-sky-600/20',
    ghost: 'bg-transparent hover:bg-gray-700/30 text-white active:bg-gray-700/40',
  };
  
  const sizeStyles = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };
  
  const disabledStyle = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
  const widthStyle = fullWidth ? 'w-full' : '';
  
  const buttonClasses = `
    ${baseStyle}
    ${variantStyles[variant]}
    ${sizeStyles[size]}
    ${disabledStyle}
    ${widthStyle}
    ${className}
  `;

  return (
    <button
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {startIcon && <span className="mr-2">{startIcon}</span>}
      {children}
      {endIcon && <span className="ml-2">{endIcon}</span>}
    </button>
  );
};

Button.propTypes = {
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func,
  variant: PropTypes.oneOf(['primary', 'secondary', 'danger', 'success', 'outline', 'ghost']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  disabled: PropTypes.bool,
  fullWidth: PropTypes.bool,
  className: PropTypes.string,
  startIcon: PropTypes.node,
  endIcon: PropTypes.node,
};

export default Button;