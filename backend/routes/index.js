/**
 * API Routes Index for SkyWars
 * 
 * Centralizes all API routes and provides versioning capability.
 */

const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./authRoutes');
const gameRoutes = require('./gameRoutes');
const tokenRoutes = require('./tokenRoutes');

// API health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.API_VERSION || '1.0.0'
  });
});

// Apply routes to router
router.use('/auth', authRoutes);
router.use('/games', gameRoutes);
router.use('/tokens', tokenRoutes);

// Catch-all 404 handler for API routes
router.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} does not exist`
  });
});

module.exports = router;