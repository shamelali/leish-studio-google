/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Store, TrendingUp, Star, DollarSign, Calendar, Settings, Plus, Trash2, Edit3, Save, Check, Loader2, AlertCircle, Building2, Image as ImageIcon, ImageOff, Upload } from 'lucide-react';
import { Salon, Service, Booking, WorkingHours, User } from '../types';
import { apiClient, bookingsApi, salonsApi } from '../lib/api';
import { serviceFormSchema } from '../lib/service-form';
import { isProviderRole } from '../lib/roles';

const PREDEFINED_CATEGORIES = ['bridal', 'editorial', 'soft-glam', 'airbrush', 'masterclass', 'glam'] as const;
type PredefinedCategory = typeof PREDEFINED_CATEGORIES[number];
const isCustomCategory = (cat: string): cat is Exclude<string, PredefinedCategory> =>
  cat && !PREDEFINED_CATEGORIES.includes(cat as PredefinedCategory);

interface DashboardProps {
  salons: Salon[];
  currentUser: User | null;
  onOpenAuth: (mode: 'signin' | 'signup') => void;
}

export default function Dashboard({ salons, currentUser, onOpenAuth }: DashboardProps) {
  const initialSalonId = (isProviderRole(currentUser?.role) && currentUser?.salonId)
    ? currentUser.salonId
    : (salons[0]?.id || '');
  const [selectedSalonId, setSelectedSalonId] = useState<string>(initialSalonId);

  useEffect(() => {
    if (isProviderRole(currentUser?.role) && currentUser?.salonId) {
      setSelectedSalonId(currentUser.salonId);
    }
  }, [currentUser]);

  const [salon, setSalon] = useState<Salon | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [newServiceDuration, setNewServiceDuration] = useState('45');
  const [newServiceDescription, setNewServiceDescription] = useState('');
  const [newServiceCategory, setNewServiceCategory] = useState('');
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [savingService, setSavingService] = useState(false);
  const [serviceFormError, setServiceFormError] = useState<string | null>(null);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editTagline, setEditTagline] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editHours, setEditHours] = useState<WorkingHours>({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [dashTab, setDashTab] = useState<'appointments' | 'services' | 'profile' | 'audit'>('appointments');
  const [auditData, setAuditData] = useState<any | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Photo editing state (MUA/studio avatar upload)
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (selectedSalonId) {
      fetchSalonAndBookings();
      if (dashTab === 'audit') fetchQualityAudit();
    }
  }, [selectedSalonId, dashTab, currentUser?.email]);

  const fetchQualityAudit = async () => {
    if (!selectedSalonId) return;
    setLoadingAudit(true);
    try {
      const data = await apiClient.post('/gemini/quality-audit', { salonId: selectedSalonId });
      setAuditData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAudit(false);
    }
  };

  const fetchSalonAndBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      const latestSalon = await salonsApi.getById(selectedSalonId);
      setSalon(latestSalon);
      setEditTagline(latestSalon.tagline);
      setEditDescription(latestSalon.description);
      setEditAddress(latestSalon.address);
      setEditHours(latestSalon.workingHours);
      setNewServiceCategory(latestSalon.category);

      if (isProviderRole(currentUser?.role) && currentUser.salonId === selectedSalonId) {
        const salonBookings = (await bookingsApi.getAll()) as Booking[];
        salonBookings.sort((a: Booking, b: Booking) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setBookings(salonBookings);
      } else {
        setBookings([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: Booking['status']) => {
    try {
      setError(null);
      await bookingsApi.updateStatus(bookingId, status);
      fetchSalonAndBookings();
    } catch (err: any) {
      setError(err.message || 'We could not update this appointment. Please try again.');
    }
  };

  const resetServiceForm = () => {
    setEditingServiceId(null);
    setNewServiceName('');
    setNewServicePrice('');
    setNewServiceDuration('45');
    setNewServiceDescription('');
    setNewServiceCategory(salon?.category || '');
    setServiceFormError(null);
  };

  const handleEditService = (service: Service) => {
    setEditingServiceId(service.id);
    setNewServiceName(service.name);
    setNewServicePrice(String(service.price));
    setNewServiceDuration(String(service.duration));
    setNewServiceDescription(service.description);
    setNewServiceCategory(service.category);
    setServiceFormError(null);
    setDashTab('services');
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = serviceFormSchema.safeParse({
      name: newServiceName,
      price: newServicePrice,
      duration: newServiceDuration,
      description: newServiceDescription,
      category: newServiceCategory,
    });
    if (!parsed.success) {
      setServiceFormError(parsed.error.issues[0]?.message || 'Enter valid service details.');
      return;
    }
    const serviceData = {
      name: parsed.data.name,
      price: Number(newServicePrice),
      duration: Number(newServiceDuration),
      description: parsed.data.description,
      category: parsed.data.category,
    };

    setSavingService(true);
    try {
      setError(null);
      setServiceFormError(null);
      if (editingServiceId) {
        await salonsApi.updateService(selectedSalonId, editingServiceId, serviceData);
      } else {
        await salonsApi.addService(selectedSalonId, serviceData);
      }
      resetServiceForm();
      await fetchSalonAndBookings();
    } catch (err: any) {
      setServiceFormError(err.message || 'We could not save that service. Please try again.');
    } finally {
      setSavingService(false);
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    if (!window.confirm('Remove this service from your salon menu?')) return;
    try {
      setError(null);
      await salonsApi.deleteService(selectedSalonId, serviceId);
      if (editingServiceId === serviceId) resetServiceForm();
      await fetchSalonAndBookings();
    } catch (err: any) {
      setError(err.message || 'We could not remove that service. Please try again.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      setError(null);
      await salonsApi.update(selectedSalonId, {
        tagline: editTagline,
        description: editDescription,
        address: editAddress,
        workingHours: editHours,
      });
      setIsEditingProfile(false);
      await fetchSalonAndBookings();
    } catch (err: any) {
      setError(err.message || 'We could not save your profile changes. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  const updateWorkingHours = (day: string, value: string) => {
    setEditHours(prev => ({ ...prev, [day]: value }));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB.');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError(null);
  };

  const clearPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handleSavePhoto = async () => {
    if (!photoFile || !selectedSalonId) return;
    setUploadingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        await salonsApi.update(selectedSalonId, { image: base64 });
        setUploadingPhoto(false);
        setPhotoFile(null);
        setPhotoPreview(null);
        await fetchSalonAndBookings();
      };
      reader.readAsDataURL(photoFile);
    } catch (err: any) {
      setUploadingPhoto(false);
      setError(err.message || 'Failed to upload profile photo.');
    }
  };

  const getEarnedRevenue = () => {
    return bookings
      .filter(b => b.status === 'confirmed' || b.status === 'completed')
      .reduce((sum, b) => sum + b.servicePrice, 0);
  };

  const getStatusBadge = (status: Booking['status']) => {
    switch (status) {
      case 'pending': return <span className="rounded-full bg-warning-surface/10 px-2 py-0.5 text-[9px] font-mono text-warning uppercase">Pending</span>;
      case 'confirmed': return <span className="rounded-full bg-info-surface/10 px-2 py-0.5 text-[9px] font-mono text-info uppercase">Confirmed</span>;
      case 'completed': return <span className="rounded-full bg-success-surface/10 px-2 py-0.5 text-[9px] font-mono text-success uppercase">Completed</span>;
      case 'cancelled': return <span className="rounded-full bg-danger-surface/10 px-2 py-0.5 text-[9px] font-mono text-danger uppercase">Cancelled</span>;
    }
  };

  const formattedDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (salons.length === 0) {
    return (
      <div className="text-center py-16 text-sm text-fg-muted">
        No registered salons found in the marketplace.
      </div>
    );
  }

  if (isProviderRole(currentUser?.role) && !currentUser?.salonId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-accent-soft/40 bg-inset p-8 text-center">
          <Building2 className="mx-auto mb-4 h-8 w-8 text-accent-text" />
          <h1 className="font-serif text-2xl font-bold text-fg">Your provider profile is pending</h1>
          <p className="mt-3 text-sm leading-6 text-fg-muted">
            An administrator needs to verify your account and link it to a studio or artist listing before provider tools are enabled.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {isProviderRole(currentUser?.role) ? (
        <div className="rounded-2xl border border-accent-soft/40 bg-inset p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-3">
            <span className="h-2.5 w-2.5 rounded-full bg-success-surface animate-pulse" />
            <p className="text-fg-muted">
              Logged in as <span className="text-fg font-semibold">{currentUser.name}</span> ({currentUser.role === 'MUA' ? 'Independent Makeup Artist' : 'Studio Operator'})
            </p>
          </div>
          <span className="font-mono text-[11px] text-fg bg-accent/20 border border-accent-soft/40 px-3 py-1 rounded-full">
             Studio Partner Account
          </span>
        </div>
      ) : (
        <div className="rounded-2xl border border-accent-soft/40 bg-gradient-to-r from-panel-mid to-recessed p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <div>
            <span className="inline-block text-[10px] font-mono uppercase tracking-wider text-fg bg-accent/30 px-2 py-0.5 rounded-md mb-1.5">
              Makeup Studio Partner Access
            </span>
            <h3 className="font-serif text-base font-semibold text-fg">Own a Makeup Studio or Work as a Pro MUA?</h3>
            <p className="text-fg-muted mt-0.5">
              Sign in or create a Studio Partner account to manage bookings, customize MUA staff, and update makeup services.
            </p>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('signin')}
              className="px-3.5 py-2 rounded-xl border border-line bg-recessed text-fg font-medium hover:border-accent transition-colors"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('signup')}
              className="px-3.5 py-2 rounded-xl bg-primary text-on-primary font-medium hover:brightness-110 transition-colors shadow-md shadow-accent/20"
            >
              Partner Sign Up
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-line pb-5 gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-fg">Business Salon Panel</h1>
          <p className="text-xs text-fg-muted mt-1">Manage appointments, service catalog, profile photo, and studio settings.</p>
        </div>

        <div className="flex items-center space-x-2.5">
          <Store className="h-4 w-4 text-accent-text" />
          <select
            value={selectedSalonId}
            onChange={(e) => setSelectedSalonId(e.target.value)}
            className="rounded-xl border border-accent-soft bg-panel px-4 py-2.5 text-xs sm:text-sm font-semibold text-fg focus:border-accent-strong focus:outline-none cursor-pointer"
          >
            {salons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.location})
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && !salon ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-accent-text" />
        </div>
      ) : error ? (
        <div className="flex items-center space-x-2 rounded-lg border border-accent-soft/30 bg-accent/10 p-5 text-xs text-fg">
          <AlertCircle className="h-4 w-4 text-accent-text shrink-0" />
          <span>{error}</span>
        </div>
      ) : salon ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-line bg-panel p-5 space-y-2 relative overflow-hidden">
              <div className="absolute right-4 top-4 rounded-full bg-success-surface/10 p-2 text-success">
                <DollarSign className="h-4 w-4" />
              </div>
              <p className="text-[10px] font-mono tracking-wider text-fg-dim uppercase">Total Earnings</p>
              <h3 className="font-serif text-3xl font-bold text-fg">RM {getEarnedRevenue()}</h3>
              <p className="text-[10px] text-fg-muted">Sum of confirmed & completed sessions</p>
            </div>

            <div className="rounded-xl border border-line bg-panel p-5 space-y-2 relative overflow-hidden">
              <div className="absolute right-4 top-4 rounded-full bg-info-surface/10 p-2 text-info">
                <Calendar className="h-4 w-4" />
              </div>
              <p className="text-[10px] font-mono tracking-wider text-fg-dim uppercase">Bookings Count</p>
              <h3 className="font-serif text-3xl font-bold text-fg">{bookings.length}</h3>
              <p className="text-[10px] text-fg-muted">All-time tickets processed</p>
            </div>

            <div className="rounded-xl border border-line bg-panel p-5 space-y-2 relative overflow-hidden">
              <div className="absolute right-4 top-4 rounded-full bg-warning-surface/10 p-2 text-accent-text">
                <Star className="h-4 w-4" />
              </div>
              <p className="text-[10px] font-mono tracking-wider text-fg-dim uppercase">Aesthetic Rating</p>
              <h3 className="font-serif text-3xl font-bold text-fg">{salon.rating} / 5</h3>
              <p className="text-[10px] text-fg-muted">Derived from {salon.reviewCount} customer reviews</p>
            </div>
          </div>

          <div className="flex border-b border-line pb-px">
            <button
              onClick={() => setDashTab('appointments')}
              className={`px-5 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer ${
                dashTab === 'appointments' ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'
              }`}
            >
              Active Appointments ({bookings.filter(b => b.status === 'pending' || b.status === 'confirmed').length})
            </button>
            <button
              onClick={() => setDashTab('services')}
              className={`px-5 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer ${
                dashTab === 'services' ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'
              }`}
            >
              Services Menu ({salon.services.length})
            </button>
            <button
              onClick={() => setDashTab('profile')}
              className={`px-5 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer ${
                dashTab === 'profile' ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'
              }`}
            >
              Edit Studio Details
            </button>
            <button
              onClick={() => setDashTab('audit')}
              className={`px-5 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                dashTab === 'audit' ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5 text-fg" />
              <span>AI Quality & Sentiment Audit</span>
            </button>
          </div>

          <div className="min-h-[400px]">
            {dashTab === 'appointments' && (
              <div className="space-y-4">
                {bookings.length === 0 ? (
                  <div className="text-center py-16 border border-line rounded-xl bg-panel text-fg-muted text-xs">
                    {isProviderRole(currentUser?.role) && currentUser.salonId === selectedSalonId
                      ? 'No bookings registered for this salon yet.'
                      : 'Appointments are visible to the partner account that manages this studio. Sign in with the studio account to see them.'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bookings.map((b) => (
                      <div
                        key={b.id}
                        className="rounded-xl border border-line bg-panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
                      >
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
                          <div>
                            <p className="text-[9px] text-fg-dim uppercase font-mono">Client Details</p>
                            <p className="font-bold text-fg mt-0.5">{b.clientName}</p>
                            <p className="text-[10px] text-fg-muted font-mono">{b.clientPhone}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-fg-dim uppercase font-mono">Beauty Service</p>
                            <p className="font-bold text-fg mt-0.5">{b.serviceName}</p>
                            <p className="text-[10px] text-fg font-serif">RM {b.servicePrice}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-fg-dim uppercase font-mono">Schedule</p>
                            <p className="font-semibold text-fg mt-0.5">{formattedDate(b.date)}</p>
                            <p className="text-[10px] text-fg-muted font-mono">{b.time}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-fg-dim uppercase font-mono">Status</p>
                            <div className="mt-1">{getStatusBadge(b.status)}</div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0 border-t border-line md:border-t-0 pt-3 md:pt-0">
                          {b.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleUpdateBookingStatus(b.id, 'confirmed')}
                                className="rounded bg-success px-3 py-1.5 font-semibold text-on-primary hover:brightness-110 transition"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => handleUpdateBookingStatus(b.id, 'cancelled')}
                                className="rounded border border-accent-soft/40 bg-accent/5 px-3 py-1.5 text-fg hover:bg-accent/10 transition"
                              >
                                Decline
                              </button>
                            </>
                          )}
                          {b.status === 'confirmed' && (
                            <button
                              onClick={() => handleUpdateBookingStatus(b.id, 'completed')}
                              className="rounded bg-primary px-3.5 py-1.5 font-semibold text-on-primary hover:bg-primary-hover transition flex items-center space-x-1"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>Complete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {dashTab === 'services' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-3">
                  <h3 className="font-serif text-sm font-semibold text-fg mb-2">Current Service Menu</h3>
                  {salon.services.map((serv) => (
                    <div
                      key={serv.id}
                      className="rounded-xl border border-line bg-panel p-4 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <p className="font-bold text-fg">{serv.name}</p>
                          <span className="text-[10px] text-fg-muted font-mono">({serv.duration} min)</span>
                        </div>
                        <p className="text-fg-muted max-w-md font-serif italic text-[11px]">"{serv.description}"</p>
                      </div>

                      <div className="flex items-center space-x-3">
                        <span className="font-serif font-bold text-sm text-fg">RM {serv.price}</span>
                        <button
                          type="button"
                          onClick={() => handleEditService(serv)}
                          aria-label={`Edit ${serv.name}`}
                          className="rounded p-1.5 text-fg-muted hover:bg-surface hover:text-fg transition"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteService(serv.id)}
                          aria-label={`Delete ${serv.name}`}
                          className="rounded p-1.5 text-danger hover:bg-accent/10 hover:text-danger transition"
                        >
                         <Trash2 className="h-4 w-4" />
                       </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-line bg-panel p-5 space-y-4 h-fit">
                  <h3 className="flex items-center space-x-1.5 font-serif text-sm font-semibold text-fg">
                    {editingServiceId ? <Edit3 className="h-4 w-4 text-accent-text" /> : <Plus className="h-4 w-4 text-accent-text" />}
                    <span>{editingServiceId ? 'Edit Makeup Service' : 'Add Makeup Service'}</span>
                  </h3>

                  <form onSubmit={handleSaveService} className="space-y-3.5 text-xs">
                    {serviceFormError && (
                      <div className="flex items-start gap-2 rounded-lg border border-danger-border/40 bg-danger-surface/10 p-3 text-danger" role="alert">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{serviceFormError}</span>
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] font-mono text-fg uppercase block mb-1">Service Title</label>
                      <input
                       type="text"
                        required
                        value={newServiceName}
                        onChange={(e) => { setNewServiceName(e.target.value); setServiceFormError(null); }}
                        placeholder="e.g. Royal Signature Bridal Trial & Lashes"
                        className="w-full rounded-lg border border-accent-soft bg-surface/30 px-3 py-2 text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-mono text-fg uppercase block mb-1">Price (RM)</label>
                        <input
                          type="number"
                        required
                        min="0"
                        step="0.01"
                        value={newServicePrice}
                        onChange={(e) => { setNewServicePrice(e.target.value); setServiceFormError(null); }}
                        placeholder="e.g. 195"
                        className="w-full rounded-lg border border-accent-soft bg-surface/30 px-3 py-2 text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none"
                      />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-fg uppercase block mb-1">Duration (min)</label>
                         <input
                           type="number"
                           min="1"
                           step="1"
                           required
                           value={newServiceDuration}
                           onChange={(e) => { setNewServiceDuration(e.target.value); setServiceFormError(null); }}
                           placeholder="e.g. 60"
                           className="w-full rounded-lg border border-accent-soft bg-surface/30 px-3 py-2 text-fg focus:border-accent-strong focus:outline-none"
                         />
                        </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-fg uppercase block mb-1">Short Description</label>
                      <textarea
                         value={newServiceDescription}
                         onChange={(e) => { setNewServiceDescription(e.target.value); setServiceFormError(null); }}
                         placeholder="Complexion matching, airbrush finish, custom lash placement, and long-wear setting..."
                         rows={2}
                         className="w-full rounded-lg border border-accent-soft bg-surface/30 px-3 py-2 text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none resize-none"
                       />
                    </div>

                     <div>
                       <label className="text-[10px] font-mono text-fg uppercase block mb-1">Service Category</label>
                       <select
                         required
                         value={newServiceCategory}
                         onChange={(e) => { setNewServiceCategory(e.target.value); setServiceFormError(null); }}
                         className="w-full rounded-lg border border-accent-soft bg-surface/30 px-3 py-2 text-fg focus:border-accent-strong focus:outline-none"
                       >
                         {isCustomCategory(newServiceCategory) && (
                           <option value={newServiceCategory}>{newServiceCategory}</option>
                         )}
                         <option value="bridal">Bridal</option>
                         <option value="editorial">Editorial</option>
                         <option value="soft-glam">Soft Glam</option>
                         <option value="airbrush">Airbrush</option>
                         <option value="masterclass">Masterclass</option>
                         <option value="glam">Glam</option>
                       </select>
                     </div>

                     <button
                       type="submit"
                       disabled={savingService}
                       className="w-full flex items-center justify-center space-x-1 rounded-lg bg-primary py-2.5 font-semibold text-on-primary hover:bg-primary-hover transition disabled:opacity-50 cursor-pointer"
                     >
                       {savingService ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>{editingServiceId ? 'Save Service Changes' : 'Add to Menu'}</span>}
                     </button>
                     {editingServiceId && (
                       <button
                         type="button"
                         onClick={resetServiceForm}
                         disabled={savingService}
                         className="w-full rounded-lg border border-line bg-surface py-2.5 font-semibold text-fg-muted hover:bg-chip hover:text-fg transition disabled:opacity-50"
                       >
                         Cancel Edit
                       </button>
                     )}
                  </form>
                </div>
              </div>
            )}

            {dashTab === 'profile' && (
              <div className="rounded-xl border border-line bg-panel p-6 max-w-3xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-line/50 pb-3">
                  <div>
                    <h3 className="font-serif text-sm font-semibold text-fg">Studio General Settings</h3>
                    {!isEditingProfile ? (
                      <button
                        onClick={() => setIsEditingProfile(true)}
                        className="inline-flex items-center space-x-1.5 rounded bg-panel/5 border border-fg/10 text-xs text-fg hover:bg-panel/10 px-3.5 py-1.5 cursor-pointer transition"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Edit Profile</span>
                      </button>
                    ) : (
                      <span className="text-[10px] font-mono text-accent-text uppercase">In Edit Mode</span>
                    )}
                  </div>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-mono text-fg uppercase block mb-1">
                        Profile Photo ({salon.type === 'mua' ? 'MUA Portrait' : 'Studio Frontage'})
                      </label>
                      <div className="relative flex items-center gap-3">
                        <div className="relative h-32 w-32 rounded-2xl overflow-hidden border border-line bg-canvas shrink-0">
                          {photoPreview ? (
                            <img src={photoPreview} alt="Photo preview" className="h-full w-full object-cover" />
                          ) : (
                            <img src={salon.image} alt={salon.name} className="h-full w-full object-cover" />
                          )}
                          {photoFile ? (
                            <div className="absolute inset-0 bg-canvas/80 flex items-center justify-center">
                              <div className="flex flex-col items-center gap-1">
                                <ImageOff className="h-5 w-5 text-danger" />
                                <span className="text-[9px] font-mono text-danger">New photo ready</span>
                              </div>
                            </div>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => document.getElementById('photo-upload')?.click()}
                            className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-lg hover:brightness-110 transition"
                            aria-label="Change profile photo"
                          >
                            <Upload className="h-4 w-4" />
                          </button>
                          <input
                            id="photo-upload"
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoChange}
                            className="hidden"
                          />
                        </div>
                        {photoFile && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-mono text-fg">Previewing new photo</p>
                            <button
                              type="button"
                              onClick={clearPhoto}
                              className="text-[9px] font-mono text-danger underline underline-offset-4 hover:text-fg"
                            >
                              Remove new photo
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {uploadingPhoto && (
                        <div className="flex items-center gap-2 text-xs text-accent-text">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Uploading photo...</span>
                        </div>
                      )}
                      {!uploadingPhoto && photoFile && !photoPreview && (
                        <button
                          type="button"
                          onClick={handleSavePhoto}
                          disabled={!photoFile}
                          className="w-full py-2 rounded-lg border border-accent-soft bg-surface/30 text-xs text-accent-text focus:border-accent-strong focus:outline-none"
                        >
                          Save Profile Photo
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-fg uppercase block mb-1">Tagline</label>
                    <input
                      type="text"
                      disabled={!isEditingProfile}
                      value={editTagline}
                      onChange={(e) => setEditTagline(e.target.value)}
                      className="w-full rounded-lg border border-accent-soft bg-surface/30 px-3 py-2 text-fg disabled:opacity-50 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-fg uppercase block mb-1">About Salon Description</label>
                    <textarea
                      disabled={!isEditingProfile}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-accent-soft bg-surface/30 px-3 py-2 text-fg disabled:opacity-50 focus:outline-none resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-fg uppercase block mb-1">Physical Address</label>
                    <input
                      type="text"
                      disabled={!isEditingProfile}
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      className="w-full rounded-lg border border-accent-soft bg-surface/30 px-3 py-2 text-fg disabled:opacity-50 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-fg uppercase block">Working Hours Configuration</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {Object.keys(editHours).map((day) => (
                        <div key={day} className="space-y-1">
                          <p className="font-mono text-[9px] text-fg-muted">{day}</p>
                          <input
                            type="text"
                            disabled={!isEditingProfile}
                            value={editHours[day as keyof WorkingHours] || ''}
                            onChange={(e) => updateWorkingHours(day, e.target.value)}
                            className="w-full rounded-md border border-accent-soft bg-surface/30 px-2.5 py-1.5 text-[10px] text-fg disabled:opacity-50 focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {isEditingProfile && (
                    <div className="flex space-x-2 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingProfile(false);
                          setEditTagline(salon.tagline);
                          setEditDescription(salon.description);
                          setEditAddress(salon.address);
                          setEditHours(salon.workingHours);
                        }}
                        className="rounded bg-surface border border-line px-4 py-2 font-semibold text-fg-muted hover:bg-chip transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingProfile}
                        className="rounded bg-primary px-5 py-2 font-semibold text-on-primary hover:bg-primary-hover transition disabled:opacity-50 flex items-center space-x-1.5"
                      >
                        {savingProfile ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Save className="h-3.5 w-3.5" />
                            <span>Save Changes</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </form>
              </div>
            )}

            {dashTab === 'audit' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl border border-surface bg-gradient-to-r from-panel via-panel-mid to-recessed">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-fg bg-accent/20 px-2.5 py-1 rounded-md border border-accent-soft/30 mb-2 inline-block">
                      Automated Sentiment & Artistry Inspector
                    </span>
                    <h3 className="font-serif text-2xl font-bold text-fg">
                      Studio Quality & Sentiment Auditor
                    </h3>
                    <p className="text-xs text-fg-muted max-w-xl mt-1">
                      Synthesizes client feedback, punctuality, color-matching accuracy, and tear-proof durability to deliver actionable operational intelligence.
                    </p>
                  </div>
                  <button
                    onClick={fetchQualityAudit}
                    disabled={loadingAudit}
                    className="py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-xs font-mono font-semibold flex items-center gap-2 shadow-lg disabled:opacity-50 self-start sm:self-auto shrink-0 transition-all"
                  >
                    {loadingAudit ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                    <span>{loadingAudit ? 'Auditing Reviews...' : 'Re-run Quality Audit'}</span>
                  </button>
                </div>

                {loadingAudit ? (
                  <div className="p-12 text-center rounded-2xl border border-line bg-recessed space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin text-accent-text mx-auto" />
                    <p className="font-serif text-lg text-fg">Evaluating Customer Sentiment...</p>
                    <p className="text-xs text-fg-dim">Parsing verified reviews and extracting actionable director recommendations...</p>
                  </div>
                ) : auditData ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-5 rounded-xl border border-surface bg-feature space-y-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-fg-dim">Artistry Quality Index</span>
                        <div className="flex items-baseline gap-2">
                          <span className="font-serif text-4xl font-bold text-fg">{auditData.overallScore}</span>
                          <span className="text-xs text-success font-mono">/ 100 Exemplary</span>
                        </div>
                        <p className="text-[11px] text-fg-muted">Benchmark against top Parisian & Milan ateliers.</p>
                      </div>

                      <div className="p-5 rounded-xl border border-surface bg-feature space-y-2 md:col-span-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-fg-dim">Sentiment Breakdown</span>
                        <div className="space-y-2 pt-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-success font-medium">Positive {auditData.sentimentDistribution?.positive || 94}%</span>
                            <span className="text-accent-text font-medium">Neutral {auditData.sentimentDistribution?.neutral || 5}%</span>
                            <span className="text-fg-muted font-medium">Constructive {auditData.sentimentDistribution?.constructive || 1}%</span>
                          </div>
                          <div className="h-2.5 w-full rounded-full bg-surface overflow-hidden flex">
                            <div style={{ width: `${auditData.sentimentDistribution?.positive || 94}%` }} className="bg-success-surface h-full" />
                            <div style={{ width: `${auditData.sentimentDistribution?.neutral || 5}%` }} className="bg-warning h-full" />
                            <div style={{ width: `${auditData.sentimentDistribution?.constructive || 1}%` }} className="bg-danger-surface h-full" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-5 rounded-xl border border-line bg-recessed space-y-3">
                        <h4 className="text-xs font-mono uppercase tracking-widest text-success flex items-center gap-1.5 font-semibold">
                          <Check className="h-4 w-4" />
                          Validated Artistry Strengths
                        </h4>
                        <ul className="space-y-2.5">
                          {auditData.strengths?.map((str: string, i: number) => (
                            <li key={i} className="text-xs text-fg flex items-start gap-2 bg-panel-mid p-3 rounded-lg border border-surface">
                              <span className="text-success font-bold shrink-0 mt-0.5">•</span>
                              <span>{str}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-5 rounded-xl border border-line bg-recessed space-y-3">
                        <h4 className="text-xs font-mono uppercase tracking-widest text-fg flex items-center gap-1.5 font-semibold">
                          <AlertCircle className="h-4 w-4 text-fg" />
                          Refinement Opportunities
                        </h4>
                        <ul className="space-y-2.5">
                          {auditData.improvements?.map((imp: string, i: number) => (
                            <li key={i} className="text-xs text-fg-muted flex items-start gap-2 bg-panel-mid p-3 rounded-lg border border-surface">
                              <span className="text-accent-text font-bold shrink-0 mt-0.5">•</span>
                              <span>{imp}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="p-6 rounded-2xl border border-line bg-panel space-y-3">
                      <h4 className="text-xs font-mono uppercase tracking-widest text-fg flex items-center gap-2 font-semibold">
                        <TrendingUp className="h-4 w-4 text-accent-text" />
                        Studio Director Actionable Roadmap
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        {auditData.actionablePlan?.map((plan: string, i: number) => (
                          <div key={i} className="p-3.5 rounded-xl border border-line bg-inset-deep space-y-1">
                            <span className="text-[10px] font-mono text-accent-text font-bold">INITIATIVE 0{i + 1}</span>
                            <p className="text-xs text-fg leading-relaxed">{plan}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
