const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoute');
const meshyRoutes = require('./routes/meshyRoute');
const projectRoutes = require('./routes/projectRoute');
const contactRoutes = require('./routes/contactRoute');
const freelancerRoutes = require('./routes/freelancerRoute');

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/meshy', meshyRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/contact', contactRoutes);
  app.use('/api/freelancers', freelancerRoutes);

  app.get('/health', (req, res) => {
    res.json({
      status: 'OK',
      message: 'Meshy API Backend is running',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/', (req, res) => {
    res.json({
      message: 'Welcome to Meshy API Backend',
      endpoints: {
        auth: '/api/auth',
        meshy: '/api/meshy',
        projects: '/api/projects',
        contact: '/api/contact',
        health: '/health',
      },
    });
  });

  app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });

  app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(err.status || 500).json({
      message: err.message || 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err : {},
    });
  });

  return app;
}

module.exports = createApp;
