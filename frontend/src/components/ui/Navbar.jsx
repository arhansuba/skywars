import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import TokenDisplay from './TokenDisplay';
import Button from './Button';

/**
 * Navigation bar component with responsive mobile menu.
 */
const Navbar = ({
  logo,
  navItems = [],
  profileMenu,
  showTokenBalance = true,
  tokenBalance,
  isAuthenticated = false,
  onLogin,
  onRegister,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  return (
    <nav className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 fixed top-0 left-0 right-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo and desktop navigation */}
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              {typeof logo === 'string' ? (
                <Link to="/" className="text-2xl font-bold text-sky-500">
                  {logo}
                </Link>
              ) : (
                logo
              )}
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:items-center sm:space-x-4">
              {navItems.map((item, index) => (
                <Link
                  key={index}
                  to={item.href}
                  className="px-3 py-2 text-slate-300 hover:text-white transition-colors relative group"
                >
                  {item.label}
                  <span className="absolute bottom-0 left-0 w-full h-0.5 bg-sky-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></span>
                </Link>
              ))}
            </div>
          </div>
          
          {/* Right section with token and profile */}
          <div className="hidden sm:flex sm:items-center sm:space-x-4">
            {showTokenBalance && (
              <TokenDisplay balance={tokenBalance} />
            )}
            
            {isAuthenticated ? (
              <div className="relative">
                {profileMenu}
              </div>
            ) : (
              <div className="flex space-x-2">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={onLogin}
                >
                  Login
                </Button>
                <Button 
                  variant="primary" 
                  size="sm"
                  onClick={onRegister}
                >
                  Register
                </Button>
              </div>
            )}
          </div>
          
          {/* Mobile menu button */}
          <div className="flex items-center sm:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 focus:outline-none"
              aria-expanded="false"
            >
              <span className="sr-only">Open main menu</span>
              {isMenuOpen ? (
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile menu */}
      <div className={`${isMenuOpen ? 'block' : 'hidden'} sm:hidden bg-slate-800 pb-3 border-b border-slate-700`}>
        <div className="pt-2 pb-3 space-y-1">
          {navItems.map((item, index) => (
            <Link
              key={index}
              to={item.href}
              className="block pl-4 pr-4 py-2 text-base font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>
        
        {/* Mobile auth section */}
        <div className="pt-4 pb-3 border-t border-slate-700">
          {showTokenBalance && (
            <div className="px-4 py-2">
              <TokenDisplay balance={tokenBalance} />
            </div>
          )}
          
          {isAuthenticated ? (
            <div className="px-4">
              {profileMenu}
            </div>
          ) : (
            <div className="flex items-center px-4 space-x-2">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={onLogin}
              >
                Login
              </Button>
              <Button 
                variant="primary" 
                size="sm"
                onClick={onRegister}
              >
                Register
              </Button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

Navbar.propTypes = {
  logo: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  navItems: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      href: PropTypes.string.isRequired,
    })
  ),
  profileMenu: PropTypes.node,
  showTokenBalance: PropTypes.bool,
  tokenBalance: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  isAuthenticated: PropTypes.bool,
  onLogin: PropTypes.func,
  onRegister: PropTypes.func,
};

export default Navbar;