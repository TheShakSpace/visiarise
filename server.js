const path = require('path');
// Always load backend/.env — not cwd — so `node backend/server.js` from repo root still uses Atlas/JWT from this folder.
require('dotenv').config({ path: path.join(__dirname, '.env') });
const connectToMongo = require('./db');
const createApp = require('./createApp');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/meshy';
const app = createApp();

async function start() {
  await connectToMongo(MONGO_URI);
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
}

if (require.main === module) {
  start();
}

module.exports = app;
