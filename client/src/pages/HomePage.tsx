import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { eventApi } from '../services/api';
import { Event } from '../types';
import { formatPaiseToRupees, formatDate, getStatusBadgeClass } from '../utils/formatters';
import { Search, MapPin, Calendar, Ticket, Sparkles, ArrowRight, Loader2 } from 'lucide-react';

export const HomePage: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await eventApi.getEvents();
        if (res.success && res.data.events) {
          setEvents(res.data.events);
        }
      } catch (err) {
        console.error('Failed to fetch events:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchEvents();
  }, []);

  const filteredEvents = events.filter(
    (event) =>
      event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.venue.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-800/80 bg-gradient-to-b from-slate-900/90 via-slate-950 to-slate-950 py-16 sm:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/20 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold mb-6">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span>Atomic Concurrency Guarantee & Real-Time Wallet Settlement</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight">
            Book Live Events With <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-emerald-400 bg-clip-text text-transparent">
              Zero Double-Booking
            </span>
          </h1>

          <p className="mt-4 text-slate-400 text-sm sm:text-base max-w-2xl mx-auto">
            Experience high-scale ticket reservations protected by 5-minute atomic holds, append-only ledger transaction tracking, and instant automated refunds.
          </p>

          {/* Search Bar */}
          <div className="mt-8 max-w-xl mx-auto relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search concerts, shows, venues..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all shadow-xl text-sm"
            />
          </div>
        </div>
      </section>

      {/* Events Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Upcoming Events</h2>
            <p className="text-xs text-slate-400 mt-1">Select an event to view interactive seat maps</p>
          </div>
          <span className="text-xs font-medium text-slate-400 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
            Showing {filteredEvents.length} Events
          </span>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500 mb-3" />
            <p className="text-sm">Loading available events...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800">
            <Ticket className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-300">No Events Found</h3>
            <p className="text-xs text-slate-500 mt-1">Try adjusting your search criteria</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map((event) => (
              <div
                key={event._id}
                className="group relative bg-slate-900/60 rounded-2xl border border-slate-800/80 hover:border-violet-500/50 transition-all duration-300 flex flex-col overflow-hidden hover:shadow-2xl hover:shadow-violet-500/10"
              >
                {/* Event Header Banner */}
                <div className="h-44 bg-gradient-to-br from-violet-900/40 via-indigo-900/20 to-slate-900 p-5 flex flex-col justify-between relative">
                  <div className="flex items-center justify-between z-10">
                    <span
                      className={`text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full border ${getStatusBadgeClass(
                        event.status
                      )}`}
                    >
                      {event.status}
                    </span>
                    <span className="text-xs font-semibold bg-slate-950/80 text-emerald-400 px-3 py-1 rounded-xl border border-slate-800">
                      {formatPaiseToRupees(event.price)} / seat
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white group-hover:text-violet-300 transition-colors z-10 line-clamp-2">
                    {event.title}
                  </h3>
                </div>

                {/* Event Details */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div className="space-y-2.5 mb-6 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-violet-400 shrink-0" />
                      <span className="truncate">{event.venue}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>
                        {formatDate(event.eventDate)} at {event.eventTime}
                      </span>
                    </div>
                    {event.availableSeats !== undefined && (
                      <div className="flex items-center gap-2">
                        <Ticket className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="font-semibold text-emerald-400">
                          {event.availableSeats} / {event.totalSeats} seats available
                        </span>
                      </div>
                    )}
                  </div>

                  <Link
                    to={`/events/${event._id}`}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-violet-600 text-slate-200 hover:text-white font-semibold text-xs transition-all duration-200 flex items-center justify-center gap-2 group-hover:shadow-lg group-hover:shadow-violet-600/25"
                  >
                    <span>Select Seats</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
