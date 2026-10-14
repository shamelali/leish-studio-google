/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ArrowRight, CornerDownRight, Calendar, AlertCircle, RefreshCw } from 'lucide-react';
import { AIAdviceResponse, Salon, Service } from '../types';
import { apiClient } from '../lib/api';
import { resolveCatalogRecommendation } from '../lib/catalog-resolution';

interface AIStylistProps {
  onInitiateBooking: (salon: Salon, service: Service) => void;
  salons: Salon[];
}

export default function AIStylist({ onInitiateBooking, salons }: AIStylistProps) {
  // Consultation form states
  const [goals, setGoals] = useState('');
  const [skinHairType, setSkinHairType] = useState('');
  const [occasion, setOccasion] = useState('everyday');
  const [preferredCategory, setPreferredCategory] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advice, setAdvice] = useState<AIAdviceResponse | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const handleSubmitConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goals || !skinHairType) {
      setError('Please share your beauty goals and hair/skin profile.');
      return;
    }

    setLoading(true);
    setError(null);
    setAdvice(null);
    setBookingError(null);

    try {
      const result = await apiClient.post<AIAdviceResponse>('/gemini/advice', {
          goals,
          skinHairType,
          occasion,
          preferredCategory
      });
      setAdvice(result);
    } catch (err: any) {
      setError(err.message || 'AI Matching failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBookService = (suggested: AIAdviceResponse['suggestedServices'][number]) => {
    const resolution = resolveCatalogRecommendation(salons, {
      salonId: suggested.salonId,
      salonName: suggested.salonName,
      serviceId: suggested.serviceId,
      serviceName: suggested.serviceName,
    });

    if (!resolution.resolved) {
      setBookingError('message' in resolution ? resolution.message : 'This recommendation is not currently bookable.');
      return;
    }

    setBookingError(null);
    onInitiateBooking(resolution.salon, resolution.service);
  };

  const resetConsultant = () => {
    setGoals('');
    setSkinHairType('');
    setOccasion('everyday');
    setPreferredCategory('');
    setAdvice(null);
    setError(null);
    setBookingError(null);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Intro */}
      <div className="text-center space-y-3 mb-10">
        <div className="inline-flex items-center space-x-1.5 rounded-full border border-accent-soft/30 bg-accent/5 px-3.5 py-1 text-xs font-mono tracking-wide text-fg">
          <Sparkles className="h-3.5 w-3.5 text-fg animate-pulse" />
          <span>Generative AI Makeup Artist</span>
        </div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          Leish AI Makeup Stylist
        </h1>
        <p className="text-sm text-fg-muted max-w-xl mx-auto">
          Share your skin tone, undertone, and desired event aesthetic. Our Gemini-powered MUA analyzes our curated makeup studios to find your ideal match.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!advice && !loading && (
          <motion.div
            key="form-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="rounded-2xl border border-line bg-panel p-6 sm:p-8 shadow-xl"
          >
            <form onSubmit={handleSubmitConsultation} className="space-y-6">
              {error && (
                <div className="flex items-center space-x-2 rounded-lg border border-accent-soft/30 bg-accent/10 p-4 text-xs text-fg">
                  <AlertCircle className="h-4 w-4 text-accent-text shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {/* 1. Skin Profile & Undertone */}
                <div className="space-y-2">
                  <label className="text-xs font-mono tracking-wider text-fg uppercase block">
                    Skin Type & Undertone
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={skinHairType}
                    onChange={(e) => setSkinHairType(e.target.value)}
                    placeholder="e.g. Olive undertone prone to oily T-zone, or dry fair complexion needing luminous dewy skin prep..."
                    className="w-full rounded-xl border border-accent-soft bg-surface/40 px-4 py-3.5 text-xs sm:text-sm text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none focus:ring-1 focus:ring-accent-strong resize-none"
                  />
                </div>

                {/* 2. Desired Makeup Look */}
                <div className="space-y-2">
                  <label className="text-xs font-mono tracking-wider text-fg uppercase block">
                    Desired Makeup Style / Look
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={goals}
                    onChange={(e) => setGoals(e.target.value)}
                    placeholder="e.g. Royal soft glam with neutral cut-crease, individual flutter lashes, and a pillowy 90s brown lip..."
                    className="w-full rounded-xl border border-accent-soft bg-surface/40 px-4 py-3.5 text-xs sm:text-sm text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none focus:ring-1 focus:ring-accent-strong resize-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {/* 3. Occasion */}
                <div className="space-y-2">
                  <label className="text-xs font-mono tracking-wider text-fg uppercase block">
                    Special Occasion
                  </label>
                  <select
                    value={occasion}
                    onChange={(e) => setOccasion(e.target.value)}
                    className="w-full rounded-xl border border-accent-soft bg-surface px-4 py-3 text-xs sm:text-sm text-fg focus:border-accent-strong focus:outline-none"
                  >
                    <option value="wedding">Wedding / Bridal Ceremony</option>
                    <option value="photoshoot">Photoshoot / Editorial Camera</option>
                    <option value="gala">High-End Gala / Red Carpet</option>
                    <option value="everyday">Everyday Soft Glam & Self-Care</option>
                    <option value="masterclass">Personal Makeup Coaching & Masterclass</option>
                  </select>
                </div>

                {/* 4. Preferred Makeup Specialty */}
                <div className="space-y-2">
                  <label className="text-xs font-mono tracking-wider text-fg uppercase block">
                    Studio Category Focus (Optional)
                  </label>
                  <select
                    value={preferredCategory}
                    onChange={(e) => setPreferredCategory(e.target.value)}
                    className="w-full rounded-xl border border-accent-soft bg-surface px-4 py-3 text-xs sm:text-sm text-fg focus:border-accent-strong focus:outline-none"
                  >
                    <option value="">Any Makeup Artistry Style</option>
                    <option value="bridal">Bridal & Ceremony Specialists</option>
                    <option value="editorial">Editorial & Red Carpet Glam</option>
                    <option value="soft-glam">Soft Glam & Natural Complexion</option>
                    <option value="airbrush">Airbrush & 4K HD Artistry</option>
                    <option value="masterclass">1-on-1 Lessons & Masterclasses</option>
                  </select>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full flex items-center justify-center space-x-2 rounded-xl bg-primary py-4 text-xs sm:text-sm font-semibold text-on-primary transition-all duration-300 hover:bg-primary-hover hover:shadow-lg hover:shadow-accent/20 border border-fg/10 mt-2 cursor-pointer"
              >
                <span>Find My Makeup Studio Match</span>
                <Sparkles className="h-4 w-4 text-on-primary ml-1" />
              </button>
            </form>
          </motion.div>
        )}

        {/* Loading Vibe Screen */}
        {loading && (
          <motion.div
            key="loading-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-line bg-panel p-12 text-center space-y-6 flex flex-col items-center justify-center min-h-[350px] shadow-xl"
          >
            <div className="relative h-16 w-16">
              {/* Pulsing AI aura effect */}
              <div className="absolute inset-0 rounded-full bg-accent/20 blur-xl animate-pulse" />
              <div className="absolute inset-2 rounded-full border border-dashed border-fg/20 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-accent-text animate-bounce" />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-serif text-xl font-medium text-fg tracking-tight">AI Stylist Consulting...</h3>
              <p className="text-xs text-fg-muted max-w-xs animate-pulse">
                Analyzing hair textures, skin goals, and cross-matching available services at our artisan salons.
              </p>
            </div>
            
            <div className="text-[10px] font-mono text-fg-dim">
              Powered by Gemini 3.5 Flash
            </div>
          </motion.div>
        )}

        {/* Advice Output View */}
        {advice && (
          <motion.div
            key="advice-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
             {/* Consultant Commentary Card */}
             <div className="rounded-2xl border border-line bg-gradient-to-br from-inset to-recessed-deep p-6 sm:p-8 shadow-xl relative overflow-hidden">
               <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/5 blur-2xl" />
               <div className="flex items-start space-x-4">
                 <div className="rounded-full bg-accent/10 p-2.5 shrink-0 mt-1">
                   <Sparkles className="h-5 w-5 text-accent-text" />
                 </div>
                 <div className="space-y-3">
                   <div className="flex flex-wrap items-center gap-2">
                     <p className="text-xs font-mono tracking-widest text-fg uppercase">Stylist Consultation</p>
                     {advice.source === 'fallback' && (
                       <span className="rounded bg-accent/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-fg-muted">
                         Sample recommendation
                       </span>
                     )}
                   </div>
                   <p className="font-serif text-base sm:text-lg italic leading-relaxed text-fg">
                     "{advice.recommendationText}"
                   </p>
                 </div>
               </div>

               {bookingError && (
                 <div className="flex flex-col gap-3 rounded-xl border border-danger-border/40 bg-danger-surface/10 p-4 text-xs text-danger sm:flex-row sm:items-center sm:justify-between" role="alert">
                   <span>{bookingError}</span>
                   <button
                     type="button"
                     onClick={resetConsultant}
                     className="shrink-0 font-semibold underline underline-offset-2 hover:text-fg"
                   >
                     Start a new consultation
                   </button>
                 </div>
               )}
             </div>

            {/* Suggested Services List */}
            <div className="space-y-4">
              <h2 className="font-serif text-lg font-medium text-fg tracking-tight">Curated Marketplace Matches</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {advice.suggestedServices.map((service, index) => {
                  const resolution = resolveCatalogRecommendation(salons, {
                    salonId: service.salonId,
                    salonName: service.salonName,
                    serviceId: service.serviceId,
                    serviceName: service.serviceName,
                  });
                  const isBookable = resolution.resolved;

                  return (
                    <div
                      key={`${service.salonId}-${service.serviceId || service.serviceName}-${index}`}
                      className="flex flex-col justify-between rounded-xl border border-line bg-panel p-5 hover:border-line transition-all duration-300 shadow-md relative"
                    >
                      <div className="space-y-4">
                        {/* Service Metadata */}
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="inline-block rounded-full bg-surface px-2.5 py-0.5 text-[9px] font-mono tracking-wide text-fg uppercase">
                              {service.category}
                            </span>
                            <h3 className="font-sans font-bold text-sm text-fg mt-1.5">{service.serviceName}</h3>
                            <p className="text-xs text-fg-muted mt-0.5">&bull; {service.salonName}</p>
                          </div>
                           <span className="font-serif font-bold text-base text-fg">RM {service.estimatedPrice}</span>
                        </div>

                        {/* Reason paragraph */}
                        <div className="flex items-start space-x-2 text-xs text-fg-muted bg-surface/30 p-3 rounded-lg border border-line">
                          <CornerDownRight className="h-3.5 w-3.5 text-accent-text shrink-0 mt-0.5" />
                          <p className="leading-relaxed font-serif italic">"{service.reason}"</p>
                        </div>

                        {!isBookable && (
                          <div className="rounded-lg border border-danger-border/40 bg-danger-surface/10 p-3 text-xs text-danger" role="alert">
                            <p>{'message' in resolution ? resolution.message : 'This recommendation is not currently bookable.'}</p>
                            <button
                              type="button"
                              onClick={resetConsultant}
                              className="mt-2 font-semibold underline underline-offset-2 hover:text-fg"
                            >
                              Start a new consultation
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Booking CTA */}
                      <button
                        type="button"
                        disabled={!isBookable}
                        onClick={() => handleBookService(service)}
                        className="w-full flex items-center justify-center space-x-2 rounded-lg bg-primary py-2.5 text-xs font-semibold text-on-primary hover:bg-primary-hover transition-all duration-300 mt-4 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{isBookable ? 'Book Appointment' : 'Recommendation unavailable'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action CTAs */}
            <div className="text-center">
              <button
                onClick={resetConsultant}
                  className="inline-flex items-center space-x-1.5 rounded-full border border-line px-5 py-2.5 text-xs font-semibold text-fg-muted hover:bg-surface hover:text-fg transition-all"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>New AI consultation</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
