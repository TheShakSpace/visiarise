require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectToMongo = require('./db');

// Import routes
const authRoutes = require('./routes/authRoute');
const meshyRoutes = require('./routes/meshyRoute');

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/meshy';
connectToMongo(MONGO_URI);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/meshy', meshyRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Meshy API Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Meshy API Backend',
    endpoints: {
      auth: '/api/auth',
      meshy: '/api/meshy',
      health: '/health'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : {},
  });
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n❌ Port ${PORT} is already in use. Either stop the other process (e.g. lsof -i :${PORT}) or set PORT=5001 in backend/.env\n`
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

module.exports = app;
