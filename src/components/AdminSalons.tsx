/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Admin Salons — full salon management for Leish! Aesthetic Marketplace.
 * Create, edit, feature-toggle, and delete salon listings.
 */
import React, { useState, useCallback } from 'react';
import { useSalons, adminSalonsApi } from '../lib/api';
import type { Salon } from '../types';
import {
  Building2 as BuildingIcon,
  Scissors as ScissorsIcon,
  Trash2 as TrashIcon,
  Save as SaveIcon,
  Plus as PlusIcon,
  Edit3 as EditIcon,
  Star as StarIcon,
} from 'lucide-react';

export default function AdminSalons() {
  const { data: salons = [], isLoading } = useSalons();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<Salon>>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const salonList = salons as Salon[];

  const toggleFeatured = useCallback(async (salon: Salon) => {
    const id = salon.id;
    setSaving(prev => new Set([...prev, id]));
    setNotice(null);
    try {
      await adminSalonsApi.update(id, { featured: !salon.featured });
      setEdits(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setNotice({ kind: 'success', text: `Featured flag toggled for "${salon.name}".` });
    } catch (err: any) {
      setNotice({ kind: 'error', text: err.message || 'Could not toggle featured flag.' });
    } finally {
      setSaving(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const startEdit = (id: string) => {
    const salon = salonList.find(s => s.id === id);
    if (salon) {
      setEdits(prev => ({ ...prev, [id]: { ...salon } }));
      setEditingId(id);
    }
  };

  const saveEdit = async (id: string) => {
    const edit = edits[id];
    if (!edit) return;
    setSaving(prev => new Set([...prev, id]));
    setNotice(null);
    try {
      const { name, tagline, description, location, address, category, featured, image, workingHours, type } = edit;
      await adminSalonsApi.update(id, {
        name,
        tagline,
        description,
        location,
        address,
        category,
        featured,
        image,
        workingHours,
        ...(type !== undefined ? { type } : {}),
      });
      setEdits(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setEditingId(null);
      setNotice({ kind: 'success', text: `Saved changes for "${edit.name || 'salon'}".` });
    } catch (err: any) {
      setNotice({ kind: 'error', text: err.message || 'Could not save salon changes.' });
    } finally {
      setSaving(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const cancelEdit = (id: string) => {
    setEdits(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setEditingId(null);
  };

  const removeSalon = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this salon? This cannot be undone.')) return;
    setSaving(prev => new Set([...prev, id]));
    setNotice(null);
    try {
      await adminSalonsApi.remove(id);
      setNotice({ kind: 'success', text: 'Salon deleted.' });
    } catch (err: any) {
      setNotice({ kind: 'error', text: err.message || 'Could not delete salon.' });
    } finally {
      setSaving(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h2 className="font-serif text-2xl text-fg mb-6">Salon Management</h2>
        <div className="h-32 rounded-2xl border border-line bg-panel animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-fg">Salon Management</h2>
          <p className="text-xs text-fg-muted">Create, edit, feature, and remove salon listings.</p>
        </div>
        {notice && (
          <div className={`mb-4 flex items-center space-x-2 rounded-xl border p-3 text-xs ${
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
            <BuildingIcon className="h-4 w-4 text-accent-text" />
            <span className="text-xs font-mono uppercase tracking-widest text-fg-dim">{salonList.length} Salons</span>
          </div>
        </div>

        <div className="divide-y divide-line">
          {salonList.map(salon => {
            const isEditing = editingId === salon.id;
            const edit = edits[salon.id];
            const isSaving = saving.has(salon.id);

            return (
              <div key={salon.id} className="px-4 py-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-mono text-fg-dim mb-1">Salon Name</label>
                      <input
                        type="text"
                        defaultValue={edit.name}
                        className="w-full rounded-lg border border-line bg-inset px-3 py-2 text-sm text-fg focus:border-accent-strong focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-fg-dim mb-1">Tagline</label>
                      <input
                        type="text"
                        defaultValue={edit.tagline}
                        className="w-full rounded-lg border border-line bg-inset px-3 py-2 text-sm text-fg focus:border-accent-strong focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-fg-dim mb-1">Category</label>
                      <select
                        defaultValue={edit.category}
                        className="w-full rounded-lg border border-line bg-inset px-3 py-2 text-sm text-fg focus:border-accent-strong focus:outline-none"
                      >
                        <option value="bridal">Bridal & Ceremony</option>
                        <option value="editorial">Editorial & Red Carpet</option>
                        <option value="soft-glam">Soft Glam & Natural</option>
                        <option value="airbrush">Airbrush & HD Camera</option>
                        <option value="masterclass">Masterclasses & Lessons</option>
                        <option value="glam">Glam</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        defaultChecked={edit.featured ?? false}
                        className="rounded border-line bg-inset text-brand-gold focus:ring-accent-strong"
                      />
                      <span className="text-sm text-fg">Featured</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(salon.id)}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition-colors disabled:opacity-50"
                      >
                        <SaveIcon className="h-3.5 w-3.5" />
                        <span>{isSaving ? 'Saving…' : 'Save'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelEdit(salon.id)}
                        className="rounded-lg border border-line bg-inset px-3 py-2 text-xs text-fg-muted hover:bg-surface transition-colors disabled:opacity-50"
                        disabled={isSaving}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg overflow-hidden border border-line bg-surface">
                        {salon.image ? (
                          <img src={salon.image} alt={salon.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-surface text-fg-muted text-xs">
                            <BuildingIcon className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-fg truncate">{salon.name}</p>
                        <p className="text-xs font-mono text-fg-muted truncate">{salon.location}</p>
                        <p className="text-xs text-fg-muted truncate">{salon.category}</p>
                        {salon.artistTitle && (
                          <p className="text-xs text-fg-muted truncate">{salon.artistTitle}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleFeatured(salon)}
                        disabled={isSaving}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                          salon.featured
                            ? 'border-brand-gold bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30'
                            : 'border-line text-fg-muted hover:bg-surface hover:text-fg'
                        }`}
                      >
                        <StarIcon className="h-3.5 w-3.5" />
                        <span>{salon.featured ? 'Featured' : 'Feature'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(salon.id)}
                        className="rounded-lg border border-line bg-inset px-2.5 py-2 text-xs text-fg-muted hover:bg-surface transition-colors disabled:opacity-50"
                        disabled={isSaving}
                        title="Edit"
                      >
                        <EditIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSalon(salon.id)}
                        disabled={isSaving}
                        className="rounded-lg border border-line bg-inset px-2.5 py-2 text-xs text-fg-muted hover:bg-danger-surface/40 hover:text-danger transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {salonList.length === 0 && (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-fg-muted">No salons found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}