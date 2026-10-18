/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Admin Dashboard — overview statistics for Leish! Aesthetic Marketplace.
 * Shows key metrics: users, salons, bookings, reviews with quick actions.
 */
import React, { useCallback } from 'react';
import { useStore } from '../lib/store';
import { useUsers, useSalons, useBookings } from '../lib/api';
import type { User, Salon, Booking } from '../types';
import {
  Users as UsersIcon,
  Building2 as BuildingIcon,
  Calendar as CalendarIcon,
  ShieldCheck as ShieldIcon,
  TrendingUp,
} from 'lucide-react';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ElementType;
  trend?: string;
  accent?: string;
}

function StatCard({ label, value, icon: Icon, trend, accent }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-fg-dim">{label}</p>
          <p className="mt-1 font-serif text-2xl font-semibold text-fg">{value}</p>
          {trend && (
            <p className="text-xs font-mono text-accent-text">
              <TrendingUp className="h-3.5 w-3.5 inline mr-1" /> {trend}
            </p>
          )}
        </div>
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center text-fg-muted ${accent || ''}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { currentUser } = useStore();
  const isAdmin = currentUser?.role === 'admin';

  const { data: users = [], isLoading: usersLoading } = useUsers(isAdmin);
  const { data: salons = [], isLoading: salonsLoading } = useSalons();
  const { data: bookings = [], isLoading: bookingsLoading } = useBookings();

  const loading = usersLoading || salonsLoading || bookingsLoading;

  const userList = users as User[];
  const salonList = salons as Salon[];
  const bookingList = bookings as Booking[];

  const totalUsers = userList.length;
  const totalAdmins = userList.filter(u => u.role === 'admin').length;
  const totalStudios = userList.filter(u => u.role === 'studio').length;
  const totalClients = userList.filter(u => u.role === 'client').length;
  const totalSalons = salonList.length;
  const featuredSalons = salonList.filter(s => s.featured).length;
  const totalBookings = bookingList.length;
  const pendingBookings = bookingList.filter(b => b.status === 'pending').length;
  const confirmedBookings = bookingList.filter(b => b.status === 'confirmed').length;

  const handleViewSection = useCallback((section: string) => {
    void section;
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h2 className="font-serif text-2xl text-fg mb-6">Dashboard</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-2xl border border-line bg-panel p-4 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-fg">Dashboard</h2>
          <p className="text-xs text-fg-muted">Marketplace overview — {new Date().toLocaleDateString()}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleViewSection('users')}
            className="rounded-xl border border-line bg-inset px-3 py-2 text-xs text-fg-muted hover:text-fg transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Users"
          value={totalUsers}
          icon={UsersIcon}
          trend={totalClients > 0 ? `+${totalClients} clients` : undefined}
          accent="bg-blue-surface/40 text-blue"
        />
        <StatCard
          label="Salons"
          value={totalSalons}
          icon={BuildingIcon}
          trend={featuredSalons > 0 ? `${featuredSalons} featured` : undefined}
          accent="bg-emerald-surface/40 text-emerald"
        />
        <StatCard
          label="Bookings"
          value={totalBookings}
          icon={CalendarIcon}
          trend={`${confirmedBookings} confirmed`}
          accent="bg-rose-surface/40 text-rose"
        />
        <StatCard
          label="Admins"
          value={totalAdmins}
          icon={ShieldIcon}
          trend={totalAdmins === 1 ? 'Single admin — add another' : undefined}
          accent="bg-warning-surface/40 text-warning"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-line bg-panel p-6">
          <h3 className="font-serif text-lg font-semibold text-fg mb-4">User Roles</h3>
          <div className="space-y-3">
            {[
              ['admin', totalAdmins] as [string, number],
              ['provider', totalProviders] as [string, number],
              ['client', totalClients] as [string, number],
            ].map(([role, count]) => {
              const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
              const countStr = String(count);
              return (
                <div
                  key={role}
                  className="flex items-center justify-between py-2 border-b border-inset last:border-0"
                >
                  <span className="text-sm text-fg">{roleLabel}</span>
                  <span className="text-xs font-mono font-bold text-fg-muted">
                    {countStr}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-6">
          <h3 className="font-serif text-lg font-semibold text-fg mb-4">Booking Status</h3>
          <div className="space-y-3">
            {[
              ['pending', pendingBookings] as [string, number],
              ['confirmed', confirmedBookings] as [string, number],
            ].map(([status, count]) => {
              const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
              const countStr = String(count);
              return (
                <div
                  key={status}
                  className="flex items-center justify-between py-2 border-b border-inset last:border-0"
                >
                  <span className="text-sm text-fg">{statusLabel}</span>
                  <span className="text-xs font-mono font-bold text-fg-muted">
                    {countStr}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-line bg-panel p-6">
        <h3 className="font-serif text-lg font-semibold text-fg mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => handleViewSection('users')}
            className="flex flex-col items-center gap-2 rounded-xl border border-line bg-inset p-4 text-left hover:bg-surface transition-colors"
          >
            <UsersIcon className="h-5 w-5 text-accent-text" />
            <span className="text-xs font-medium text-fg">Manage Users</span>
          </button>
          <button
            type="button"
            onClick={() => handleViewSection('salons')}
            className="flex flex-col items-center gap-2 rounded-xl border border-line bg-inset p-4 text-left hover:bg-surface transition-colors"
          >
            <BuildingIcon className="h-5 w-5 text-accent-text" />
            <span className="text-xs font-medium text-fg">Manage Salons</span>
          </button>
          <button
            type="button"
            onClick={() => handleViewSection('bookings')}
            className="flex flex-col items-center gap-2 rounded-xl border border-line bg-inset p-4 text-left hover:bg-surface transition-colors"
          >
            <CalendarIcon className="h-5 w-5 text-accent-text" />
            <span className="text-xs font-medium text-fg">Manage Bookings</span>
          </button>
        </div>
      </div>
    </div>
  );
}