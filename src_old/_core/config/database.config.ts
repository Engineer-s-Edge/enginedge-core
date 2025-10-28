import { registerAs } from '@nestjs/config';

export default registerAs('database', () => {
  // Check if in-memory mode is enabled
  const useInMemory = process.env.USE_IN_MEMORY_DB === 'true';

  let mongoUri: string;

  if (useInMemory) {
    // In-memory mode - will be set up dynamically in the database module
    mongoUri = 'mongodb://localhost:27017/enginedge-main-node-in-memory';
    console.log('Using in-memory MongoDB server');
  } else {
    // Use the provided MongoDB URI, defaulting to localhost connection
    mongoUri =
      process.env.MONGODB_URI ||
      'mongodb://localhost:27017/enginedge-main-node';
    // console.log(`Connecting to MongoDB at: ${mongoUri}`);
  }

  return {
    uri: mongoUri,
    useInMemory,
    options: {
      serverSelectionTimeoutMS: 30000, // Longer timeout for server selection
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      retryWrites: true,
      retryReads: true,
      autoCreate: true,
    },
  };
});
