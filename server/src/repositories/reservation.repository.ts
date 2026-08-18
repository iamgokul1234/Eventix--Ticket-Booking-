import mongoose, { ClientSession } from 'mongoose';
import { Reservation, IReservation } from '../models/Reservation';
import { ReservationStatus } from '../constants/enums';

export async function createReservationRecord(
  data: {
    _id?: mongoose.Types.ObjectId | string;
    userId: mongoose.Types.ObjectId | string;
    eventId: mongoose.Types.ObjectId | string;
    seatIds: (mongoose.Types.ObjectId | string)[];
    expiresAt: Date;
    status?: ReservationStatus;
  },
  session?: ClientSession
): Promise<IReservation> {
  const [doc] = await Reservation.create(
    [
      {
        ...data,
        status: data.status || ReservationStatus.ACTIVE,
      },
    ],
    { session }
  );
  return doc;
}

export async function findReservationById(
  id: string,
  session?: ClientSession
): Promise<IReservation | null> {
  return Reservation.findById(id).session(session || null).exec();
}

export async function updateReservationStatus(
  id: string,
  status: ReservationStatus,
  session?: ClientSession
): Promise<IReservation | null> {
  return Reservation.findByIdAndUpdate(
    id,
    { $set: { status } },
    { new: true, session: session || null }
  ).exec();
}

export async function findExpiredActiveReservations(
  now = new Date(),
  eventId?: string
): Promise<IReservation[]> {
  const query: Record<string, unknown> = {
    status: ReservationStatus.ACTIVE,
    expiresAt: { $lte: now },
  };
  if (eventId) {
    query.eventId = eventId;
  }
  return Reservation.find(query).exec();
}
