/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Star, MapPin, ArrowRight, ShieldCheck, Car, Sparkles, Award } from 'lucide-react';
import { Salon } from '../types';

interface MUACardProps {
  mua: Salon;
  onClick: () => void;
  onBookDirect?: (e: React.MouseEvent) => void;
  key?: string;
}

export default function MUACard({ mua, onClick, onBookDirect }: MUACardProps) {
  const leadService = mua.services[0];
  const startingPrice = mua.startingPrice || (leadService ? leadService.price : 150);

  return (
    <div
      className="group relative flex flex-col justify-between overflow-hidden rounded-[1.35rem] border border-line bg-elevated shadow-lg shadow-canvas/20 transition-all duration-300 motion-safe:hover:-translate-y-1 hover:border-accent-soft hover:shadow-xl hover:shadow-canvas/40 focus-within:border-accent-strong focus-within:ring-2 focus-within:ring-accent-strong/40"
    >
      <button type="button" onClick={onClick} aria-label={`View ${mua.name}`} className="absolute inset-0 z-10 h-full w-full rounded-[1.35rem] focus-visible:outline-none" />
      {/* Top Banner & Artist Portrait */}
      <div className="relative h-60 w-full overflow-hidden bg-inset p-1.5">
        <img
          src={mua.image}
          alt={mua.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full rounded-[1rem] object-cover object-top saturate-[0.9] transition-transform duration-500 motion-safe:group-hover:scale-[1.04] group-hover:saturate-100"
        />
        <div className="absolute inset-0 bg-scrim-bottom" aria-hidden="true" />
        
         {/* Listing type badge */}
         <div className="absolute left-4 top-4 flex items-center space-x-1.5 rounded-full border border-brand-emerald/40 bg-brand-emerald-surface/90 px-3 py-1 backdrop-blur-md">
           <ShieldCheck className="h-3.5 w-3.5 text-brand-emerald" aria-hidden="true" />
           <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-emerald">
             Pro MUA
          </span>
        </div>

        {/* Experience Pill */}
        {mua.yearsExperience && (
          <div className="absolute right-4 top-4 flex items-center space-x-1 rounded-full border border-line bg-canvas/75 px-2.5 py-1 text-[10px] font-mono text-fg backdrop-blur-sm">
            <Award className="h-3 w-3" aria-hidden="true" />
            <span>{mua.yearsExperience}+ Yrs</span>
          </div>
        )}

        {/* Top-Rated Haute Elite MUA Badge */}
        {mua.rating >= 4.9 && (
          <div className="absolute left-4 top-14 flex items-center space-x-1 rounded-full border border-brand-rose/40 bg-brand-rose-surface/90 px-2.5 py-1 shadow-md backdrop-blur-md">
            <Star className="h-2.5 w-2.5 fill-brand-rose text-brand-rose" aria-hidden="true" />
            <span className="text-[9px] font-mono font-bold text-brand-rose">
              Top-Rated Elite ★{mua.rating}
            </span>
          </div>
        )}

        {/* Category Pill floating above bottom */}
        <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
           <span className="rounded-md border border-brand-rose/40 bg-brand-rose-surface/90 px-2.5 py-1 text-[10px] font-mono font-semibold uppercase tracking-widest text-brand-rose shadow-sm backdrop-blur-sm">
            {mua.category} Specialist
          </span>
          <div className="flex items-center space-x-1 bg-canvas/60 px-2 py-0.5 rounded text-xs font-mono text-fg">
             <Star className="h-3.5 w-3.5 fill-brand-rose text-brand-rose" aria-hidden="true" />
            <span className="font-bold">{mua.rating}</span>
            <span className="text-fg-dim">({mua.reviewCount})</span>
          </div>
        </div>
      </div>

      {/* Artist Body Details */}
      <div className="flex flex-1 flex-col justify-between space-y-4 p-5">
        <div className="space-y-2">
          <div>
            <h3 className="font-serif text-lg font-bold text-fg group-hover:text-fg transition-colors leading-snug">
              {mua.name}
            </h3>
            <p className="text-xs text-fg font-medium mt-0.5">
              {mua.artistTitle || mua.tagline}
            </p>
          </div>

          <p className="text-[11px] text-fg-muted line-clamp-2 leading-relaxed">
            {mua.description}
          </p>

          {/* Pro Kit Brands */}
          {mua.kitBrands && mua.kitBrands.length > 0 && (
            <div className="pt-1">
              <span className="text-[9px] font-mono uppercase text-fg-dim block mb-1">Kit Essentials</span>
              <div className="flex flex-wrap gap-1">
                {mua.kitBrands.slice(0, 3).map((brand, i) => (
                  <span key={i} className="text-[10px] font-mono bg-surface text-fg-muted px-2 py-0.5 rounded border border-line">
                    {brand}
                  </span>
                ))}
                {mua.kitBrands.length > 3 && (
                  <span className="text-[10px] font-mono text-fg-dim py-0.5 px-1">
                    +{mua.kitBrands.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Travel & Pricing Footer */}
        <div className="pt-3 border-t border-surface space-y-2.5">
          <div className="flex items-center justify-between text-xs text-fg-dim">
            <div className="flex items-center space-x-1.5 truncate max-w-[65%]">
              <Car className="h-3.5 w-3.5 shrink-0 text-brand-emerald" aria-hidden="true" />
              <span className="truncate text-[11px]">{mua.travelRadius || `Based in ${mua.location}`}</span>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[10px] font-mono text-fg-dim block">Per Face</span>
              <span className="font-serif font-bold text-sm text-fg">From RM {startingPrice}</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-mono text-fg-muted group-hover:text-fg flex items-center gap-1 transition-colors">
              <span>View Portfolio & Services</span>
              <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </span>

            {onBookDirect && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onBookDirect(e);
                }}
               className="relative z-20 rounded-full bg-primary px-3 py-1 text-[11px] font-mono font-semibold uppercase tracking-wider text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 focus-visible:ring-offset-elevated"
              >
                Book Artist
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
