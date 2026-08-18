import { beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { config } from '../config';
import { connectDatabase, disconnectDatabase } from '../config/database';

beforeAll(async () => {
  await connectDatabase(config.mongodbUriTest);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

beforeEach(async () => {
  // Clean all collections before each test for isolation
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
