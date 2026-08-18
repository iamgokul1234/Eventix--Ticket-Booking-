import mongoose, { Schema, Document, Model } from 'mongoose';
import {
  WalletTransactionType,
  WalletReferenceType,
  WalletTransactionStatus,
} from '../constants/enums';

export interface IWalletTransaction extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: WalletTransactionType;
  /** Amount of this transaction in integer paise. Never a float. */
  amount: number;
  /** Balance before this transaction in integer paise. Snapshot at write time. */
  balanceBefore: number;
  /** Balance after this transaction in integer paise. Snapshot at write time. */
  balanceAfter: number;
  referenceType: WalletReferenceType;
  /** ID of the associated entity (booking, top-up, etc.) */
  referenceId: mongoose.Types.ObjectId | null;
  idempotencyKey: string | null;
  status: WalletTransactionStatus;
  createdAt: Date;
  updatedAt: Date;
}

const walletTransactionSchema = new Schema<IWalletTransaction>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    type: {
      type: String,
      enum: Object.values(WalletTransactionType),
      required: [true, 'Transaction type is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [1, 'Transaction amount must be at least 1 paise'],
      validate: {
        validator: Number.isInteger,
        message: 'Amount must be an integer (paise)',
      },
    },
    balanceBefore: {
      type: Number,
      required: [true, 'Balance before is required'],
      min: [0, 'Balance cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Balance before must be an integer (paise)',
      },
    },
    balanceAfter: {
      type: Number,
      required: [true, 'Balance after is required'],
      min: [0, 'Balance after cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Balance after must be an integer (paise)',
      },
    },
    referenceType: {
      type: String,
      enum: Object.values(WalletReferenceType),
      required: [true, 'Reference type is required'],
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    idempotencyKey: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(WalletTransactionStatus),
      default: WalletTransactionStatus.COMPLETED,
    },
  },
  {
    timestamps: true,
    // Explicitly disable update operations at schema level via a pre-hook.
    // The ledger is append-only — past entries must never be mutated.
  }
);

// Guard: reject any write/update operations on this model.
// The ledger is append-only — past entries must never be mutated.
function appendOnlyGuard(this: unknown): never {
  throw new Error(
    'WalletTransaction is an append-only ledger. Mutations are not permitted.'
  );
}

walletTransactionSchema.pre('findOneAndUpdate', appendOnlyGuard);
walletTransactionSchema.pre('updateOne', appendOnlyGuard);
walletTransactionSchema.pre('updateMany', appendOnlyGuard);

// Required index for transaction history queries
walletTransactionSchema.index({ userId: 1, createdAt: -1 });

// For idempotency lookups
walletTransactionSchema.index({ idempotencyKey: 1 }, { sparse: true });

// For admin monitoring filters
walletTransactionSchema.index({ referenceType: 1, status: 1 });

export const WalletTransaction: Model<IWalletTransaction> =
  mongoose.models.WalletTransaction ||
  mongoose.model<IWalletTransaction>('WalletTransaction', walletTransactionSchema);
