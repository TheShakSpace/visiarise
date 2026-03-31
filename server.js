const path = require('path');
// Load .env next to this file (works for repo root on the backend-only deploy branch).
require('dotenv').config({ path: path.join(__dirname, '.env') });
const connectToMongo = require('./db');
const createApp = require('./createApp');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/meshy';
const app = createApp();

function start() {
  if (!process.env.MONGO_URI && process.env.RAILWAY_ENVIRONMENT) {
    console.error(
      '\n⚠️  MONGO_URI is not set in Railway. Add it under the service → Variables (use your Atlas `mongodb+srv://...` string). Committed .env files are not used for secrets on deploy.\n'
    );
  }
  const PORT = Number(process.env.PORT) || 5000;
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server listening on 0.0.0.0:${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\n❌ Port ${PORT} is already in use. Stop the other process or set PORT in .env.\n`
      );
    } else {
      console.error(err);
    }
    process.exit(1);
  });

  // Listen before Mongo so Railway /health succeeds even if Atlas is slow or misconfigured.
  connectToMongo(MONGO_URI).catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    console.error(
      '→ Set MONGO_URI in Railway and allow Atlas Network Access for this host (e.g. 0.0.0.0/0 for testing).'
    );
    if (process.env.EXIT_ON_DB_FAILURE === '1') {
      process.exit(1);
    }
  });
}

if (require.main === module) {
  start();
}

module.exports = app;
