import mongoose from 'mongoose';

/**
 * Connect to MongoDB and set server selection timeout
 * to fail over to local mock mode quickly if DB is offline.
 */
export const connectDB = async () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/trackbus';
  
  console.log(`🔌 Attempting connection to MongoDB at: ${MONGODB_URI}`);
  
  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 3000
    });
    console.log('========================================================');
    console.log(`🎉 MongoDB Connected: ${conn.connection.host}`);
    console.log('========================================================');
    return true;
  } catch (error) {
    console.warn('========================================================');
    console.warn('⚠️  MongoDB Connection Failed!');
    console.warn('🤖 Running in LOCAL OFFLINE/MOCK DEMO mode.');
    console.warn('💾 Operations will fallback to transient in-memory state.');
    console.warn('========================================================');
    return false;
  }
};
