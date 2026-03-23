const mongoose = require('mongoose')

const connectToMongo = async (mongURI)=>{
    try {

        const status = await mongoose.connect(mongURI);
          console.log(`✅ MongoDB Connected: ${status}`);
    }catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        process.exit(1); // Exit process with failure
      }
};

module.exports = connectToMongo;