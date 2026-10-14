/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Palette, 
  Search, 
  Calendar, 
  ShieldCheck, 
  Sun, 
  Camera, 
  Compass, 
  Flame, 
  Check, 
  Copy, 
  RefreshCw,
  Layers,
  Sparkle,
  ArrowRight,
  TrendingUp,
  MapPin
} from 'lucide-react';
import { LookbookItem, Salon, Service } from '../types';
import { apiClient } from '../lib/api';
import { resolveCatalogRecommendation } from '../lib/catalog-resolution';

interface LookbookStudioProps {
  salons: Salon[];
  onBookLook: (salon: Salon, service: Service, moodboard: LookbookItem) => void;
}

const PRESET_LOOKS = [
  {
    id: 'preset-bridal',
    name: 'Gilded Velvet Champagne Bridal',
    category: 'bridal',
    tagline: 'Waterproof 18-hour radiance tailored for tearful ceremonies & golden hour photography.',
    undertone: 'Neutral Warm',
    lighting: 'Golden Hour & Ballroom Chandelier',
    image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=1000'
  },
  {
    id: 'preset-redcarpet',
    name: 'Cinematic High-Impact Red Carpet',
    category: 'editorial',
    tagline: 'Camera-flash proof bone structure contour with razor-sharp smoked almond eye.',
    undertone: 'Cool Olive',
    lighting: 'Flash Photography & Step-and-Repeat',
    image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=1000'
  },
  {
    id: 'preset-softglam',
    name: 'Dewy Cashmere Peach Soft Glam',
    category: 'soft-glam',
    tagline: 'Blurred feather-light skin tint, brushed laminated brows, and honey-glazed lips.',
    undertone: 'Warm Peach',
    lighting: 'Natural Morning Daylight',
    image: 'https://images.unsplash.com/photo-1503236823255-94609f598e71?auto=format&fit=crop&q=80&w=1000'
  },
  {
    id: 'preset-airbrush',
    name: '4K Micro-Mist Ceramic Airbrush',
    category: 'airbrush',
    tagline: 'High-definition poreless canvas formulated for 4K video lenses and ultra-closeups.',
    undertone: 'Rich Golden',
    lighting: 'Studio Ring-Light & 4K Cinema Lenses',
    image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&q=80&w=1000'
  }
];

