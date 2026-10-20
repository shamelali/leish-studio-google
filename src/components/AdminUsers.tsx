/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Search, Save, AlertCircle, CheckCircle2, Users, Trash2 } from 'lucide-react';
import type { Salon, User } from '../types';
import { useUsers, useUpdateUser, useDeleteUser, useSalons } from '../lib/api';

interface AdminUsersProps {
  currentUser: User | null;
  onOpenAuth: (mode?: 'signin' | 'signup', prompt?: string) => void;
}

type Role = 'client' | 'MUA' | 'studio' | 'admin';

interface RowEdit {
  role: Role;
  salonId: string;
}

function editOf(user: User): RowEdit {
  return {
    role: (['client', 'MUA', 'studio', 'admin'] as const).includes(user.role as Role)
      ? (user.role as Role)
      : 'client',
    salonId: user.salonId ?? '',
  };
}

export function matchesAdminUserSearch(user: User, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [user.name, user.email, user.id, user.salonId ?? ''].some(value =>
    value.trim().toLowerCase().includes(normalizedQuery),
  );
}

export default function AdminUsers({ currentUser, onOpenAuth }: AdminUsersProps) {
  const isAdmin = currentUser?.role === 'admin';
  const { data: users = [], isLoading, error: loadError } = useUsers(isAdmin);
  const { data: salons = [] } = useSalons();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const [query, setQuery] = useState('');
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const filtered = useMemo(() => {
    const list = (users as User[]).slice().sort((a, b) => a.email.localeCompare(b.email));
    return list.filter(user => matchesAdminUserSearch(user, query));
  }, [users, query]);

  if (!currentUser || !isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 rounded-3xl border border-line bg-recessed p-8 text-center">
        <ShieldCheck className="h-8 w-8 mx-auto mb-3 text-accent-text" />
        <h2 className="font-serif text-2xl text-fg mb-2">Administrator Area</h2>
        <p className="text-sm text-fg-muted mb-5">Sign in with an administrator account to manage users.</p>
        <button
          type="button"
          onClick={() => onOpenAuth('signin', 'Administrator sign-in required.')}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors"
        >
          Sign In
        </button>
      </div>
    );
  }

  const setRowEdit = (id: string, patch: Partial<RowEdit>) => {
    setNotice(null);
    setEdits(previous => ({ ...previous, [id]: { ...editOf(users.find((u: User) => u.id === id) as User), ...previous[id], ...patch } }));
  };

  const isDirty = (user: User) => {
    const edit = edits[user.id];
    if (!edit) return false;
    const base = editOf(user);
    return edit.role !== base.role || edit.salonId !== base.salonId;
  };

  const saveRow = async (user: User) => {
    const edit = edits[user.id];
    if (!edit) return;
    setNotice(null);
    try {
      await updateUser.mutateAsync({
        id: user.id,
        data: { role: edit.role, salonId: edit.salonId ? edit.salonId : null },
      });
      setEdits(previous => {
        const next = { ...previous };
        delete next[user.id];
        return next;
      });
      setNotice({ kind: 'success', text: `Updated ${user.email}.` });
    } catch (err: any) {
      setNotice({ kind: 'error', text: err.message || `Could not update ${user.email}.` });
    }
  };

  const removeRow = async (user: User) => {
    if (confirmDeleteId !== user.id) {
      setNotice(null);
      setConfirmDeleteId(user.id);
      return;
    }
    setConfirmDeleteId(null);
    setNotice(null);
    try {
      await deleteUser.mutateAsync(user.id);
      setNotice({ kind: 'success', text: `Deleted ${user.email}.` });
    } catch (err: any) {
      setNotice({ kind: 'error', text: err.message || `Could not delete ${user.email}.` });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto px-4 py-8"
    >
      <div className="flex items-center space-x-2.5 mb-1">
        <Users className="h-5 w-5 text-accent-text" />
        <h2 className="font-serif text-2xl text-fg">All Users</h2>
        <span className="text-xs font-mono text-fg-dim">{(users as User[]).length} accounts</span>
      </div>
      <p className="text-xs text-fg-muted mb-5">Change roles, link artists and studio operators to listings, or unlink them. Select Save to apply changes. The IDs below show the saved account details.</p>

      <div className="mb-4">
        <div className="relative w-full max-w-sm">
          <Search aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-dim" />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search name, email, or ID…"
            aria-label="Search users by name, email, account ID, or linked listing ID"
            aria-describedby="admin-user-search-help"
            className="w-full rounded-xl border border-line bg-inset py-2.5 pl-10 pr-3 text-sm text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none"
          />
        </div>
        <p id="admin-user-search-help" className="mt-1.5 pl-1 text-xs text-fg-muted">Search loaded accounts by name, email, account ID, or linked listing ID.</p>
      </div>

      {notice && (
        <div className={`mb-4 flex items-center space-x-2 rounded-xl border p-3 text-xs ${
          notice.kind === 'error'
            ? 'border-danger-border/30 bg-danger-surface/40 text-danger'
            : 'border-success-border/30 bg-success-surface/40 text-success'
        }`}>
          {notice.kind === 'error'
            ? <AlertCircle className="h-4 w-4 shrink-0" />
            : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-fg-muted">Loading accounts…</p>
      ) : loadError ? (
        <p className="text-sm text-danger">Could not load accounts. Your session may have expired — sign in again.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-fg-muted">No accounts match.</p>
      ) : (
        <div className="rounded-2xl border border-line overflow-hidden">
          <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)_90px_44px] gap-3 px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider text-fg-dim bg-panel-mid border-b border-line">
            <span>Account</span><span>Role</span><span>Listing</span><span /><span />
          </div>
          {filtered.map((user: User) => {
            const edit = edits[user.id] ?? editOf(user);
            const dirty = isDirty(user);
            const saving = updateUser.isPending && dirty;
            const isProvider = user.role === 'MUA' || user.role === 'studio';
            const hasSelectedListing = edit.salonId && (salons as Salon[]).some(salon => salon.id === edit.salonId);
            return (
              <div key={user.id} className="grid sm:grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)_90px_44px] gap-3 items-center px-4 py-3 border-b border-line last:border-0 bg-recessed">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg truncate">{user.name}</p>
                  <p className="text-xs font-mono text-fg-muted truncate">{user.email}</p>
                  <p className="mt-1 text-xs leading-4 text-fg-muted">
                    <span>{user.role === 'MUA' ? 'MUA account ID' : 'Account ID'}: </span>
                    <span className="font-mono text-fg-muted break-all select-text">{user.id}</span>
                  </p>
                </div>
                <select
                  value={edit.role}
                  onChange={event => setRowEdit(user.id, { role: event.target.value as Role })}
                  aria-label={`Role for ${user.email}`}
                  disabled={user.id === currentUser.id}
                  title={user.id === currentUser.id ? 'Your own role cannot be changed here' : undefined}
                  className="w-full min-w-0 rounded-lg border border-line bg-inset px-2 py-2 text-xs text-fg focus:border-accent-strong focus:outline-none disabled:opacity-50"
                >
                  <option value="client">Client</option>
                  <option value="MUA">Makeup Artist (MUA)</option>
                  <option value="studio">Studio Operator</option>
                  <option value="admin">Admin</option>
                </select>
                <div className="min-w-0">
                  <select
                    value={edit.salonId}
                    onChange={event => setRowEdit(user.id, { salonId: event.target.value })}
                    aria-label={`Listing for ${user.email}`}
                    className="w-full min-w-0 rounded-lg border border-line bg-inset px-2 py-2 text-xs text-fg focus:border-accent-strong focus:outline-none"
                  >
                    <option value="">No listing</option>
                    {!hasSelectedListing && edit.salonId && (
                      <option value={edit.salonId}>Listing not loaded ({edit.salonId})</option>
                    )}
                    {(salons as Salon[]).map(salon => (
                      <option key={salon.id} value={salon.id}>{salon.name}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs leading-4 text-fg-muted">
                    <span>Linked listing ID: </span>
                    <span className="font-mono text-fg-muted break-all select-text">
                      {user.salonId || (isProvider ? 'Not linked yet' : '—')}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => saveRow(user)}
                  disabled={!dirty || updateUser.isPending}
                  className="flex items-center justify-center space-x-1 rounded-lg border border-line px-2 py-2 text-xs text-fg-muted hover:bg-surface hover:text-fg transition-colors disabled:opacity-40"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{saving ? 'Saving…' : 'Save'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(user)}
                  disabled={deleteUser.isPending || user.id === currentUser.id}
                  title={
                    user.id === currentUser.id
                      ? 'You cannot delete your own account'
                      : confirmDeleteId === user.id
                        ? `Click again to permanently delete ${user.email}`
                        : `Delete ${user.email}`
                  }
                  aria-label={
                    confirmDeleteId === user.id ? `Confirm deletion of ${user.email}` : `Delete ${user.email}`
                  }
                  className={`flex items-center justify-center rounded-lg border px-2 py-2 transition-colors disabled:opacity-40 ${
                    confirmDeleteId === user.id
                      ? 'border-danger-border/50 bg-danger-surface/40 text-danger hover:bg-danger-surface/60'
                      : 'border-line text-fg-muted hover:bg-surface hover:text-danger'
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
