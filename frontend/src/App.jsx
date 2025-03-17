import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { GameProvider } from './contexts/GameContext';
import { WalletProvider } from './contexts/WalletContext';
import { AuthProvider } from './contexts/AuthContext'; // Assuming you have this

// Import pages
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import GameLobby from './pages/GameLobby';
import GamePlay from './pages/GamePlay';
import Hangar from './pages/Hangar';
import Shop from './pages/Shop';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';

// Import components
import PrivateRoute from './components/PrivateRoute';
import Navbar from './components/ui/Navbar';
import Footer from './components/ui/Footer';

function App() {
  return (
    <AuthProvider>
      <WalletProvider>
        <GameProvider>
          <Router>
            <div className="app">
              <Navbar />
              <main className="main-content">
                <Routes>
                  {/* Public routes */}
                  <Route path="/" element={<Home />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  
                  {/* Protected routes */}
                  <Route path="/dashboard" element={
                    <PrivateRoute>
                      <Dashboard />
                    </PrivateRoute>
                  } />
                  
                  <Route path="/lobby" element={
                    <PrivateRoute>
                      <GameLobby />
                    </PrivateRoute>
                  } />
                  
                  <Route path="/play/:gameId" element={
                    <PrivateRoute>
                      <GamePlay />
                    </PrivateRoute>
                  } />
                  
                  <Route path="/hangar" element={
                    <PrivateRoute>
                      <Hangar />
                    </PrivateRoute>
                  } />
                  
                  <Route path="/shop" element={
                    <PrivateRoute>
                      <Shop />
                    </PrivateRoute>
                  } />
                  
                  <Route path="/profile" element={
                    <PrivateRoute>
                      <Profile />
                    </PrivateRoute>
                  } />
                  
                  {/* 404 route */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </main>
              <Footer />
            </div>
          </Router>
        </GameProvider>
      </WalletProvider>
    </AuthProvider>
  );
}

export default App;