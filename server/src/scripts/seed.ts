import dotenv from 'dotenv';
import path from 'path';

// Load environment variables BEFORE importing models or env modules
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { User } from '../models/User';
import { Event } from '../models/Event';
import { Seat } from '../models/Seat';
import { Reservation } from '../models/Reservation';
import { Booking } from '../models/Booking';
import { WalletTransaction } from '../models/WalletTransaction';
import { IdempotencyRecord } from '../models/IdempotencyRecord';
import {
  UserRole,
  EventStatus,
  SeatStatus,
  WalletTransactionType,
  WalletReferenceType,
  WalletTransactionStatus,
} from '../constants/enums';

async function seed() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI is not defined in environment variables.');
    process.exit(1);
  }

  console.log('🌱 Connecting to MongoDB Atlas...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected successfully to MongoDB.');

  console.log('🧹 Cleaning existing collection data...');
  await Promise.all([
    User.deleteMany({}),
    Event.deleteMany({}),
    Seat.deleteMany({}),
    Reservation.deleteMany({}),
    Booking.deleteMany({}),
    WalletTransaction.deleteMany({}),
    IdempotencyRecord.deleteMany({}),
  ]);
  console.log('✅ Database cleaned.');

  console.log('👤 Seeding Users & Initial Wallet Balances...');
  const adminPasswordHash = await bcrypt.hash('Admin@123456', 12);
  const userPasswordHash = await bcrypt.hash('Password123!', 12);

  // Create Admin
  const adminUser = await User.create({
    name: 'System Admin',
    email: 'admin@ticketbooking.com',
    passwordHash: adminPasswordHash,
    role: UserRole.ADMIN,
    walletBalance: 1000000, // ₹10,000 in paise
  });

  // Create Demo Users
  const alice = await User.create({
    name: 'Alice Johnson',
    email: 'alice@example.com',
    passwordHash: userPasswordHash,
    role: UserRole.USER,
    walletBalance: 500000, // ₹5,000 in paise
  });

  const bob = await User.create({
    name: 'Bob Smith',
    email: 'bob@example.com',
    passwordHash: userPasswordHash,
    role: UserRole.USER,
    walletBalance: 300000, // ₹3,000 in paise
  });

  const charlie = await User.create({
    name: 'Charlie Brown',
    email: 'charlie@example.com',
    passwordHash: userPasswordHash,
    role: UserRole.USER,
    walletBalance: 200000, // ₹2,000 in paise
  });

  // Create Initial Wallet Transactions for Ledger Consistency
  await WalletTransaction.insertMany([
    {
      userId: adminUser._id,
      type: WalletTransactionType.CREDIT,
      amount: 1000000,
      balanceBefore: 0,
      balanceAfter: 1000000,
      referenceType: WalletReferenceType.TOP_UP,
      idempotencyKey: 'SEED_TOPUP_ADMIN',
      status: WalletTransactionStatus.COMPLETED,
    },
    {
      userId: alice._id,
      type: WalletTransactionType.CREDIT,
      amount: 500000,
      balanceBefore: 0,
      balanceAfter: 500000,
      referenceType: WalletReferenceType.TOP_UP,
      idempotencyKey: 'SEED_TOPUP_ALICE',
      status: WalletTransactionStatus.COMPLETED,
    },
    {
      userId: bob._id,
      type: WalletTransactionType.CREDIT,
      amount: 300000,
      balanceBefore: 0,
      balanceAfter: 300000,
      referenceType: WalletReferenceType.TOP_UP,
      idempotencyKey: 'SEED_TOPUP_BOB',
      status: WalletTransactionStatus.COMPLETED,
    },
    {
      userId: charlie._id,
      type: WalletTransactionType.CREDIT,
      amount: 200000,
      balanceBefore: 0,
      balanceAfter: 200000,
      referenceType: WalletReferenceType.TOP_UP,
      idempotencyKey: 'SEED_TOPUP_CHARLIE',
      status: WalletTransactionStatus.COMPLETED,
    },
  ]);

  console.log('✅ Users & Ledger transactions seeded.');

  console.log('🎭 Seeding Events & Generating Seats...');

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const eventsData = [
    {
      title: 'Coldplay: Music Of The Spheres Tour 2026',
      description: 'Experience the world-renowned Coldplay live in Mumbai with lasers, fireworks, and iconic hits.',
      venue: 'DY Patil Stadium, Mumbai',
      eventDate: new Date(now + 30 * DAY_MS),
      eventTime: '19:30',
      price: 500000, // ₹5,000
      totalSeats: 50,
      status: EventStatus.PUBLISHED,
    },
    {
      title: 'Tech Innovation Summit 2026',
      description: 'The premier conference for AI, Web3, Cloud, and Developer Experience in India.',
      venue: 'JNC Exhibition Centre, Bengaluru',
      eventDate: new Date(now + 15 * DAY_MS),
      eventTime: '09:00',
      price: 250000, // ₹2,500
      totalSeats: 40,
      status: EventStatus.PUBLISHED,
    },
    {
      title: 'Hamilton Musical Broadway Tour',
      description: 'Lin-Manuel Miranda\'s award-winning Broadway musical masterpiece comes to Mumbai.',
      venue: 'NMACC Grand Theatre, Mumbai',
      eventDate: new Date(now + 45 * DAY_MS),
      eventTime: '18:00',
      price: 350000, // ₹3,500
      totalSeats: 30,
      status: EventStatus.PUBLISHED,
    },
    {
      title: 'ICC T20 Championship Final 2026',
      description: 'Witness the thrilling final battle for world glory live at the largest stadium in the world.',
      venue: 'Narendra Modi Stadium, Ahmedabad',
      eventDate: new Date(now + 60 * DAY_MS),
      eventTime: '14:30',
      price: 750000, // ₹7,500
      totalSeats: 60,
      status: EventStatus.PUBLISHED,
    },
  ];

  for (const eventInfo of eventsData) {
    const eventDoc = await Event.create(eventInfo);

    // Generate Seats (Rows A, B, C, D...)
    const seatDocs = [];
    const rows = ['A', 'B', 'C', 'D', 'E', 'F'];
    const seatsPerRow = Math.ceil(eventInfo.totalSeats / rows.length);

    let seatCount = 0;
    for (const r of rows) {
      for (let num = 1; num <= seatsPerRow; num++) {
        if (seatCount >= eventInfo.totalSeats) break;
        const seatNumber = `${r}${num}`;
        seatDocs.push({
          eventId: eventDoc._id,
          seatNumber,
          price: eventInfo.price,
          status: SeatStatus.AVAILABLE,
        });
        seatCount++;
      }
      if (seatCount >= eventInfo.totalSeats) break;
    }

    await Seat.insertMany(seatDocs);
    console.log(`   └─ Created Event "${eventDoc.title}" with ${seatDocs.length} seats.`);
  }

  console.log('✅ Events & Seats seeded successfully.');

  console.log('\n===============================================================');
  console.log('🎉 SEEDING COMPLETE! DEMO CREDENTIALS FOR TESTING:');
  console.log('===============================================================');
  console.log('👑 Admin Account:');
  console.log('   Email:    admin@ticketbooking.com');
  console.log('   Password: Admin@123456');
  console.log('   Role:     ADMIN');
  console.log('   Balance:  ₹10,000 (1,000,000 paise)\n');
  console.log('👥 User Accounts:');
  console.log('   1. Email:    alice@example.com');
  console.log('      Password: Password123!');
  console.log('      Balance:  ₹5,000 (500,000 paise)');
  console.log('   2. Email:    bob@example.com');
  console.log('      Password: Password123!');
  console.log('      Balance:  ₹3,000 (300,000 paise)');
  console.log('   3. Email:    charlie@example.com');
  console.log('      Password: Password123!');
  console.log('      Balance:  ₹2,000 (200,000 paise)');
  console.log('===============================================================\n');

  await mongoose.disconnect();
  console.log('👋 MongoDB disconnected.');
}

seed().catch((err) => {
  console.error('❌ Seeding failed with error:', err);
  process.exit(1);
});
