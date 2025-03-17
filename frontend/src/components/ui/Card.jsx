import React from 'react';
import PropTypes from 'prop-types';

/**
 * Card component for displaying content in a container with optional header and footer.
 */
const Card = ({
  children,
  title,
  footer,
  variant = 'default',
  className = '',
  contentClassName = '',
  onClick,
  ...props
}) => {
  // Define styles based on variant
  const variantStyles = {
    default: 'bg-slate-800 border border-slate-700',
    primary: 'bg-slate-800 border border-sky-700',
    transparent: 'bg-slate-800/40 backdrop-blur-md border border-slate-700/50',
    nft: 'bg-gradient-to-br from-slate-800 to-indigo-900 border border-indigo-700/50',
  };
  
  const baseStyle = 'rounded-lg shadow-lg overflow-hidden transition-all duration-200';
  const hoverStyle = onClick ? 'cursor-pointer hover:shadow-xl hover:translate-y-[-2px]' : '';
  
  const cardClasses = `
    ${baseStyle}
    ${variantStyles[variant]}
    ${hoverStyle}
    ${className}
  `;

  return (
    <div className={cardClasses} onClick={onClick} {...props}>
      {title && (
        <div className="p-4 border-b border-slate-700">
          {typeof title === 'string' ? (
            <h3 className="text-lg font-semibold text-white">{title}</h3>
          ) : (
            title
          )}
        </div>
      )}
      
      <div className={`p-4 ${contentClassName}`}>
        {children}
      </div>
      
      {footer && (
        <div className="p-4 border-t border-slate-700 bg-slate-900/50">
          {footer}
        </div>
      )}
    </div>
  );
};

Card.propTypes = {
  children: PropTypes.node.isRequired,
  title: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  footer: PropTypes.node,
  variant: PropTypes.oneOf(['default', 'primary', 'transparent', 'nft']),
  className: PropTypes.string,
  contentClassName: PropTypes.string,
  onClick: PropTypes.func,
};

export default Card;