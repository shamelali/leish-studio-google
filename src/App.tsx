/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Sparkles, Star, MapPin, Calendar, Heart, Shield, RefreshCw, Loader2, Compass, Building2, User as UserIconAlt, User as UserIcon, Map as MapIcon, ShieldCheck, Car, Image as ImageIcon, Check, Filter, ArrowUpDown, SlidersHorizontal } from 'lucide-react';
import Navbar from './components/Navbar';
import SalonCard from './components/SalonCard';
import MUACard from './components/MUACard';
import LoadingSpinner from './components/LoadingSpinner';
import Dashboard from './components/Dashboard';
import { Salon, Service, Booking, User, LookbookItem } from './types';
import { useSalons, authApi } from './lib/api';
import { getSupabaseSessionToken } from './lib/supabase';
import { useStore } from './lib/store';
import { findSalonByRoute, pathForRoute, routeFromLocation, type AppRoute } from './lib/routing';
import { analytics } from './lib/analytics';
import { applyPageSeo } from './lib/seo';

// Keep the initial discovery experience small. These feature surfaces are only
// needed after the user opens a detail page, portal, or modal.
const AIStylist = React.lazy(() => import('./components/AIStylist'));
const SalonDetails = React.lazy(() => import('./components/SalonDetails'));
const BookingModal = React.lazy(() => import('./components/BookingModal'));
const ClientPortal = React.lazy(() => import('./components/ClientPortal'));
const DashboardLazy = React.lazy(() => import('./components/Dashboard'));
const ProviderDashboard = React.lazy(() => import('./components/ProviderDashboard'));
const AdminUsers = React.lazy(() => import('./components/AdminUsers'));
const AdminSidebar = React.lazy(() => import('./components/AdminSidebar'));
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard'));
const AdminSalons = React.lazy(() => import('./components/AdminSalons'));
const AdminBookings = React.lazy(() => import('./components/AdminBookings'));
const AdminReviews = React.lazy(() => import('./components/AdminReviews'));
const AdminSettings = React.lazy(() => import('./components/AdminSettings'));
const AuthModal = React.lazy(() => import('./components/AuthModal'));
const AuthChoice = React.lazy(() => import('./components/AuthChoice'));
const ProfileModal = React.lazy(() => import('./components/ProfileModal'));
const LookbookStudio = React.lazy(() => import('./components/LookbookStudio'));
const InteractiveMap = React.lazy(() => import('./components/InteractiveMap'));
const ImageStudio = React.lazy(() => import('./components/ImageStudio'));
const VeoVideoStudio = React.lazy(() => import('./components/VeoVideoStudio'));
const GeminiChatbot = React.lazy(() => import('./components/GeminiChatbot'));

