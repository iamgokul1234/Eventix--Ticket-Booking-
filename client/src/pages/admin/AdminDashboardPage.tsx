import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/api';
import { SystemMetrics, Event, Booking, WalletTransaction, EventStatus, PopulatedUser, AdminUserSummary } from '../../types';
import { useToast } from '../../context/ToastContext';
import { formatPaiseToRupees, formatDateTime, getStatusBadgeClass } from '../../utils/formatters';
import {
  Users,
  Calendar,
  TicketCheck,
  DollarSign,
  Clock,
  ShieldCheck,
  Plus,
  RotateCcw,
  Loader2,
  Edit3,
  CheckCircle,
  Ban,
  Trash2,
} from 'lucide-react';

export const AdminDashboardPage: React.FC = () => {
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'metrics' | 'events' | 'bookings' | 'transactions'>('metrics');
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // New Event Form Modal State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventVenue, setNewEventVenue] = useState('');
  const [newEventDate, setNewEventDate] = useState('2027-08-01');
  const [newEventTime, setNewEventTime] = useState('19:00');
  const [newEventTotalSeats, setNewEventTotalSeats] = useState(50);
  const [newEventPriceRupees, setNewEventPriceRupees] = useState(250);
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);

  // Edit Event Form Modal State (DRAFT events)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editPriceRupees, setEditPriceRupees] = useState(0);
  const [isUpdatingEvent, setIsUpdatingEvent] = useState(false);

  // Action Loading State
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Transactions user filter
  const [txUserFilter, setTxUserFilter] = useState<string>('');
  // Bookings user filter
  const [bkUserFilter, setBkUserFilter] = useState<string>('');
  const [usersList, setUsersList] = useState<AdminUserSummary[]>([]);

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [mRes, eRes, bRes, tRes, uRes] = await Promise.all([
        adminApi.getMetrics(),
        adminApi.listEvents(),
        adminApi.getBookings(),
        adminApi.getTransactions(),
        adminApi.getUsers({ limit: 200 }),
      ]);

      if (mRes.success) setMetrics(mRes.data);
      if (eRes.success) setEvents(eRes.data.events);
      if (bRes.success) setBookings(bRes.data.bookings);
      if (tRes.success) setTransactions(tRes.data.transactions);
      if (uRes.success) setUsersList(uRes.data.users);
    } catch (err) {
      console.error('Error fetching admin dashboard:', err);
      toast.error('Failed to load admin metrics');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Refetch transactions when user filter changes
  const fetchFilteredTransactions = useCallback(async (userId: string) => {
    try {
      const res = await adminApi.getTransactions({ userId: userId || undefined });
      if (res.success) setTransactions(res.data.transactions);
    } catch (err) {
      console.error('Error filtering transactions:', err);
    }
  }, []);

  // Refetch bookings when user filter changes
  const fetchFilteredBookings = useCallback(async (userId: string) => {
    try {
      const res = await adminApi.getBookings({ userId: userId || undefined });
      if (res.success) setBookings(res.data.bookings);
    } catch (err) {
      console.error('Error filtering bookings:', err);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Create Event Handler
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingEvent(true);
    try {
      const pricePaise = Math.floor(newEventPriceRupees * 100);
      const res = await adminApi.createEvent({
        title: newEventTitle,
        description: newEventDesc,
        venue: newEventVenue,
        eventDate: newEventDate,
        eventTime: newEventTime,
        totalSeats: newEventTotalSeats,
        price: pricePaise,
      });

      if (res.success && res.data.event) {
        // Auto-generate seats
        const seatArray = Array.from({ length: newEventTotalSeats }, (_, i) => ({
          seatNumber: `S${i + 1}`,
          price: pricePaise,
        }));
        await adminApi.bulkCreateSeats(res.data.event._id, seatArray);

        toast.success('Event & Seats Created', `Created "${res.data.event.title}" with ${newEventTotalSeats} seats.`);
        setShowCreateModal(false);
        await fetchDashboardData();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error('Event Creation Failed', msg || 'Could not create event');
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (ev: Event) => {
    setEditingEvent(ev);
    setEditTitle(ev.title);
    setEditDesc(ev.description || '');
    setEditVenue(ev.venue);
    setEditDate(ev.eventDate);
    setEditTime(ev.eventTime);
    setEditPriceRupees(ev.price / 100);
  };

  // Update DRAFT Event Handler
  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;
    setIsUpdatingEvent(true);
    try {
      const res = await adminApi.updateEvent(editingEvent._id, {
        title: editTitle,
        description: editDesc,
        venue: editVenue,
        eventDate: editDate,
        eventTime: editTime,
        price: Math.floor(editPriceRupees * 100),
      });

      if (res.success) {
        toast.success('Event Updated', `Updated "${editTitle}".`);
        setEditingEvent(null);
        await fetchDashboardData();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error('Update Failed', msg || 'Unable to update DRAFT event');
    } finally {
      setIsUpdatingEvent(false);
    }
  };

  // Publish Event Handler (DRAFT -> PUBLISHED)
  const handlePublishEvent = async (eventId: string) => {
    setActionLoadingId(eventId);
    try {
      const res = await adminApi.publishEvent(eventId);
      if (res.success) {
        toast.success('Event Published!', 'Event is now live for user reservations.');
        await fetchDashboardData();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error('Publish Failed', msg || 'Unable to publish event');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Cancel Event Handler (PUBLISHED -> CANCELLED)
  const handleCancelEvent = async (eventId: string) => {
    if (!window.confirm('Are you sure you want to cancel this event? Active reservations will be invalidated.')) {
      return;
    }
    setActionLoadingId(eventId);
    try {
      const res = await adminApi.cancelEvent(eventId);
      if (res.success) {
        toast.success('Event Cancelled', 'Event status updated to CANCELLED.');
        await fetchDashboardData();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error('Cancel Event Failed', msg || 'Unable to cancel event');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Delete Event Handler (DRAFT only)
  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm('Are you sure you want to delete this DRAFT event and its seats?')) {
      return;
    }
    setActionLoadingId(eventId);
    try {
      const res = await adminApi.deleteEvent(eventId);
      if (res.success) {
        toast.success('Event Deleted', 'DRAFT event and seats removed.');
        await fetchDashboardData();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error('Delete Failed', msg || 'Unable to delete event');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Admin Refund Handler
  const handleAdminRefund = async (bookingId: string) => {
    setActionLoadingId(bookingId);
    try {
      const res = await adminApi.refundBooking(bookingId);
      if (res.success) {
        toast.success(
          'Admin Refund Processed',
          `Refunded ${formatPaiseToRupees(res.data.refundAmount)} to owner wallet.`
        );
        await fetchDashboardData();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error('Admin Refund Failed', msg || 'Unable to refund booking');
    } finally {
      setActionLoadingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
        <p className="text-sm">Loading admin dashboard metrics...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Admin Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold mb-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admin Control Center</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white">System Operations & Monitoring</h1>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 hover:opacity-90 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Event</span>
          </button>
        </div>

        {/* System Metrics Cards */}
        {metrics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Total Users</span>
                <Users className="w-4 h-4 text-violet-400" />
              </div>
              <div className="text-2xl font-extrabold text-white">{metrics?.users?.total ?? 0}</div>
            </div>

            <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Active Events</span>
                <Calendar className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-2xl font-extrabold text-white">
                {metrics?.events?.byStatus?.[EventStatus.PUBLISHED] ?? metrics?.events?.total ?? 0}
              </div>
            </div>

            <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Total Bookings</span>
                <TicketCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-extrabold text-white">{metrics?.bookings?.total ?? 0}</div>
            </div>

            <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Active Holds</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-extrabold text-white">{metrics?.reservations?.active ?? 0}</div>
            </div>

            <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800 col-span-1 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Total Revenue</span>
                <DollarSign className="w-4 h-4 text-teal-400" />
              </div>
              <div className="text-xl font-extrabold text-emerald-400">
                {formatPaiseToRupees(metrics?.revenue?.netRevenue ?? 0)}
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto border-b border-slate-800 gap-4 sm:gap-6 text-xs font-semibold scrollbar-none pb-0.5">
          {[
            { key: 'events', label: `Events (${events.length})` },
            { key: 'bookings', label: `Bookings & Refunds (${bookings.length})` },
            { key: 'transactions', label: `Transactions (${transactions.length})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as 'events' | 'bookings' | 'transactions')}
              className={`pb-3 transition-colors border-b-2 whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content: Events CRUD & Actions */}
        {activeTab === 'events' && (
          <div className="space-y-4">
            <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Title</th>
                      <th className="py-3 px-4">Venue</th>
                      <th className="py-3 px-4">Date/Time</th>
                      <th className="py-3 px-4">Price</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {events.map((ev) => (
                      <tr key={ev._id} className="hover:bg-slate-850/50">
                        <td className="py-3.5 px-4 font-bold text-white">{ev.title}</td>
                        <td className="py-3.5 px-4 text-slate-400">{ev.venue}</td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {ev.eventDate} at {ev.eventTime}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-emerald-400">
                          {formatPaiseToRupees(ev.price)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(
                              ev.status
                            )}`}
                          >
                            {ev.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2">
                          {ev.status === EventStatus.DRAFT && (
                            <>
                              <button
                                disabled={actionLoadingId === ev._id}
                                onClick={() => openEditModal(ev)}
                                className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold text-[11px] hover:bg-blue-500/20 transition-all inline-flex items-center gap-1"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Edit</span>
                              </button>

                              <button
                                disabled={actionLoadingId === ev._id}
                                onClick={() => handlePublishEvent(ev._id)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold text-[11px] hover:bg-emerald-500/20 transition-all inline-flex items-center gap-1"
                              >
                                {actionLoadingId === ev._id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle className="w-3 h-3" />
                                    <span>Publish</span>
                                  </>
                                )}
                              </button>

                              <button
                                disabled={actionLoadingId === ev._id}
                                onClick={() => handleDeleteEvent(ev._id)}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold text-[11px] hover:bg-rose-500/20 transition-all inline-flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                            </>
                          )}

                          {ev.status === EventStatus.PUBLISHED && (
                            <button
                              disabled={actionLoadingId === ev._id}
                              onClick={() => handleCancelEvent(ev._id)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold text-[11px] hover:bg-amber-500/20 transition-all inline-flex items-center gap-1"
                            >
                              {actionLoadingId === ev._id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <>
                                  <Ban className="w-3 h-3" />
                                  <span>Cancel Event</span>
                                </>
                              )}
                            </button>
                          )}

                          {ev.status === EventStatus.CANCELLED && (
                            <span className="text-[11px] text-slate-500 italic">No Actions</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: Bookings & Admin Refunds */}
        {activeTab === 'bookings' && (
          <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800">
            {/* User filter */}
            <div className="mb-4 flex items-center gap-3">
              <label htmlFor="bk-user-filter" className="text-xs text-slate-400 font-medium whitespace-nowrap">
                Filter by user:
              </label>
              <select
                id="bk-user-filter"
                value={bkUserFilter}
                onChange={(e) => {
                  setBkUserFilter(e.target.value);
                  fetchFilteredBookings(e.target.value);
                }}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-1 focus:ring-violet-500 max-w-xs w-full"
              >
                <option value="">All users</option>
                {usersList.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.email} {u.name ? `(${u.name})` : ''}
                  </option>
                ))}
              </select>
              {bkUserFilter && (
                <button
                  onClick={() => { setBkUserFilter(''); fetchFilteredBookings(''); }}
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Admin Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {bookings.map((bk) => (
                    <tr key={bk._id} className="hover:bg-slate-850/50">
                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        {bk.bookingReference}
                      </td>
                      <td className="py-3.5 px-4 text-[11px]">
                        {typeof bk.userId === 'object' && bk.userId !== null
                          ? <span className="text-sky-400 font-medium">{(bk.userId as PopulatedUser).email}</span>
                          : <span className="font-mono text-slate-400">{bk.userId}</span>}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-emerald-400">
                        {formatPaiseToRupees(bk.amount || (bk as unknown as { totalAmount: number }).totalAmount || 0)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(
                            bk.status
                          )}`}
                        >
                          {bk.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        {formatDateTime(bk.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {bk.status === 'CONFIRMED' ? (
                          <button
                            disabled={actionLoadingId === bk._id}
                            onClick={() => handleAdminRefund(bk._id)}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold text-[11px] hover:bg-rose-500/20 transition-all inline-flex items-center gap-1"
                          >
                            {actionLoadingId === bk._id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                <RotateCcw className="w-3 h-3" />
                                <span>Issue Refund</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">No action available</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Content: Transactions Ledger */}
        {activeTab === 'transactions' && (
          <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800">
            {/* User filter */}
            <div className="mb-4 flex items-center gap-3">
              <label htmlFor="tx-user-filter" className="text-xs text-slate-400 font-medium whitespace-nowrap">
                Filter by user:
              </label>
              <select
                id="tx-user-filter"
                value={txUserFilter}
                onChange={(e) => {
                  setTxUserFilter(e.target.value);
                  fetchFilteredTransactions(e.target.value);
                }}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-1 focus:ring-violet-500 max-w-xs w-full"
              >
                <option value="">All users</option>
                {usersList.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.email} {u.name ? `(${u.name})` : ''}
                  </option>
                ))}
              </select>
              {txUserFilter && (
                <button
                  onClick={() => { setTxUserFilter(''); fetchFilteredTransactions(''); }}
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Date/Time</th>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Before / After</th>
                    <th className="py-3 px-4">Ref Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {transactions.map((tx) => (
                    <tr key={tx._id} className="hover:bg-slate-850/50">
                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        {formatDateTime(tx.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 text-[11px]">
                        {typeof tx.userId === 'object' && tx.userId !== null
                          ? <span className="text-sky-400 font-medium">{(tx.userId as PopulatedUser).email}</span>
                          : <span className="font-mono text-slate-400">{tx.userId}</span>}
                      </td>
                      <td className="py-3.5 px-4 font-bold">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] border ${getStatusBadgeClass(
                            tx.type
                          )}`}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td
                        className={`py-3.5 px-4 font-bold ${
                          tx.type === 'CREDIT' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatPaiseToRupees(tx.amount)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        {formatPaiseToRupees(tx.balanceBefore)} → {formatPaiseToRupees(tx.balanceAfter)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-violet-400">{tx.referenceType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create New Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6">
            <h2 className="text-xl font-bold text-white">Create New Event</h2>
            <form onSubmit={handleCreateEvent} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Event Title</label>
                <input
                  type="text"
                  required
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  placeholder="Rock Concert 2027"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={newEventDesc}
                  onChange={(e) => setNewEventDesc(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  placeholder="Live performance by top artists..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Venue</label>
                  <input
                    type="text"
                    required
                    value={newEventVenue}
                    onChange={(e) => setNewEventVenue(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white"
                    placeholder="Grand Arena, NYC"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={newEventDate}
                    onChange={(e) => setNewEventDate(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Time</label>
                  <input
                    type="text"
                    required
                    value={newEventTime}
                    onChange={(e) => setNewEventTime(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white"
                    placeholder="19:00"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Total Seats</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newEventTotalSeats}
                    onChange={(e) => setNewEventTotalSeats(parseInt(e.target.value) || 50)}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Price (₹)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={newEventPriceRupees}
                    onChange={(e) => setNewEventPriceRupees(parseFloat(e.target.value) || 250)}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEvent}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-2"
                >
                  {isSubmittingEvent ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Create Event</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Event Modal (DRAFT Events) */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6">
            <h2 className="text-xl font-bold text-white">Edit Draft Event</h2>
            <form onSubmit={handleUpdateEvent} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Event Title</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Venue</label>
                  <input
                    type="text"
                    required
                    value={editVenue}
                    onChange={(e) => setEditVenue(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Time</label>
                  <input
                    type="text"
                    required
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Price (₹)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={editPriceRupees}
                    onChange={(e) => setEditPriceRupees(parseFloat(e.target.value) || 0)}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingEvent}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-2"
                >
                  {isUpdatingEvent ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Update Event</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
