/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  X, 
  User as UserIcon, 
  Mail, 
  Phone, 
  Sparkles, 
  Scissors, 
  Building2, 
  LogOut, 
  Check, 
  Calendar,
  ShieldCheck,
  Edit2
} from 'lucide-react';
import { User, Salon } from '../types';
import { authApi } from '../lib/api';
import { isProviderRole } from '../lib/roles';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onUpdateUser: (updated: User) => void;
  onSignOut: () => void;
  salons: Salon[];
  onOpenSalonPortal?: () => void;
  onOpenBookings?: () => void;
}

export default function ProfileModal({
  isOpen,
  onClose,
  currentUser,
  onUpdateUser,
  onSignOut,
  salons,
  onOpenSalonPortal,
  onOpenBookings
}: ProfileModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(currentUser?.name || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  React.useEffect(() => {
    if (currentUser) {
      setName(currentUser.name);
      setPhone(currentUser.phone || '');
      setBio(currentUser.bio || '');
    }
  }, [currentUser]);

  if (!isOpen || !currentUser) return null;

  const linkedSalon = salons.find(s => s.id === currentUser.salonId);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const data = await authApi.updateProfile({
        id: currentUser.id,
        name,
        phone,
        bio
      });

      onUpdateUser(data.user);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsEditing(false);
      }, 1000);
    } catch (err: any) {
      alert(err.message || 'Error updating profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-md rounded-3xl border border-line bg-recessed p-6 sm:p-8 shadow-2xl text-fg"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-2 text-fg-dim hover:bg-surface hover:text-fg transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* User Avatar & Headline */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative mb-3">
            <div className="h-20 w-20 rounded-full overflow-hidden border-2 border-accent shadow-lg shadow-accent/20 bg-surface flex items-center justify-center">
              {currentUser.avatar ? (
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserIcon className="h-10 w-10 text-fg-muted" />
              )}
            </div>
            <span className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-recessed ${
              isProviderRole(currentUser.role) ? 'bg-primary' : 'bg-panel'
            }`} />
          </div>

          <h3 className="font-serif text-2xl font-medium tracking-tight text-fg">
            {currentUser.name}
          </h3>
          <p className="text-xs font-mono text-fg-muted mt-0.5">{currentUser.email}</p>

          <div className="mt-2.5 inline-flex items-center space-x-1.5 rounded-full border border-accent-soft/30 bg-accent/15 px-3 py-1 text-xs text-fg">
            {isProviderRole(currentUser.role) ? (
              <>
                <Building2 className="h-3 w-3 text-fg" />
                <span className="font-medium">Makeup Studio Director & MUA</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3 text-fg" />
                <span className="font-medium">VIP Makeup Client</span>
              </>
            )}
          </div>
        </div>

        {/* Profile Content / Editing */}
        {!isEditing ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-line bg-inset p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between text-fg-dim">
                <span className="flex items-center space-x-2">
                  <Phone className="h-3.5 w-3.5 text-accent-text" />
                  <span>Phone Number</span>
                </span>
                <span className="text-fg font-mono">{currentUser.phone || 'Not provided'}</span>
              </div>

              {isProviderRole(currentUser.role) && linkedSalon && (
                <div className="flex items-center justify-between text-fg-dim pt-2 border-t border-line">
                  <span className="flex items-center space-x-2">
                    <Building2 className="h-3.5 w-3.5 text-accent-text" />
                    <span>Associated Studio</span>
                  </span>
                  <span className="text-fg font-medium">{linkedSalon.name}</span>
                </div>
              )}

              {currentUser.bio && (
                <div className="pt-2 border-t border-line">
                  <p className="text-fg-dim mb-1 font-mono uppercase tracking-wider text-[10px]">Aesthetic Bio</p>
                  <p className="text-fg-muted italic leading-relaxed">"{currentUser.bio}"</p>
                </div>
              )}
            </div>

            {/* Quick Action Navigation */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {isProviderRole(currentUser.role) ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSalonPortal?.();
                  }}
                  className="flex items-center justify-center space-x-1.5 p-2.5 rounded-xl border border-accent-soft/40 bg-accent/10 text-xs text-fg hover:bg-accent/20 transition-colors"
                >
                  <Building2 className="h-3.5 w-3.5 text-fg" />
                  <span>Manage Atelier</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenBookings?.();
                  }}
                  className="flex items-center justify-center space-x-1.5 p-2.5 rounded-xl border border-accent-soft/40 bg-accent/10 text-xs text-fg hover:bg-accent/20 transition-colors"
                >
                  <Calendar className="h-3.5 w-3.5 text-fg" />
                  <span>View Bookings</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex items-center justify-center space-x-1.5 p-2.5 rounded-xl border border-line bg-panel-mid text-xs text-fg hover:border-line transition-colors"
              >
                <Edit2 className="h-3.5 w-3.5 text-fg-dim" />
                <span>Edit Profile</span>
              </button>
            </div>

            {/* Sign Out Button */}
            <button
              type="button"
              onClick={() => {
                onSignOut();
                onClose();
              }}
              className="w-full mt-3 flex items-center justify-center space-x-2 rounded-xl border border-danger-border/20 bg-danger-surface/20 py-2.5 text-xs font-medium text-danger hover:bg-danger-surface/40 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out of Leish!</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-mono uppercase tracking-wider text-fg-muted mb-1">
                Display Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-accent-soft bg-inset py-2 px-3 text-fg focus:border-accent-strong focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-mono uppercase tracking-wider text-fg-muted mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-accent-soft bg-inset py-2 px-3 text-fg focus:border-accent-strong focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-mono uppercase tracking-wider text-fg-muted mb-1">
                Bio / Style Preferences
              </label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full rounded-xl border border-accent-soft bg-inset py-2 px-3 text-fg focus:border-accent-strong focus:outline-none resize-none"
              />
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex-1 py-2.5 rounded-xl border border-line bg-inset text-fg-dim hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 py-2.5 rounded-xl bg-primary font-medium text-on-primary shadow-lg shadow-accent/20 flex items-center justify-center space-x-1.5"
              >
                {isSaving ? (
                  <div className="h-4 w-4 border-2 border-fg/30 border-t-white rounded-full animate-spin" />
                ) : saveSuccess ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
