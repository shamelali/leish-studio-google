/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Admin Bookings — view and manage all bookings across the marketplace.
 * Admins can see every booking and update status or delete.
 */
import React, { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBookings, bookingsApi, adminBookingsApi } from '../lib/api';
import type { Booking } from '../types';
import {
  Calendar as CalendarIcon,
  Trash2 as TrashIcon,
  Save as SaveIcon,
} from 'lucide-react';

const STATUS_CONFIG: Record<Booking['status'], { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'text-warning', bg: 'bg-warning-surface/40' },
  confirmed: { label: 'Confirmed', color: 'text-success', bg: 'bg-success-surface/40' },
  completed: { label: 'Completed', color: 'text-emerald', bg: 'bg-emerald-surface/40' },
  cancelled: { label: 'Cancelled', color: 'text-danger', bg: 'bg-danger-surface/40' },
};

interface BookingRowProps {
  booking: Booking;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: Booking['status']) => void;
  isDeleting: boolean;
  isUpdating: boolean;
}

function BookingRow({ booking, onDelete, onStatusChange, isDeleting, isUpdating }: BookingRowProps) {
  const config = STATUS_CONFIG[booking.status];
  const [newStatus, setNewStatus] = useState<Booking['status']>(booking.status);

  const handleStatusChange = async () => {
    if (newStatus === booking.status) return;
    onStatusChange(booking.id, newStatus);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete booking #${booking.id.slice(-8)} for ${booking.clientName}?`)) return;
    onDelete(booking.id);
  };

  return (
    <div className="px-4 py-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg truncate">{booking.clientName}</p>
          <p className="text-xs font-mono text-fg-muted truncate">{booking.clientEmail}</p>
          <p className="text-xs text-fg-muted truncate">
            {booking.salonName} • {booking.serviceName} • {booking.date} {booking.time}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={newStatus}
            onChange={e => setNewStatus(e.target.value as Booking['status'])}
            className={`rounded-lg border px-2 py-1.5 text-xs transition-colors ${
              config.bg
              } ${config.color} border-${config.color.replace('text-', '')}/30`}
          >
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key as Booking['status']}>
                {cfg.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleStatusChange}
            disabled={isUpdating}
            className="rounded-lg border border-line bg-inset px-2.5 py-1.5 text-xs text-fg-muted hover:bg-surface transition-colors disabled:opacity-50"
          >
            <SaveIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="rounded-lg border border-line bg-inset px-2.5 py-1.5 text-xs text-fg-muted hover:bg-danger-surface/40 hover:text-danger transition-colors disabled:opacity-50"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminBookings() {
  const { data: bookings = [], isLoading } = useBookings();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const bookingList = bookings as Booking[];

  const handleStatusChange = useCallback(async (id: string, status: Booking['status']) => {
    setUpdating(prev => new Set([...prev, id]));
    setNotice(null);
    try {
      await bookingsApi.updateStatus(id, status);
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setNotice({ kind: 'success', text: `Booking status updated to ${status}.` });
    } catch (err: unknown) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not update booking status.',
      });
    } finally {
      setUpdating(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [queryClient]);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(prev => new Set([...prev, id]));
    setNotice(null);
    try {
      await adminBookingsApi.remove(id);
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setNotice({ kind: 'success', text: 'Booking deleted.' });
    } catch (err: unknown) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not delete booking.',
      });
    } finally {
      setDeleting(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h2 className="font-serif text-2xl text-fg mb-6">Booking Management</h2>
        <div className="h-32 rounded-2xl border border-line bg-panel animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-fg">Booking Management</h2>
          <p className="text-xs text-fg-muted">View all marketplace bookings and update status.</p>
        </div>
        {notice && (
          <div className={`flex items-center space-x-2 rounded-xl border p-3 text-xs ${
            notice.kind === 'error'
              ? 'border-danger-border/30 bg-danger-surface/40 text-danger'
              : 'border-success-border/30 bg-success-surface/40 text-success'
          }`}>
            {notice.kind === 'error' ? <TrashIcon className="h-4 w-4 shrink-0" /> : <SaveIcon className="h-4 w-4 shrink-0" />}
            <span>{notice.text}</span>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-line overflow-hidden">
        <div className="border-b border-line bg-panel-mid px-4 py-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-accent-text" />
            <span className="text-xs font-mono uppercase tracking-widest text-fg-dim">{bookingList.length} Bookings</span>
          </div>
        </div>

        <div className="divide-y divide-line">
          {bookingList.map(booking => (
            <BookingRow
              key={booking.id}
              booking={booking}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
              isDeleting={deleting.has(booking.id)}
              isUpdating={updating.has(booking.id)}
            />
          ))}
          {bookingList.length === 0 && (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-fg-muted">No bookings found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
