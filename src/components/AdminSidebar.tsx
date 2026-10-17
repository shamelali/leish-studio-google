/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Comprehensive admin sidebar panel for Leish! Aesthetic Marketplace.
 * Renders when activeTab === 'admin'. Provides navigation between
 * admin sections: Dashboard, Users, Salons, Bookings, Reviews, Settings.
 */
import React, { useState, useCallback } from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  Calendar,
  MessageCircle,
  Settings,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Activity,
  TrendingUp,
} from 'lucide-react';
import { useStore } from '../lib/store';

interface AdminSidebarProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
  onOpenAuth: (mode: 'signin' | 'signup') => void;
}

interface AdminNavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  count?: number;
}

const ADMIN_ITEMS: AdminNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'salons', label: 'Salons', icon: Building2 },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'reviews', label: 'Reviews', icon: MessageCircle },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function AdminSidebar({
  activeSection,
  setActiveSection,
  onOpenAuth,
}: AdminSidebarProps) {
  const { currentUser, logout } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const isAdmin = currentUser?.role === 'admin';

  const goSection = useCallback(
    (section: string) => {
      setActiveSection(section);
    },
    [setActiveSection],
  );

  const handleSignOut = () => {
    logout();
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 ${
        collapsed
          ? 'w-16'
          : 'w-64 border-r border-line bg-recessed shadow-elevation-2'
      }`}
    >
      {/* Collapsed state: icon-only rail */}
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center justify-center border-b border-line bg-inset">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-8 h-8 items-center justify-center rounded-lg text-fg-muted hover:bg-surface hover:text-fg transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
          {!collapsed && (
            <div className="ml-2 flex h-8 items-center">
              <ShieldCheck className="h-5 w-5 text-brand-gold" />
              <span className="ml-1.5 font-serif font-bold text-xs tracking-wider text-brand-champagne">
                LEISH
              </span>
            </div>
          )}
        </div>

        <nav
          className="flex-1 py-4 overflow-y-auto"
          aria-label="Admin navigation"
        >
          {collapsed ? (
            <div className="space-y-1 px-2">
              {ADMIN_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goSection(item.id)}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex h-10 w-full items-center justify-center rounded-lg transition-colors ${
                      isActive
                        ? 'bg-brand-gold/20 text-brand-gold'
                        : 'text-fg-muted hover:bg-surface hover:text-fg'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                );
              })}
              <div className="mt-6 pt-4 border-t border-line px-2">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex h-10 w-full items-center justify-center rounded-lg text-fg-muted hover:bg-surface hover:text-danger transition-colors"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1 px-3">
                {ADMIN_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => goSection(item.id)}
                      aria-label={item.label}
                      aria-current={isActive ? 'page' : undefined}
                      className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                        isActive
                          ? 'bg-brand-gold/20 text-brand-gold border border-brand-gold/30'
                          : 'text-fg-muted hover:bg-surface hover:text-fg'
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className={isActive ? 'font-semibold' : ''}>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-8 px-3 space-y-1">
                <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-dim">
                  Account
                </p>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-fg-muted hover:bg-surface hover:text-danger transition-colors"
                >
                  <LogOut className="h-5 w-5 shrink-0" />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          )}
        </nav>

        {/* Admin status badge (expanded only) */}
        {!collapsed && (
          <div className="px-4 py-3 border-t border-line bg-inset">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-success" />
              <span className="text-xs font-mono text-fg-muted">
                {currentUser?.name || 'Administrator'}
              </span>
            </div>
            <p className="mt-1 text-[10px] font-mono text-fg-dim">
              {currentUser?.email || ''}
            </p>
          </div>
        )}
      </div>

      {/* Mobile overlay backdrop — hidden on desktop, shown on mobile */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
        onClick={() => setCollapsed(false)}
        aria-hidden="true"
      />
    </aside>
  );
}