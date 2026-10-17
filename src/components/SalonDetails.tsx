/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Star, MapPin, Clock, Calendar, MessageSquare, Sparkles, Loader2, Car, Calculator } from 'lucide-react';
import { Salon, Service, Review } from '../types';
import { apiClient, type PaginatedResponse } from '../lib/api';

interface SalonDetailsProps {
  salon: Salon;
  onBack: () => void;
  onInitiateBooking: (service: Service) => void;
}

interface AISummary {
  source: 'model' | 'fallback';
  vibe: string;
  bestFor: string;
  tip: string;
}

const categoryLabels: Record<string, string> = {
  bridal: 'Bridal & Ceremony',
  editorial: 'Editorial & Red Carpet',
  'soft-glam': 'Soft Glam',
  airbrush: 'HD Airbrush',
  masterclass: 'Masterclass',
};

export default function SalonDetails({ salon, onBack, onInitiateBooking }: SalonDetailsProps) {
  const [activeTab, setActiveTab] = useState<'services' | 'staff' | 'reviews'>('services');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  
  // AI summary states
  const [aiSummary, setAiSummary] = useState<AISummary | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  // Venue travel calculator state
  const [venueInput, setVenueInput] = useState('');
  const [calculatingTravel, setCalculatingTravel] = useState(false);
  const [travelQuote, setTravelQuote] = useState<{
     distanceKm: number;
    estimatedDriveMinutes: number;
    totalTravelFee: number;
    baseKitFee: number;
    mileageFee: number;
  } | null>(null);

  const handleEstimateTravel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venueInput.trim()) return;
    setCalculatingTravel(true);
    try {
      const data = await apiClient.post('/venue/estimate-travel', {
          salonId: salon.id,
          venue: venueInput
      });
      setTravelQuote(data);
    } catch (err) {
      console.error(err);
    } finally {
      setCalculatingTravel(false);
    }
  };

  // Fetch reviews for this salon
  useEffect(() => {
    const fetchReviews = async () => {
      setLoadingReviews(true);
      try {
        const data = await apiClient.get<PaginatedResponse<Review> | Review[]>(`/reviews/${salon.id}`);
        setReviews(Array.isArray(data) ? data : data.data);
      } catch (err) {
        console.error('Failed to load reviews', err);
      } finally {
        setLoadingReviews(false);
      }
    };

    fetchReviews();
    fetchAISummary();
  }, [salon.id]);

  const fetchAISummary = async () => {
    setLoadingAI(true);
    try {
      const data = await apiClient.post<AISummary>('/gemini/summarize-reviews', { salonId: salon.id });
      setAiSummary(data);
    } catch (err) {
      console.error('Failed to compile AI review summary', err);
    } finally {
      setLoadingAI(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back to discovery button */}
      <button
        onClick={onBack}
        className="inline-flex items-center space-x-2 rounded-full border border-line bg-panel px-4 py-2 text-xs font-semibold text-fg-muted transition-all hover:bg-surface hover:text-fg mb-6 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Return to Marketplace</span>
      </button>

      {/* Salon Cover & Hero header */}
      <div className="relative h-[250px] sm:h-[350px] w-full overflow-hidden rounded-2xl border border-line">
        <img
          src={salon.image}
          alt={salon.name}
          className="h-full w-full object-cover brightness-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/40 to-transparent" />
        
        {/* Absolute Details over image */}
        <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 space-y-3">
          <div className="inline-flex items-center rounded-full bg-primary px-3 py-0.5 text-[10px] font-mono tracking-widest text-on-primary uppercase">
            {categoryLabels[salon.category] || salon.category} Studio
          </div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-fg sm:text-4xl md:text-5xl">
            {salon.name}
          </h1>
          <p className="font-serif text-sm sm:text-base italic text-fg">
            {salon.tagline}
          </p>

          <div className="flex flex-wrap items-center gap-y-2 gap-x-4 pt-1 text-xs text-fg-muted font-mono">
            <div className="flex items-center space-x-1">
              <Star className="h-4 w-4 fill-accent-text text-accent-text" />
              <span className="font-bold text-fg">{salon.rating}</span>
              <span>({salon.reviewCount} reviews)</span>
            </div>
            <div className="flex items-center space-x-1">
              <MapPin className="h-4 w-4 text-accent-text" />
              <span>{salon.address}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        {/* Left Columns (Services list & Staff info & Reviews) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Tabs header */}
          <div className="flex space-x-1 border-b border-line pb-px">
            {(['services', 'staff', 'reviews'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-xs sm:text-sm font-semibold tracking-wide border-b-2 transition-all capitalize cursor-pointer ${
                  activeTab === tab
                    ? 'border-accent text-fg'
                    : 'border-transparent text-fg-muted hover:text-fg'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content Display */}
          <div className="min-h-[300px]">
            {activeTab === 'services' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  {salon.services.map((service) => (
                    <div
                      key={service.id}
                      className="rounded-xl border border-line bg-panel p-5 hover:border-line transition-all duration-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                    >
                      <div className="space-y-1.5 max-w-xl">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-sans font-bold text-sm text-fg">{service.name}</h3>
                          <span className="text-[10px] font-mono text-fg bg-surface px-2 py-0.5 rounded">
                            {service.duration} mins
                          </span>
                        </div>
                        <p className="text-xs text-fg-muted leading-relaxed font-serif italic">
                          {service.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:flex-col sm:items-end shrink-0 pt-2 sm:pt-0">
                        <span className="font-serif font-bold text-base text-fg sm:mb-2">
                          RM {service.price}
                        </span>
                        <button
                          onClick={() => onInitiateBooking(service)}
                          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary-hover transition-all duration-300 flex items-center space-x-1.5 shadow-md shadow-accent/10 cursor-pointer"
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          <span>Reserve Slot</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'staff' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {salon.staff.map((staff) => (
                  <div
                    key={staff.id}
                    className="flex items-center space-x-4 rounded-xl border border-line bg-panel p-4"
                  >
                    <img
                      src={staff.avatar}
                      alt={staff.name}
                      className="h-16 w-16 rounded-full object-cover grayscale border border-line"
                    />
                    <div>
                      <h3 className="font-sans font-bold text-sm text-fg">{staff.name}</h3>
                      <p className="text-xs text-fg font-serif">{staff.role}</p>
                      <div className="flex items-center space-x-1 mt-1 text-[10px] font-mono text-fg-muted">
                        <Star className="h-3 w-3 fill-accent-text text-accent-text" />
                        <span className="font-bold text-fg">{staff.rating}</span>
                        <span>Expertise</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'reviews' && (
              <div className="space-y-4">
                {loadingReviews ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-accent-text" />
                  </div>
                ) : reviews.length === 0 ? (
                  <div className="text-center py-10 border border-line rounded-xl bg-panel">
                    <p className="text-xs text-fg-muted">No customer reviews posted yet. Be the first to share your experience!</p>
                  </div>
                ) : (
                  reviews.map((review) => (
                    <div
                      key={review.id}
                      className="rounded-xl border border-line bg-panel p-5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-fg">{review.clientName}</p>
                          <p className="text-[10px] text-fg-dim font-mono">{review.date}</p>
                        </div>
                        <div className="flex space-x-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-3 w-3 ${
                                i < review.rating ? 'fill-accent-text text-accent-text' : 'text-fg-dim'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed text-fg-muted font-serif italic">
                        "{review.text}"
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar (Working Hours & Gemini AI Summarized Reviews Card) */}
        <div className="space-y-6">
          {/* 1. Working Hours Box */}
          <div className="rounded-xl border border-line bg-panel p-5 space-y-4">
            <h3 className="flex items-center space-x-2 font-serif text-sm font-semibold text-fg">
              <Clock className="h-4 w-4 text-accent-text" />
              <span>Salon Working Hours</span>
            </h3>
            <div className="space-y-2 text-xs">
              {Object.entries(salon.workingHours).map(([day, hours]) => (
                <div key={day} className="flex justify-between border-b border-line/50 pb-1.5 last:border-0 last:pb-0">
                  <span className="text-fg-muted font-mono">{day}</span>
                  <span className={`font-semibold ${hours === 'Closed' ? 'text-accent-text' : 'text-fg'}`}>
                    {hours}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Gemini AI Review Insights Card */}
          <div className="rounded-xl border border-accent-soft/20 bg-panel-mid/40 p-5 space-y-4 relative overflow-hidden">
            {/* Visual Aura */}
            <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-accent/10 blur-xl" />
            
            <div className="flex items-center justify-between">
              <h3 className="flex items-center space-x-2 font-serif text-sm font-semibold text-fg">
                <Sparkles className="h-4 w-4 text-accent-text" />
                <span>AI Review Takeaways</span>
              </h3>
              <div className="flex items-center gap-1.5">
                {aiSummary?.source === 'fallback' && (
                  <span className="rounded bg-accent/10 px-2 py-0.5 text-[8px] font-mono text-fg-muted uppercase">
                    Sample
                  </span>
                )}
                <span className="rounded bg-accent/10 px-2 py-0.5 text-[8px] font-mono text-fg uppercase">
                  Gemini
                </span>
              </div>
            </div>

            {loadingAI ? (
              <div className="flex flex-col items-center justify-center py-6 space-y-2">
                <Loader2 className="h-5 w-5 animate-spin text-accent-text" />
                <span className="text-[10px] text-fg-muted font-mono animate-pulse">Reading reviews...</span>
              </div>
            ) : aiSummary ? (
              <div className="space-y-3.5 text-xs">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-fg uppercase">Atmosphere</p>
                  <p className="text-fg-muted italic font-serif leading-relaxed">"{aiSummary.vibe}"</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-fg uppercase">What They Do Best</p>
                  <p className="text-fg-muted italic font-serif leading-relaxed">"{aiSummary.bestFor}"</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-mono text-fg uppercase">Expert Booking Tip</p>
                  <p className="text-fg-muted italic font-serif leading-relaxed">"{aiSummary.tip}"</p>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-fg-muted">Review takeaways will formulate shortly.</p>
            )}
          </div>

          {/* 3. On-Location Venue Travel Calculator Card */}
          <div className="rounded-xl border border-line bg-canvas p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center space-x-2 font-serif text-sm font-semibold text-fg">
                <Car className="h-4 w-4 text-accent-text" />
                <span>On-Location Travel Quote</span>
              </h3>
              <span className="text-[10px] font-mono text-fg uppercase">Mobile MUA</span>
            </div>
            <p className="text-xs text-fg-dim">
              Hosting a wedding suite, gala, or hotel prep? Calculate our mobile glam squad travel rate to your venue.
            </p>

            <form onSubmit={handleEstimateTravel} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={venueInput}
                  onChange={(e) => setVenueInput(e.target.value)}
                  placeholder="e.g. The Ritz-Carlton, Penthouse Ballroom"
                  className="flex-1 rounded-lg border border-accent-soft bg-recessed-deep px-3 py-2 text-xs text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={calculatingTravel || !venueInput.trim()}
                  className="px-3 py-2 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-xs font-mono disabled:opacity-50 shrink-0 font-semibold transition-colors"
                >
                  {calculatingTravel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Quote'}
                </button>
              </div>

              {travelQuote && (
                <div className="p-3 rounded-lg bg-panel border border-chip text-xs space-y-1.5 mt-2">
                  <div className="flex justify-between font-medium text-fg">
                    <span>Estimated distance: {travelQuote.distanceKm} km</span>
                    <span>~{travelQuote.estimatedDriveMinutes} mins drive</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-fg-muted">
                    <span>Kit setup (RM50) + mileage (RM{travelQuote.mileageFee})</span>
                    <span className="font-serif font-bold text-sm text-fg">RM{travelQuote.totalTravelFee}</span>
                  </div>
                  <p className="text-[10px] text-fg-dim italic">
                    Includes sanitized pro lighting, artist mirrors, and on-time arrival guarantee.
                  </p>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
