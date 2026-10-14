/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Star, MapPin, ArrowRight } from 'lucide-react';
import { Salon } from '../types';

interface SalonCardProps {
  salon: Salon;
  onClick: () => void;
  key?: string;
}

const categoryLabels: Record<string, string> = {
  bridal: 'Bridal & Ceremony',
  editorial: 'Editorial & Red Carpet',
  'soft-glam': 'Soft Glam',
  airbrush: 'HD Airbrush',
  masterclass: 'Masterclass',
};

export default function SalonCard({ salon, onClick }: SalonCardProps) {
  return (
    <div
      className="group relative flex flex-col justify-between overflow-hidden rounded-[1.35rem] border border-line bg-elevated shadow-lg shadow-canvas/20 transition-all duration-300 motion-safe:hover:-translate-y-1 hover:border-accent-soft hover:shadow-xl hover:shadow-canvas/40 focus-within:border-accent-strong focus-within:ring-2 focus-within:ring-accent-strong/40"
    >
      <button type="button" onClick={onClick} aria-label={`View ${salon.name}`} className="absolute inset-0 z-10 h-full w-full rounded-[1.35rem] focus-visible:outline-none" />
      {/* Cover Image */}
      <div className="relative h-52 w-full overflow-hidden bg-surface p-1.5 sm:h-56">
        <img
          src={salon.image}
          alt={salon.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full rounded-[1rem] object-cover saturate-[0.88] transition-transform duration-500 motion-safe:group-hover:scale-[1.04] group-hover:saturate-100"
        />
        <div className="absolute inset-0 bg-scrim-bottom-soft" aria-hidden="true" />
        
        {/* Absolute category tag */}
        <span className="absolute left-4 top-4 rounded-full border border-brand-rose/40 bg-brand-rose-surface/90 px-3 py-1 text-[9px] font-mono font-semibold uppercase tracking-widest text-brand-rose shadow-md backdrop-blur-sm">
          {categoryLabels[salon.category] || salon.category}
        </span>

        {/* Top-Rated Highlight Badge */}
        {salon.rating >= 4.9 && (
          <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full border border-brand-emerald/40 bg-brand-emerald-surface/90 px-2.5 py-1 text-[9px] font-mono font-bold text-brand-emerald shadow-md backdrop-blur-md">
            <Star className="h-2.5 w-2.5 fill-brand-emerald text-brand-emerald" aria-hidden="true" />
            <span>Top-Rated ★{salon.rating}</span>
          </span>
        )}
      </div>

      {/* Card Details */}
      <div className="flex flex-1 flex-col justify-between space-y-4 p-5">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="font-sans font-bold text-base text-fg group-hover:text-fg transition-colors truncate max-w-[70%]">
              {salon.name}
            </h3>
            
            {/* Star Rating summary */}
            <div className="flex items-center space-x-1 text-xs font-mono">
            <Star className="h-3.5 w-3.5 fill-brand-rose text-brand-rose" aria-hidden="true" />
              <span className="font-bold text-fg">{salon.rating}</span>
            </div>
          </div>

          <p className="font-serif text-xs italic text-fg-muted line-clamp-1">
            "{salon.tagline}"
          </p>

          <p className="text-[11px] text-fg-dim line-clamp-2 leading-relaxed">
            {salon.description}
          </p>
        </div>

        {/* Location & CTA footer */}
        <div className="flex items-center justify-between pt-3 border-t border-surface text-[11px] font-mono text-fg-dim">
          <div className="flex items-center space-x-1">
            <MapPin className="h-3.5 w-3.5 text-brand-rose" aria-hidden="true" />
            <span>{salon.location}</span>
          </div>

          <span className="flex items-center space-x-1 font-semibold text-fg transition-colors group-hover:text-brand-rose">
            <span>Discover Menu</span>
            <ArrowRight className="h-3 w-3 transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}