export default function LookbookStudio({ salons, onBookLook }: LookbookStudioProps) {
  const [selectedAesthetic, setSelectedAesthetic] = useState<string>('bridal');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [skinUndertone, setSkinUndertone] = useState<string>('Neutral Warm');
  const [occasion, setOccasion] = useState<string>('Luxury Wedding Ceremony');
  const [lighting, setLighting] = useState<string>('Golden Hour & Flash Photography');
  
  const [currentLook, setCurrentLook] = useState<LookbookItem | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  // Generate Lookbook on Mount or Preset Selection
  const handleGenerateLook = async (overridePrompt?: string, overrideAesthetic?: string) => {
    setLoading(true);
    setGenerationError(null);
    setBookingError(null);
    try {
      const data = await apiClient.post<LookbookItem>('/gemini/trends-lookbook', {
          prompt: overridePrompt || customPrompt,
          aesthetic: overrideAesthetic || selectedAesthetic,
          occasion,
          skinUndertone,
          lighting
      });
      setCurrentLook(data);
    } catch (err) {
      console.error(err);
      setGenerationError('The lookbook could not be generated. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    handleGenerateLook();
  }, []);

  const handleCopyHex = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 1800);
  };

  const handleInitiateBookingWithLook = () => {
    if (!currentLook) return;
    const resolution = resolveCatalogRecommendation(salons, {
      salonId: currentLook.recommendedSalonId,
      serviceId: currentLook.recommendedServiceId,
      serviceName: currentLook.recommendedServiceName,
    });

    if (!resolution.resolved) {
      setBookingError('message' in resolution ? resolution.message : 'This recommendation is not currently bookable.');
      return;
    }

    setBookingError(null);
    onBookLook(resolution.salon, resolution.service, currentLook);
  };

  const currentLookBooking = currentLook
    ? resolveCatalogRecommendation(salons, {
        salonId: currentLook.recommendedSalonId,
        serviceId: currentLook.recommendedServiceId,
        serviceName: currentLook.recommendedServiceName,
      })
    : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header Banner */}
      <div className="relative mb-12 overflow-hidden rounded-[2rem] border border-line bg-editorial-glow p-8 shadow-2xl sm:p-12 lg:p-16">
        <div className="glow-orb absolute top-0 right-0 -mt-10 -mr-10 h-72 w-72" aria-hidden="true" />
        <div className="relative z-10 max-w-3xl">
           <div className="mb-5 inline-flex items-center space-x-2 rounded-full border border-brand-rose/40 bg-brand-rose-surface/80 px-4 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-[0.18em] text-brand-rose">
             <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
             <span>2026 RUNWAY & BRIDAL SEARCH GROUNDED</span>
           </div>
           <h1 className="mb-5 max-w-3xl font-serif text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-champagne-gradient sm:text-6xl">
             AI Virtual Lookbook & Moodboard
           </h1>
           <p className="max-w-3xl text-sm leading-7 text-fg-muted sm:text-base">
            Design and visualize bespoke makeup aesthetics synchronized with current 2026 Milan/Paris couture runways and celebrity red carpets. Generate full formula specifications and attach your personalized moodboard directly to your luxury studio booking ticket.
          </p>
        </div>
      </div>

      {/* Preset Inspiration Pills */}
      <div className="mb-10">
         <h2 className="mb-4 flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-brand-emerald">
           <Sparkle className="h-3.5 w-3.5" aria-hidden="true" />
          Signature Artistry Blueprints
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PRESET_LOOKS.map(preset => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setSelectedAesthetic(preset.category);
                setSkinUndertone(preset.undertone);
                setLighting(preset.lighting);
                handleGenerateLook(preset.name, preset.category);
              }}
               className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                 selectedAesthetic === preset.category
                   ? 'border-brand-rose bg-brand-rose-surface shadow-lg shadow-brand-rose/10 ring-1 ring-brand-rose'
                   : 'border-line bg-recessed hover:border-brand-rose/50 hover:bg-inset'
               }`}
            >
               <div className="relative mb-3 h-28 w-full overflow-hidden rounded-xl border border-line/80 bg-surface p-1">
                <img
                  src={preset.image} 
                  alt={preset.name}
                  loading="lazy"
                  decoding="async"
                   className="h-full w-full rounded-lg object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.04]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-canvas/80 via-transparent to-transparent" />
                 <span className="absolute bottom-2 left-2 rounded bg-canvas/70 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-fg backdrop-blur-sm">
                  {preset.category}
                </span>
              </div>
               <h3 className="mb-1 font-serif text-sm font-semibold text-fg transition-colors group-hover:text-brand-rose">
                {preset.name}
              </h3>
              <p className="text-xs text-fg-dim line-clamp-2 leading-relaxed">
                {preset.tagline}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Main Designer Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Custom Artistry Controls */}
         <div className="space-y-6 rounded-2xl border border-line bg-recessed p-6 lg:col-span-4">
           <div className="flex items-center justify-between border-b border-brand-emerald/30 pb-4">
             <h3 className="font-serif text-lg font-medium text-fg flex items-center gap-2">
               <Palette className="h-4 w-4 text-brand-emerald" aria-hidden="true" />
              Artistry Parameters
            </h3>
            {loading && <RefreshCw className="h-4 w-4 text-fg animate-spin" />}
          </div>

          {/* Custom Prompt */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-fg-muted mb-2">
              Bespoke Look Vision / Notes
            </label>
            <textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="e.g. 90s supermodel brown-toned lip, subtle fox-eye liner, golden hour dewy underpainting for a destination sunset reception..."
              rows={3}
              className="w-full rounded-xl border border-accent-soft bg-recessed-deep p-3 text-xs text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none focus:ring-1 focus:ring-accent-strong resize-none"
            />
          </div>

          {/* Aesthetic Category */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-fg-muted mb-2">
              Aesthetic Category
            </label>
            <select
              value={selectedAesthetic}
              onChange={e => setSelectedAesthetic(e.target.value)}
              className="w-full rounded-xl border border-accent-soft bg-recessed-deep px-3 py-2.5 text-xs text-fg focus:border-accent-strong focus:outline-none"
            >
              <option value="bridal">Bridal & Ceremony Artistry</option>
              <option value="editorial">High-Fashion & Red Carpet Glam</option>
              <option value="soft-glam">Soft Glam & Dewy Radiance</option>
              <option value="airbrush">4K Ultra-HD Airbrush</option>
              <option value="masterclass">Masterclass Avant-Garde</option>
            </select>
          </div>

          {/* Skin Undertone */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-fg-muted mb-2">
              Skin Undertone & Complexion Base
            </label>
            <select
              value={skinUndertone}
              onChange={e => setSkinUndertone(e.target.value)}
              className="w-full rounded-xl border border-accent-soft bg-recessed-deep px-3 py-2.5 text-xs text-fg focus:border-accent-strong focus:outline-none"
            >
              <option value="Neutral Warm">Neutral Warm (Golden Peach)</option>
              <option value="Cool Olive">Cool Olive (Subtle Muted Undertone)</option>
              <option value="Warm Olive">Warm Olive (Luminous Mediterranean)</option>
              <option value="Deep Rich Golden">Deep Rich Golden (Warm Espresso Radiance)</option>
              <option value="Fair Cool Rosy">Fair Cool Rosy (Porcelain Pink)</option>
              <option value="Medium Tan Golden">Medium Tan Golden (Sun-Kissed Amber)</option>
            </select>
          </div>

          {/* Lighting Environment */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-fg-muted mb-2">
              Primary Lighting Environment
            </label>
            <select
              value={lighting}
              onChange={e => setLighting(e.target.value)}
              className="w-full rounded-xl border border-accent-soft bg-recessed-deep px-3 py-2.5 text-xs text-fg focus:border-accent-strong focus:outline-none"
            >
              <option value="Golden Hour & Ballroom Chandelier">Golden Hour & Ballroom Chandelier</option>
              <option value="Flash Photography & Step-and-Repeat">Flash Photography & Step-and-Repeat</option>
              <option value="Natural Morning Daylight">Natural Morning Daylight</option>
              <option value="Studio 5000K Clean Lighting">Studio 5000K Clean Balanced Lighting</option>
              <option value="Dim Evening Candlelight">Dim Evening Candlelight & Romance</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => handleGenerateLook()}
            disabled={loading}
             className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-mono font-semibold uppercase tracking-widest text-on-primary shadow-lg shadow-primary/20 transition-colors duration-300 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 focus-visible:ring-offset-recessed disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Synthesizing Runway Trends...</span>
              </>
            ) : (
              <>
                 <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>Formulate Moodboard</span>
              </>
            )}
          </button>
          {generationError && (
            <div className="rounded-xl border border-danger-border/40 bg-danger-surface/10 px-3 py-2 text-xs leading-relaxed text-danger" role="alert">
              <p>{generationError}</p>
              <button
                type="button"
                onClick={() => void handleGenerateLook()}
                className="mt-2 font-semibold text-danger underline underline-offset-2 hover:text-fg"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {/* Right Column: High-End Lookbook Spec Sheet */}
        <div className="lg:col-span-8">
          {loading ? (
            <div className="min-h-[500px] rounded-3xl border border-line bg-recessed flex flex-col items-center justify-center p-8 text-center space-y-4">
               <div className="relative">
                 <div className="h-16 w-16 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                <Sparkles className="h-6 w-6 text-fg absolute inset-0 m-auto" />
              </div>
              <p className="font-serif text-xl text-fg">Consulting Global 2026 Beauty Trends</p>
              <p className="text-xs text-fg-dim max-w-sm">
                Grounding runway color charts, glass-skin underpainting methods, and long-wear pigments with Google Search...
              </p>
            </div>
          ) : currentLook ? (
             <div className="overflow-hidden rounded-3xl border border-line bg-feature shadow-2xl">
              {/* Hero Banner with Curated Editorial Reference */}
                 <div className="relative h-64 w-full overflow-hidden border-b border-line sm:h-80">
                <img 
                  src={currentLook.heroImage} 
                  alt={currentLook.lookName}
                   className="h-full w-full object-cover saturate-[0.92]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-feature via-feature/40 to-transparent" />
                
                <div className="absolute bottom-6 left-6 right-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div>
                       <span className="mb-2 inline-block rounded-full bg-primary px-3 py-1 text-[10px] font-mono font-semibold uppercase tracking-widest text-on-primary shadow-md">
                      {currentLook.category} Artistry Specification
                    </span>
                    <h2 className="font-serif text-2xl sm:text-3xl font-bold text-fg tracking-tight">
                      {currentLook.lookName}
                    </h2>
                  </div>

                    <button
                      onClick={handleInitiateBookingWithLook}
                      disabled={!currentLookBooking?.resolved}
                       className="flex self-start items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-mono font-bold uppercase tracking-wider text-on-primary shadow-xl transition-colors duration-300 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 focus-visible:ring-offset-feature disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
                  >
                     <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Book This Look</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {currentLookBooking && !currentLookBooking.resolved && (
                <div className="mx-6 mt-6 flex flex-col gap-3 rounded-xl border border-danger-border/40 bg-danger-surface/10 p-4 text-xs text-danger sm:mx-8 sm:flex-row sm:items-center sm:justify-between" role="alert">
                  <span>{bookingError || ('message' in currentLookBooking ? currentLookBooking.message : 'This recommendation is not currently bookable.')}</span>
                  <button
                    type="button"
                    onClick={() => void handleGenerateLook()}
                    className="shrink-0 font-semibold underline underline-offset-2 hover:text-fg"
                  >
                    Generate a new recommendation
                  </button>
                </div>
              )}

              {/* Spec Details Body */}
              <div className="p-6 sm:p-8 space-y-8">
                {/* Vibe & Runway Trend Insight */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="rounded-2xl border border-brand-rose/30 bg-brand-rose-surface/50 p-4">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-fg-muted block mb-1">
                      Artistry Concept & Vibe
                    </span>
                    <p className="text-xs text-fg leading-relaxed">
                      {currentLook.vibeDescription}
                    </p>
                  </div>

                   <div className="rounded-2xl border border-brand-emerald/30 bg-brand-emerald-surface/50 p-4">
                     <span className="mb-1 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-brand-emerald">
                       <TrendingUp className="h-3 w-3" aria-hidden="true" />
                      2026 Runway & Red Carpet Grounding
                    </span>
                    <p className="text-xs text-fg-muted leading-relaxed">
                      {currentLook.groundedTrendContext}
                    </p>
                  </div>
                </div>

                {/* Harmonized Color Palette Swatches */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                     <h4 className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-fg">
                       <Palette className="h-3.5 w-3.5 text-brand-rose" aria-hidden="true" />
                      Harmonized Pigment Palette
                    </h4>
                    <span className="text-[11px] text-fg-dim">Click hex code to copy</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {currentLook.colorPalette.map((swatch, idx) => (
                      <div 
                        key={idx}
                        onClick={() => handleCopyHex(swatch.hex)}
                         className="group cursor-pointer rounded-xl border border-line bg-inset-deep p-3 transition-colors hover:border-brand-rose focus-within:border-brand-rose"
                      >
                        <div 
                          className="h-12 w-full rounded-lg shadow-inner mb-2 border border-fg/10 group-hover:scale-102 transition-transform"
                          style={{ backgroundColor: swatch.hex }}
                        />
                        <p className="text-xs font-medium text-fg truncate">{swatch.name}</p>
                        <p className="text-[10px] font-mono text-fg-dim flex items-center justify-between mt-1">
                          <span>{swatch.hex}</span>
                          {copiedHex === swatch.hex ? (
                            <Check className="h-3 w-3 text-success" />
                          ) : (
                            <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3-Pillar Artistry Breakdown (Complexion, Eyes, Lips) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Complexion */}
                  <div className="p-5 rounded-2xl border border-line bg-inset-deep space-y-3">
                    <div className="flex items-center gap-2 text-fg">
                       <Sparkles className="h-4 w-4 text-brand-rose" aria-hidden="true" />
                      <h4 className="font-serif text-sm font-semibold text-fg">Complexion Artistry</h4>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-fg-dim block">Finish & Glow</span>
                      <p className="text-xs text-fg font-medium">{currentLook.complexion.finish}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-fg-dim block">Coverage</span>
                      <p className="text-xs text-fg-muted">{currentLook.complexion.coverage}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-fg-dim block">Lead Technique</span>
                      <p className="text-xs text-fg-muted">{currentLook.complexion.technique}</p>
                    </div>
                  </div>

                  {/* Eye Artistry */}
                  <div className="p-5 rounded-2xl border border-line bg-inset-deep space-y-3">
                    <div className="flex items-center gap-2 text-fg">
                       <Sun className="h-4 w-4 text-brand-emerald" aria-hidden="true" />
                      <h4 className="font-serif text-sm font-semibold text-fg">Lid & Brow Sculpt</h4>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-fg-dim block">Eye Design</span>
                      <p className="text-xs text-fg font-medium">{currentLook.eyeArtistry.style}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-fg-dim block">Lash Application</span>
                      <p className="text-xs text-fg-muted">{currentLook.eyeArtistry.lashStyle}</p>
                    </div>
                  </div>

                  {/* Lip Formula */}
                  <div className="p-5 rounded-2xl border border-line bg-inset-deep space-y-3">
                    <div className="flex items-center gap-2 text-fg">
                       <Layers className="h-4 w-4 text-brand-rose" aria-hidden="true" />
                      <h4 className="font-serif text-sm font-semibold text-fg">Lip Architecture</h4>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-fg-dim block">Shade Formula</span>
                      <p className="text-xs text-fg font-medium">{currentLook.lipFormula.shade}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-fg-dim block">Texture Finish</span>
                      <p className="text-xs text-fg-muted">{currentLook.lipFormula.finish}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-fg-dim block">Contour Liner</span>
                      <p className="text-xs text-fg-muted">{currentLook.lipFormula.liner}</p>
                    </div>
                  </div>
                </div>

                {/* Longevity & Setting Shield */}
                <div className="p-5 rounded-2xl border border-chip bg-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-fg flex items-center gap-1.5 font-semibold">
                      <ShieldCheck className="h-4 w-4 text-success" />
                      Longevity & Event Durability Guarantee
                    </span>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {currentLook.longevityFeatures.map((feat, i) => (
                        <span key={i} className="inline-flex items-center text-[11px] text-fg bg-canvas/40 px-2.5 py-1 rounded-md border border-line">
                          ✓ {feat}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="text-left sm:text-right shrink-0">
                    <span className="text-[10px] font-mono uppercase text-fg-dim block">Calibrated Lighting</span>
                    <span className="text-xs text-fg font-medium">{currentLook.lightingBestFor}</span>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="pt-4 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-xs text-fg-dim flex items-center gap-2">
                     <MapPin className="h-3.5 w-3.5 text-brand-emerald" aria-hidden="true" />
                     <span>Recommended Studio: <strong className="text-fg">{currentLookBooking?.resolved ? currentLookBooking.salon.name : 'Recommendation unavailable'}</strong></span>
                  </div>

                   <button
                     onClick={handleInitiateBookingWithLook}
                     disabled={!currentLookBooking?.resolved}
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-8 py-3 text-xs font-mono font-semibold uppercase tracking-widest text-on-primary shadow-lg shadow-primary/20 transition-colors duration-300 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 focus-visible:ring-offset-feature disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                   >
                    <span>Reserve With This Moodboard</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