export default function App() {
  const {
    currentUser, setCurrentUser,
    activeTab, setActiveTab,
    selectedSalon, setSelectedSalon,
    searchQuery, setSearchQuery,
    selectedCategory, setSelectedCategory,
    listingTypeFilter, setListingTypeFilter,
    currentHeroImage, setCurrentHeroImage,
  } = useStore();

  const { data: salons = [], isLoading, error, refetch } = useSalons();

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
  const [authPromptMessage, setAuthPromptMessage] = useState<string | undefined>(undefined);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [route, setRoute] = useState<AppRoute>(() => routeFromLocation(window.location));
  const [searchInput, setSearchInput] = useState(searchQuery);

  // Booking states
  const [activeBookingSalon, setActiveBookingSalon] = useState<Salon | null>(null);
  const [activeBookingService, setActiveBookingService] = useState<Service | null>(null);
  const [activeBookingMoodboard, setActiveBookingMoodboard] = useState<LookbookItem | null>(null);

  // Client identifier preset
  const [userEmail, setUserEmail] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('leish_auth_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u.email) return u.email;
      }
    } catch {
      // Corrupt localStorage entry — fall through to the empty default.
    }
    return '';
  });

  // Admin sub-section state — persists the active admin panel within the sidebar.
  const [adminSection, setAdminSection] = useState<string>('dashboard');

  // Hero Section Image Gallery curation
  const CURATED_HERO_IMAGES = [
    {
      id: 'backstage-glam',
      title: 'Haute Couture Backstage',
      desc: 'Editorial contouring and backstage lighting',
      url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=1600',
    },
    {
      id: 'golden-radiance',
      title: 'Golden Glow & Brushes',
      desc: 'Champagne radiance and metallic luxury pigments',
      url: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=1600',
    },
    {
      id: 'bridal-elegance',
      title: 'Bridal Atelier Grace',
      desc: 'Soft veil artistry and porcelain airbrushed skin',
      url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&q=80&w=1600',
    },
    {
      id: 'avant-garde',
      title: 'Avant-Garde Studio',
      desc: 'High-fashion editorial graphic liner & runway bold',
      url: 'https://images.unsplash.com/photo-1503236823255-94609f598e71?auto=format&fit=crop&q=80&w=1600',
    },
    {
      id: 'velvet-atelier',
      title: 'Velvet Atelier Palette',
      desc: 'Handcrafted pigment mixing and bespoke kits',
      url: 'https://images.unsplash.com/photo-1596704017254-9b121068fb31?auto=format&fit=crop&q=80&w=1600',
    },
  ];

  const [heroPickerOpen, setHeroPickerOpen] = useState(false);
  const [customHeroUrl, setCustomHeroUrl] = useState('');

  const heroImage = currentHeroImage || CURATED_HERO_IMAGES[0].url;

  // Rating filter & sorting state
  const [minRatingFilter, setMinRatingFilter] = useState<number | 'all'>('all');
  const [topRatedOnly, setTopRatedOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'rating-desc' | 'reviews-desc' | 'default'>('rating-desc');

  // Keep navigation shareable while retaining the existing Zustand UI state.
  // Browser back/forward is handled here instead of adding a router dependency.
  const navigate = useCallback((nextRoute: AppRoute, replace = false) => {
    setRoute(nextRoute);
    const nextPath = pathForRoute(nextRoute);
    if (window.location.pathname !== nextPath) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', nextPath);
    }
  }, []);

  const navigateTab = useCallback((tab: string) => {
    const nextTab = tab as AppRoute['tab'];
    navigate(nextTab === 'explore' ? { tab: 'explore' } : { tab: nextTab });
    setSelectedSalon(null);
    setActiveTab(tab);
  }, [navigate, setActiveTab, setSelectedSalon]);

  useEffect(() => {
    const onPopState = () => setRoute(routeFromLocation(window.location));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (searchInput === searchQuery) return;
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput);
      analytics.track('search_submitted', {
        has_query: Boolean(searchInput.trim()),
        query_length: searchInput.trim().length,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput, searchQuery, setSearchQuery]);

  useEffect(() => {
    // The route is the source of truth for shareable navigation. Avoid
    // writing the same Zustand value on every render; with persisted state
    // this otherwise creates a subscription/update loop in React 19.
    if (activeTab !== route.tab) setActiveTab(route.tab);
    const salon = findSalonByRoute(salons, route);
    if (route.tab === 'explore' && route.salonId && salons.length > 0) {
      // Zustand setters are not equality-aware for object references. Guard
      // this route sync so the same catalogue record cannot trigger a render
      // loop when persisted state and React 19 subscriptions are active.
      if (selectedSalon?.id !== salon?.id) setSelectedSalon(salon);
    } else if (route.tab === 'explore' && !route.salonId) {
      if (selectedSalon !== null) setSelectedSalon(null);
    }
  }, [activeTab, route, salons, selectedSalon, setActiveTab, setSelectedSalon]);

  useEffect(() => {
    applyPageSeo({
      origin: window.location.origin,
      pathname: window.location.pathname,
      activeTab,
      selectedSalon,
      salons,
    });
    analytics.track('page_view', {
      tab: activeTab,
      has_listing: Boolean(selectedSalon),
    });
  }, [activeTab, selectedSalon, salons]);

  const openSalon = useCallback((salon: Salon) => {
    setSelectedSalon(salon);
    setActiveTab('explore');
    navigate({ tab: 'explore', salonId: salon.id });
    analytics.track('view_listing', {
      listing_id: salon.id,
      listing_type: salon.type || 'studio',
    });
  }, [navigate, setActiveTab, setSelectedSalon]);

  const closeSalon = useCallback(() => {
    setSelectedSalon(null);
    setActiveTab('explore');
    navigate({ tab: 'explore' });
  }, [navigate, setActiveTab, setSelectedSalon]);

  // Categories list exclusively for MVP launch with makeup studios
  const categories = [
    { id: 'all', label: 'All Studios' },
    { id: 'bridal', label: 'Bridal & Ceremony' },
    { id: 'editorial', label: 'Editorial & Red Carpet' },
    { id: 'soft-glam', label: 'Soft Glam & Natural' },
    { id: 'airbrush', label: 'Airbrush & HD Camera' },
    { id: 'masterclass', label: 'Masterclasses & Lessons' },
  ];

  const handleAuthSuccess = (user: User, token: string) => {
    setCurrentUser(user);
    setUserEmail(user.email);
    try {
      localStorage.setItem('leish_auth_user', JSON.stringify(user));
      localStorage.setItem('leish_auth_token', token);
    } catch (e) {
      console.error(e);
    }
    analytics.track('auth_completed', { role: user.role });
  };

  // OAuth return pickup (Supabase): after Google consent redirects back to
  // the site root, exchange the Supabase session for an app session once.
  const oauthHandled = React.useRef(false);
  const [oauthPendingIdentity, setOauthPendingIdentity] = useState<{
    id: string;
    email: string;
    name?: string;
    avatar?: string;
  } | null>(null);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [busy, setBusy] = useState<'idle' | 'signing-in' | 'signing-up' | 'oauth'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (oauthHandled.current || currentUser) return;
    oauthHandled.current = true;
    (async () => {
      try {
        const supabaseToken = await getSupabaseSessionToken();
        if (!supabaseToken) return;
        const session = await authApi.oauth(supabaseToken);
        if ((session as any).needs_role_selection) {
          setOauthPendingIdentity((session as any).identity);
          setShowRolePicker(true);
          return;
        }
        handleAuthSuccess(session.user, session.token);
      } catch {
        // No usable OAuth session (or exchange failed); stay signed out.
      }
    })();
    // handleAuthSuccess is stable enough for mount-only pickup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOAuthRoleSelect = async (role: string) => {
    if (!oauthPendingIdentity) return;
    setBusy('oauth');
    try {
      const supabaseToken = await getSupabaseSessionToken();
      if (!supabaseToken) throw new Error('No Supabase session');
      const session = await authApi.oauthComplete(supabaseToken, role);
      handleAuthSuccess(session.user, session.token);
      setOauthPendingIdentity(null);
      setShowRolePicker(false);
      setBusy('idle');
    } catch (error: any) {
      setErrorMessage(error.message || 'Role selection failed. Please try again.');
      setBusy('idle');
    }
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem('leish_auth_user');
      localStorage.removeItem('leish_auth_token');
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateUser = (updated: User) => {
    setCurrentUser(updated);
    setUserEmail(updated.email);
    try {
      localStorage.setItem('leish_auth_user', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenAuth = (mode: 'signin' | 'signup' = 'signin', prompt?: string) => {
    setAuthModalMode(mode);
    setAuthPromptMessage(prompt);
    setAuthModalOpen(true);
  };

  const initiateBooking = (salon: Salon, service: Service) => {
    setActiveBookingSalon(salon);
    setActiveBookingService(service);
    setActiveBookingMoodboard(null);
    analytics.track('booking_started', {
      listing_id: salon.id,
      service_id: service.id,
      listing_type: salon.type || 'studio',
    });
  };

  const handleBookLook = (salon: Salon, service: Service, moodboard: LookbookItem) => {
    setActiveBookingSalon(salon);
    setActiveBookingService(service);
    setActiveBookingMoodboard(moodboard);
    analytics.track('lookbook_attached', {
      has_recommendation: Boolean(moodboard.recommendedSalonId && moodboard.recommendedServiceId),
    });
  };

  const handleBookingSuccess = (booking: Booking) => {
    analytics.track('booking_completed', {
      listing_id: booking.salonId,
      service_id: booking.serviceId,
      status: booking.status,
    });
  };

  // Filtered and Sorted Salons computation
  const filteredSalons = salons
    .filter((s) => {
      const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            s.tagline.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            s.location.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory;

      const effectiveMinRating = topRatedOnly ? 4.8 : (minRatingFilter === 'all' ? 0 : Number(minRatingFilter));
      const matchesRating = s.rating >= effectiveMinRating;

      return matchesSearch && matchesCategory && matchesRating;
    })
    .sort((a, b) => {
      if (sortBy === 'rating-desc') {
        return b.rating - a.rating;
      }
      if (sortBy === 'reviews-desc') {
        return b.reviewCount - a.reviewCount;
      }
      return 0;
    });

  const filteredMUAs = filteredSalons.filter(s => s.type === 'mua');
  const filteredStudios = filteredSalons.filter(s => s.type !== 'mua');

  if (isLoading) return <LoadingSpinner size="lg" message="Synchronizing artists and studios..." />;
  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4" role="alert">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-elevated p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-surface/10 text-danger" aria-hidden="true">!</div>
          <h1 className="font-serif text-2xl font-semibold text-fg">Studios are taking a moment</h1>
          <p className="text-sm leading-relaxed text-fg-muted">
            We couldn&apos;t load the directory right now. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
             className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 focus-visible:ring-offset-elevated"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-fg flex flex-col font-sans">
      <Navbar
        activeTab={activeTab}
         setActiveTab={navigateTab}
        onOpenAuth={handleOpenAuth}
        onOpenAuthPage={() => navigateTab('auth')}
        onOpenProfile={() => setProfileModalOpen(true)}
      />

      <main className="flex-grow">
        <Suspense fallback={<LoadingSpinner size="lg" message="Loading Leish! studio..." />}>
          <AnimatePresence mode="wait">
          {activeTab === 'explore' && (
            <motion.div
              key="explore-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {!selectedSalon ? (
                 <div className="mx-auto max-w-7xl space-y-16 px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
                   <div className="relative flex min-h-[520px] flex-col justify-end overflow-hidden rounded-[2rem] border border-line/80 bg-editorial-glow p-6 shadow-2xl sm:min-h-[560px] sm:p-12 lg:p-16">
                    <img
                       src={heroImage}
                      alt="Leish! Haute Couture Makeup Artistry"
                      fetchPriority="high"
                      decoding="async"
                       className="absolute inset-0 h-full w-full scale-[1.02] object-cover object-center brightness-[0.42] transition-transform duration-700"
                    />

                    <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/60 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-canvas/95 via-canvas/50 to-transparent" />

                     <div className="glow-orb absolute right-10 top-10 h-96 w-96" aria-hidden="true" />

                    <div className="absolute top-6 right-6 z-20">
                      <button
                        type="button"
                        onClick={() => setHeroPickerOpen(!heroPickerOpen)}
                        aria-expanded={heroPickerOpen}
                        aria-controls="hero-image-picker"
                         className="inline-flex items-center gap-1.5 rounded-full border border-line bg-elevated/90 px-3.5 py-1.5 text-xs font-mono text-fg shadow-xl backdrop-blur-md transition-colors hover:border-accent-soft hover:bg-elevated cursor-pointer"
                      >
                        <ImageIcon className="h-3.5 w-3.5 text-fg" />
                        <span>Curate Hero Image</span>
                      </button>

                      {heroPickerOpen && (
                        <div id="hero-image-picker" role="dialog" aria-label="Select editorial hero photo" className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] space-y-3 rounded-2xl border border-line bg-canvas/95 p-4 shadow-2xl backdrop-blur-xl sm:w-96">
                          <div className="flex items-center justify-between border-b border-surface pb-2">
                            <span className="text-xs font-mono font-bold text-fg uppercase">
                              Select Editorial Hero Photo
                            </span>
                            <button
                              type="button"
                              onClick={() => setHeroPickerOpen(false)}
                              className="text-xs text-fg-dim hover:text-fg"
                            >
                              ✕
                            </button>
                          </div>

                          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {CURATED_HERO_IMAGES.map((img) => {
                               const isSelected = heroImage === img.url;
                              return (
                                <button
                                  key={img.id}
                                  type="button"
                                  onClick={() => {
                                    setCurrentHeroImage(img.url);
                                    setHeroPickerOpen(false);
                                  }}
                                  className={`w-full flex items-center gap-3 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                                    isSelected
                                      ? 'bg-accent/20 border-accent'
                                      : 'bg-surface border-surface hover:border-line'
                                  }`}
                                >
                                  <img
                                    src={img.url}
                                    alt={img.title}
                                    loading="lazy"
                                    decoding="async"
                                    className="h-12 w-12 rounded-lg object-cover shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-bold text-fg truncate block">
                                        {img.title}
                                      </span>
                                      {isSelected && <Check className="h-3.5 w-3.5 text-success shrink-0 ml-1" />}
                                    </div>
                                    <span className="text-[10px] text-fg-muted line-clamp-1 block">
                                      {img.desc}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          <div className="pt-2 border-t border-surface space-y-2">
                            <span className="text-[10px] font-mono text-fg-muted block">Or enter custom image URL:</span>
                            <div className="flex gap-2">
                             <label htmlFor="custom-hero-url" className="sr-only">Custom hero image URL</label>
                             <input
                               id="custom-hero-url"
                                type="url"
                                value={customHeroUrl}
                                onChange={(e) => setCustomHeroUrl(e.target.value)}
                                placeholder="https://..."
                                className="flex-1 rounded-lg border border-accent-soft bg-surface px-2.5 py-1.5 text-xs text-fg focus:border-accent-strong focus:outline-none"
                              />
                             <button
                               type="button"
                               onClick={() => {
                                 if (customHeroUrl.trim()) {
                                   setCurrentHeroImage(customHeroUrl.trim());
                                   setHeroPickerOpen(false);
                                 }
                               }}
                                     className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary transition-colors hover:bg-primary-hover cursor-pointer"
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="relative z-10 max-w-3xl space-y-6">
                      <div className="inline-flex items-center space-x-2 rounded-full border border-brand-rose/40 bg-brand-rose-surface/80 px-4 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-[0.18em] text-brand-rose shadow-md backdrop-blur-md">
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Curated Haute Makeup Studios & Independent MUAs</span>
                      </div>

                      <div className="max-w-2xl space-y-5">
                        <h1 className="font-serif text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-fg sm:text-6xl md:text-7xl">
                          Couture Makeup & <br />
                          <span className="text-champagne-gradient">
                            Red Carpet Artistry
                          </span>
                        </h1>

                        <p className="max-w-xl text-sm leading-7 text-fg-muted sm:text-base">
                          Leish! separates and connects you directly with independent Makeup Artists (MUAs) with mobile glam kits and premier physical boutique ateliers.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 text-[11px] font-mono text-fg">
                        <span className="flex items-center gap-1.5 rounded-full border border-brand-rose/30 bg-brand-rose-surface/70 px-3 py-1.5 backdrop-blur-sm">
                          <UserIconAlt className="h-3 w-3 text-brand-rose" aria-hidden="true" />
                          <span>{salons.filter(s => s.type === 'mua').length} Independent MUAs</span>
                        </span>
                        <span className="flex items-center gap-1.5 rounded-full border border-brand-emerald/30 bg-brand-emerald-surface/70 px-3 py-1.5 backdrop-blur-sm">
                          <Building2 className="h-3 w-3 text-brand-emerald" aria-hidden="true" />
                          <span>{salons.filter(s => s.type !== 'mua').length} Beauty Ateliers</span>
                        </span>
                        <span className="flex items-center gap-1.5 rounded-full border border-brand-emerald/30 bg-brand-emerald-surface/70 px-3 py-1.5 backdrop-blur-sm">
                          <Car className="h-3 w-3 text-brand-emerald" aria-hidden="true" />
                          <span>Klang Valley Dispatch</span>
                        </span>
                      </div>

                      <div className="max-w-2xl space-y-3.5 rounded-2xl border border-line bg-panel/95 p-3.5 shadow-xl backdrop-blur-md">
                        <div className="relative">
                          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-dim" />
                           <label htmlFor="hero-search" className="sr-only">Search artists and studios</label>
                           <input
                            id="hero-search"
                            type="text"
                             value={searchInput}
                             onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Search MUA artists by name, studios, bridal cut-creases, soft glam..."
                            className="w-full rounded-xl border border-accent-soft bg-surface pl-11 pr-4 py-3 text-xs sm:text-sm text-fg placeholder:text-fg-dim focus:border-accent-strong focus:outline-none"
                          />
                        </div>

                        <div className="flex space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
                          {categories.map((cat) => (
                             <button
                               key={cat.id}
                               type="button"
                               onClick={() => setSelectedCategory(cat.id)}
                               aria-pressed={selectedCategory === cat.id}
                              className={`rounded-full px-3.5 py-1 text-xs font-semibold tracking-wide border transition-all duration-300 shrink-0 cursor-pointer ${
                                selectedCategory === cat.id
                                   ? 'bg-primary border-primary text-on-primary shadow-sm'
                                  : 'bg-elevated border-chip text-fg-muted hover:border-line hover:text-fg'
                              }`}
                            >
                              {cat.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-accent-text block font-bold">
                        Aesthetic Directory
                      </span>
                       <h2 className="font-serif text-2xl font-semibold tracking-tight text-fg">
                        Explore by Category
                      </h2>
                    </div>

                    <div className="flex items-center gap-1.5 p-1 rounded-xl bg-canvas border border-surface overflow-x-auto scrollbar-none">
                      <button
                        type="button"
                        onClick={() => setListingTypeFilter('all')}
                        aria-pressed={listingTypeFilter === 'all'}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer whitespace-nowrap ${
                          listingTypeFilter === 'all'
                             ? 'bg-primary text-on-primary shadow-sm font-bold'
                            : 'text-fg-muted hover:text-fg'
                        }`}
                      >
                        All Listings ({filteredSalons.length})
                      </button>

                      <button
                        type="button"
                        onClick={() => setListingTypeFilter('muas')}
                        aria-pressed={listingTypeFilter === 'muas'}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer whitespace-nowrap ${
                          listingTypeFilter === 'muas'
                             ? 'bg-primary text-on-primary shadow-sm font-bold'
                            : 'text-fg-muted hover:text-fg'
                        }`}
                      >
                        <UserIconAlt className="h-3.5 w-3.5" />
                        <span>Independent MUAs ({filteredMUAs.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setListingTypeFilter('studios')}
                        aria-pressed={listingTypeFilter === 'studios'}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer whitespace-nowrap ${
                          listingTypeFilter === 'studios'
                             ? 'bg-primary text-on-primary shadow-sm font-bold'
                            : 'text-fg-muted hover:text-fg'
                        }`}
                      >
                        <Building2 className="h-3.5 w-3.5" />
                        <span>Luxury Studios ({filteredStudios.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setListingTypeFilter('map')}
                        aria-pressed={listingTypeFilter === 'map'}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer whitespace-nowrap ${
                          listingTypeFilter === 'map'
                             ? 'bg-primary text-on-primary shadow-sm font-bold'
                            : 'text-fg-muted hover:text-fg'
                        }`}
                      >
                        <MapIcon className="h-3.5 w-3.5" />
                        <span>Map Locator</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-16">
                    {(listingTypeFilter === 'all' || listingTypeFilter === 'muas') && (
                      <div className="space-y-6">
                         <div className="flex flex-col justify-between gap-3 border-b border-brand-emerald/30 pb-4 sm:flex-row sm:items-end">
                           <div className="space-y-1">
                             <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.14em] text-brand-emerald">
                               <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                               <span>Independent Freelance & Celebrity Artists</span>
                             </div>
                             <h3 className="font-serif text-xl font-semibold tracking-tight text-fg sm:text-2xl">
                              Independent Makeup Artists (MUAs)
                            </h3>
                            <p className="text-xs text-fg-muted">
                              Elite pro artists with customized pro kits, mobile on-location dispatch, and direct personal booking.
                            </p>
                          </div>
                          <span className="font-mono text-xs text-fg-dim shrink-0">
                            {filteredMUAs.length} Available Artists
                          </span>
                        </div>

                        {filteredMUAs.length === 0 ? (
                          <div className="text-center py-12 border border-surface rounded-2xl bg-canvas text-fg-muted text-xs" role="status" aria-live="polite">
                            No independent MUAs match your current category or keyword filter.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {filteredMUAs.map((mua) => (
                              <MUACard
                                key={mua.id}
                                mua={mua}
                                 onClick={() => openSalon(mua)}
                                onBookDirect={() => {
                                  if (mua.services[0]) {
                                    initiateBooking(mua, mua.services[0]);
                                  }
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {(listingTypeFilter === 'all' || listingTypeFilter === 'studios') && (
                      <div className="space-y-6">
                         <div className="flex flex-col justify-between gap-3 border-b border-brand-rose/30 pb-4 sm:flex-row sm:items-end">
                           <div className="space-y-1">
                             <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.14em] text-brand-rose">
                               <Building2 className="h-4 w-4" aria-hidden="true" />
                               <span>Flagship Boutiques & Academies</span>
                             </div>
                             <h3 className="font-serif text-xl font-semibold tracking-tight text-fg sm:text-2xl">
                              Luxury Makeup Studios & Ateliers
                            </h3>
                            <p className="text-xs text-fg-muted">
                              Multi-chair bridal salons, private master suites, and certified hands-on masterclass studios.
                            </p>
                          </div>
                          <span className="font-mono text-xs text-fg-dim shrink-0">
                            {filteredStudios.length} Premier Ateliers
                          </span>
                        </div>

                        {filteredStudios.length === 0 ? (
                          <div className="text-center py-12 border border-surface rounded-2xl bg-canvas text-fg-muted text-xs" role="status" aria-live="polite">
                            No makeup studios match your current category or keyword filter.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredStudios.map((salon) => (
                              <SalonCard
                                key={salon.id}
                                salon={salon}
                                 onClick={() => openSalon(salon)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {(listingTypeFilter === 'all' || listingTypeFilter === 'map') && (
                      <div className="space-y-4 pt-4 border-t border-line">
                        <div className="flex items-center justify-between">
                          <div>
                           <h3 className="flex items-center gap-2 font-serif text-xl font-semibold tracking-tight text-fg">
                               <MapIcon className="h-5 w-5 text-brand-emerald" aria-hidden="true" />
                              <span>Klang Valley Atelier & MUA Locator</span>
                            </h3>
                            <p className="text-xs text-fg-muted mt-0.5">
                              Powered by Google Maps Platform. View studio storefronts, bridal suite addresses, and MUA dispatch centers.
                            </p>
                          </div>
                        </div>

                        <InteractiveMap
                          locations={salons}
                          selectedId={selectedSalon?.id}
                           onSelect={(selected) => openSalon(selected)}
                          // The block only renders for 'all' | 'map' (see guard above),
                          // so every marker type is shown in both views.
                          filterType="all"
                        />
                      </div>
                    )}
                  </div>

                   <div className="grid grid-cols-1 gap-4 border-t border-line pt-12 text-center font-serif text-xs italic text-fg-muted sm:grid-cols-3">
                     <div className="space-y-1">
                       <Shield className="mx-auto mb-1 h-5 w-5 text-brand-emerald" aria-hidden="true" />
                       <p className="font-sans font-bold text-xs not-italic text-fg">Curated Talent</p>
                       <p>Browse independent MUAs and studio directors with detailed profiles, services, and specialties.</p>
                    </div>
                    <div className="space-y-1 border-t border-surface sm:border-t-0 sm:border-x sm:border-surface py-4 sm:py-0">
                       <Star className="mx-auto mb-1 h-5 w-5 fill-brand-rose text-brand-rose" aria-hidden="true" />
                       <p className="font-sans font-bold text-xs not-italic text-fg">Client Reviews</p>
                       <p>Read client-submitted testimonials and AI-generated review takeaways.</p>
                    </div>
                    <div className="space-y-1">
                       <Calendar className="mx-auto mb-1 h-5 w-5 text-brand-rose" aria-hidden="true" />
                      <p className="font-sans font-bold text-xs not-italic text-fg">Direct & Studio Bookings</p>
                      <p>Schedule on-location glam squads or reserve private chairs instantly.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                  <SalonDetails
                    salon={selectedSalon}
                     onBack={closeSalon}
                    onInitiateBooking={(service) => initiateBooking(selectedSalon, service)}
                  />
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'lookbook' && (
            <motion.div
              key="lookbook-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <LookbookStudio
                salons={salons}
                onBookLook={handleBookLook}
              />
            </motion.div>
          )}

          {activeTab === 'ai-stylist' && (
            <motion.div
              key="ai-stylist-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <AIStylist
                salons={salons}
                onInitiateBooking={initiateBooking}
              />
            </motion.div>
          )}

          {activeTab === 'client' && (
            <motion.div
              key="client-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <ClientPortal
                currentUser={currentUser}
                userEmail={userEmail}
                onOpenAuth={handleOpenAuth}
              />
            </motion.div>
          )}

          {activeTab === 'provider' && (
            <motion.div
              key="provider-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Suspense fallback={<LoadingSpinner size="lg" message="Loading salon panel..." />}>
                <DashboardLazy
                  salons={salons}
                  currentUser={currentUser}
                  onOpenAuth={handleOpenAuth}
                />
              </Suspense>
            </motion.div>
          )}

          {activeTab === 'admin' && (
            <motion.div
              key="admin-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex min-h-[calc(100vh-80px)]"
            >
              <AdminSidebar
                activeSection={adminSection}
                setActiveSection={setAdminSection}
                onOpenAuth={handleOpenAuth}
              />
              <main className="flex-1 overflow-y-auto bg-canvas">
                {adminSection === 'dashboard' && (
                  <AdminDashboard />
                )}
                {adminSection === 'users' && (
                  <AdminUsers
                    currentUser={currentUser}
                    onOpenAuth={handleOpenAuth}
                  />
                )}
                {adminSection === 'salons' && (
                  <AdminSalons />
                )}
                {adminSection === 'bookings' && (
                  <AdminBookings />
                )}
                {adminSection === 'reviews' && (
                  <AdminReviews />
                )}
                {adminSection === 'settings' && (
                  <AdminSettings />
                )}
              </main>
            </motion.div>
          )}

          {activeTab === 'auth' && (
            <motion.div
              key="auth-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-grow"
            >
              <AuthChoice
                onAuthSuccess={handleAuthSuccess}
                onClose={() => navigateTab('explore')}
              />
            </motion.div>
          )}

          {showRolePicker && oauthPendingIdentity && (
            <motion.div
              key="role-picker-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-grow flex items-center justify-center p-4 sm:p-6 lg:p-8"
            >
              <div className="w-full max-w-md rounded-3xl border border-line bg-recessed p-6 sm:p-8 shadow-2xl shadow-black/90">
                <div className="text-center mb-8">
                  <div className="inline-flex items-baseline font-serif text-3xl font-semibold tracking-tight text-brand-champagne mb-1">
                    <span>Lei</span>
                    <span className="text-brand-gold italic font-bold">sh</span>
                    <span className="text-brand-champagne text-2xl ml-0.5">!</span>
                  </div>
                  <p className="text-xs font-mono uppercase tracking-wider text-fg">
                    Aesthetic Marketplace
                  </p>
                </div>
                <h3 className="font-serif text-xl font-semibold text-fg mb-4">
                  Choose your role
                </h3>
                <p className="text-xs text-fg-muted mb-6">
                  Tell us who you are so we can set up your account correctly.
                </p>
                <div className="space-y-3">
                  {[
                    { id: 'client', label: 'Makeup Client', desc: 'Book glam & trials', icon: Sparkles },
                    { id: 'MUA', label: 'Makeup Artist', desc: 'Independent MUA', icon: UserIcon },
                     { id: 'studio', label: 'Studio Operator', desc: 'Manage a linked listing', icon: Building2 },
                  ].map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => handleOAuthRoleSelect(role.id)}
                      disabled={busy === 'oauth'}
                      className={`flex items-center justify-center space-x-3 rounded-xl border py-3 px-4 text-left transition-all ${
                        busy === 'oauth'
                          ? 'border-line text-fg-dim hover:bg-surface disabled:opacity-50'
                          : 'border-accent bg-accent/5 text-fg hover:bg-accent/10'
                      }`}
                    >
                      {role.icon ? <role.icon className="h-5 w-5" /> : null}
                      <div className="text-left">
                        <p className="text-sm font-medium text-fg">{role.label}</p>
                        <p className="text-[10px] text-fg-muted">{role.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'image-studio' && (
            <motion.div key="image-studio-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
              <ImageStudio />
            </motion.div>
          )}

          {activeTab === 'video-studio' && (
            <motion.div key="video-studio-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
              <VeoVideoStudio />
            </motion.div>
          )}

          {activeTab === 'concierge' && (
            <motion.div key="concierge-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
              <GeminiChatbot onBook={initiateBooking} />
            </motion.div>
          )}
          </AnimatePresence>
        </Suspense>
      </main>

        <AnimatePresence>
          {activeBookingSalon && activeBookingService && (
            <Suspense fallback={null}>
              <BookingModal
                isOpen={true}
                salon={activeBookingSalon}
                service={activeBookingService}
                currentUser={currentUser}
                attachedMoodboard={activeBookingMoodboard}
                onClose={() => {
                  setActiveBookingSalon(null);
                  setActiveBookingService(null);
                  setActiveBookingMoodboard(null);
                }}
                onBookingSuccess={handleBookingSuccess}
                onOpenAuth={handleOpenAuth}
              />
            </Suspense>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {authModalOpen && (
            <Suspense fallback={null}>
              <AuthModal
                isOpen={authModalOpen}
                onClose={() => {
                  setAuthModalOpen(false);
                  setAuthPromptMessage(undefined);
                }}
                 initialMode={authModalMode}
                 onAuthSuccess={handleAuthSuccess}
                 promptMessage={authPromptMessage}
              />
            </Suspense>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {profileModalOpen && (
            <Suspense fallback={null}>
              <ProfileModal
                isOpen={profileModalOpen}
                onClose={() => setProfileModalOpen(false)}
                currentUser={currentUser}
                onUpdateUser={handleUpdateUser}
                onSignOut={handleSignOut}
                salons={salons}
                 onOpenSalonPortal={() => navigateTab('provider')}
                 onOpenBookings={() => navigateTab('client')}
              />
            </Suspense>
          )}
        </AnimatePresence>

      <footer className="border-t border-surface bg-elevated py-8 text-center mt-20">
        <div className="max-w-4xl mx-auto px-4 flex flex-col items-center justify-center space-y-1.5 text-center">
          <p className="text-xs font-mono tracking-wide text-fg-muted">
            2026 Leish! Aesthetic Marketplace. All rights reserved.
          </p>
          <p className="text-[11px] font-mono text-fg-dim">
            (Managed by Duta Integra Solutions)
          </p>
        </div>
      </footer>
    </div>
  );
}
