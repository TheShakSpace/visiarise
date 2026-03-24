const mongoose = require('mongoose');

const connectToMongo = async (mongoUri) => {
  try {
    const status = await mongoose.connect(mongoUri);
    console.log(`✅ MongoDB Connected: ${status.connection?.host || mongoUri}`);
    return status;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    const msg = String(error.message || '');
    if (msg.includes('ECONNREFUSED') || msg.includes('ServerSelectionError')) {
      console.error(`
→ Nothing is listening on your MongoDB address (often localhost:27017).

  Local MongoDB (Homebrew):
    brew services start mongodb-community@8.0
    # or: mongod --config /opt/homebrew/etc/mongod.conf

  Or use MongoDB Atlas: set MONGO_URI in backend/.env to your
  mongodb+srv://... connection string (Database → Connect → Drivers).

  Current URI: ${mongoUri.replace(/:[^:@/]+@/, ':****@')}
`);
    }
    if (require.main === module) {
      process.exit(1);
    }
    throw error;
  }
};

module.exports = connectToMongo;