/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Admin Settings — system configuration for Leish! Aesthetic Marketplace.
 * View and manage environment settings, admin accounts, and system health.
 */
import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Globe,
  Database,
  Mail,
  Bell,
  Save,
} from 'lucide-react';

interface SettingRowProps {
  label: string;
  description: string;
  value: string;
  icon: React.ElementType;
  editable?: boolean;
}

function SettingRow({ label, description, value, icon: Icon, editable }: SettingRowProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  return (
    <div className="rounded-xl border border-line bg-inset p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-accent-text" />
          <span className="text-sm font-medium text-fg">{label}</span>
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="rounded-lg border border-line bg-inset px-2 py-1 text-xs text-fg-muted hover:text-fg transition-colors"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        )}
      </div>
      <p className="text-xs text-fg-muted mb-3">{description}</p>
      {editing ? (
        <div className="flex gap-2">
          <input
            type="text"
            defaultValue={inputValue}
            onChange={e => setInputValue(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-accent-strong focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setInputValue(value);
              setEditing(false);
            }}
            className="rounded-lg border border-line bg-inset px-3 py-2 text-xs text-fg-muted hover:bg-surface transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
            }}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition-colors"
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            Save
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-mono text-fg">
          {value}
        </div>
      )}
    </div>
  );
}

export default function AdminSettings() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-fg">System Settings</h2>
          <p className="text-xs text-fg-muted">Configure marketplace settings and review system health.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SettingRow
          label="Site URL"
          description="Canonical production domain used for auth callbacks and email links."
          value="https://leish.my"
          icon={Globe}
          editable
        />
        <SettingRow
          label="Store Backend"
          description="Durable persistence backend for production data."
          value="supabase"
          icon={Database}
        />
        <SettingRow
          label="Auth Provider"
          description="Authentication method for user accounts."
          value="Supabase Auth (password + OAuth)"
          icon={Lock}
        />
        <SettingRow
          label="Email Service"
          description="Transactional email provider for OTP and confirmations."
          value="Brevo (configured)"
          icon={Mail}
        />
        <SettingRow
          label="Rate Limiting"
          description="Write operations limited to 20/min per IP; verification 10/10min."
          value="Active"
          icon={Bell}
        />
        <SettingRow
          label="Admin Accounts"
          description="Bootstrap admin: shamel@leish.my / lindan95 (fallback)."
          value="1 admin account"
          icon={ShieldCheck}
        />
      </div>

      <div className="mt-8 rounded-2xl border border-line bg-panel p-6">
        <h3 className="font-serif text-lg font-semibold text-fg mb-4">Danger Zone</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl border border-danger-border/30 bg-danger-surface/40">
            <div>
              <p className="text-sm font-medium text-danger">Reset Marketplace Data</p>
              <p className="text-xs text-fg-muted">Delete all salons, bookings, and reviews. Admin accounts are preserved.</p>
            </div>
            <button
              type="button"
              className="text-xs font-medium text-danger hover:text-danger/80 transition-colors"
            >
              Reset Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}