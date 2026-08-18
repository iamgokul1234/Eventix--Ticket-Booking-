/**
 * seedAdmin.ts — Creates the initial ADMIN user in the database.
 * Run: npm run seed:admin --workspace=server
 * Safe to run multiple times: upserts by email.
 */
import dotenv from 'dotenv';
import path from 'path';

// Load .env before any config imports
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { config } from '../config/env';
import { User } from '../models/User';
import { UserRole } from '../constants/enums';

async function seed(): Promise<void> {
  await mongoose.connect(config.mongodbUri);
  console.log('Connected to MongoDB');

  const { admin } = config;
  const passwordHash = await bcrypt.hash(admin.password, 12);

  const result = await User.findOneAndUpdate(
    { email: admin.email },
    {
      $set: {
        name: admin.name,
        email: admin.email,
        passwordHash,
        role: UserRole.ADMIN,
        walletBalance: 0,
      },
    },
    { upsert: true, new: true }
  );

  console.log(`Admin seeded: ${result.email} (id: ${result._id})`);
  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
