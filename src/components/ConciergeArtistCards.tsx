/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CalendarPlus, MapPin, Sparkles } from 'lucide-react';
import type { Salon, Service } from '../types';

export interface ArtistSearchInput {
  styles: string[];
  location: string;
  maxPrice?: number;
}

export interface ArtistSearchResult {
  artists: Array<{ salon: Salon; service: Service; reason: string }>;
  summary: string;
}

interface ConciergeArtistCardsProps {
  state: 'loading' | 'result';
  result?: ArtistSearchResult;
  onBook?: (salon: Salon, service: Service) => void;
}

const categoryLabels: Record<string, string> = {
  bridal: 'Bridal & Ceremony',
  editorial: 'Editorial & Red Carpet',
  'soft-glam': 'Soft Glam',
  airbrush: 'HD Airbrush',
  masterclass: 'Masterclass',
};

const formatPrice = (price: number) => `RM ${price.toLocaleString('en-MY')}`;

export default function ConciergeArtistCards({ state, result, onBook }: ConciergeArtistCardsProps) {
  if (state === 'loading') {
    return (
      <div className="space-y-3" aria-label="Searching real catalogue services" role="status">
        <div className="h-4 w-2/3 animate-pulse rounded bg-line" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((item) => (
            <div key={item} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="h-28 animate-pulse bg-line" />
              <div className="space-y-2 p-3"><div className="h-3 w-3/4 animate-pulse rounded bg-line" /><div className="h-3 w-1/2 animate-pulse rounded bg-line" /><div className="h-8 animate-pulse rounded-lg bg-line" /></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!result || result.artists.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-4 text-xs text-fg-muted" role="status">
        <div className="mb-1 flex items-center gap-2 font-semibold text-fg"><Sparkles className="h-4 w-4 text-brand-rose" aria-hidden="true" /> A considered search, but no exact matches yet.</div>
        <p>{result?.summary || 'Try another neighbourhood, style, or budget and I will look again.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-fg-muted">{result.summary}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {result.artists.map(({ salon, service, reason }) => (
            <article key={`${salon.id}-${service.id}`} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition-colors hover:border-accent-soft">
              <div className="relative h-32 bg-inset">
              {salon.image ? (
                <img src={salon.image} alt={salon.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-rose-surface/60 via-inset to-surface px-4 text-center text-[10px] font-mono uppercase tracking-wider text-fg-dim"
                  role="img"
                  aria-label={`${salon.name} image unavailable`}
                >
                  Image unavailable
                </div>
              )}
              <span className="absolute left-2.5 top-2.5 rounded-full border border-brand-rose/40 bg-brand-rose-surface/90 px-2 py-1 text-[9px] font-mono font-semibold uppercase tracking-wide text-brand-rose backdrop-blur-sm">
                {categoryLabels[salon.category] || salon.category}
              </span>
            </div>
            <div className="space-y-2.5 p-3">
              <div>
                <h3 className="truncate font-serif text-sm font-bold text-fg">{salon.name}</h3>
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-fg-dim"><MapPin className="h-3 w-3 shrink-0 text-brand-rose" aria-hidden="true" />{salon.location}</p>
              </div>
              <div className="rounded-lg border border-line bg-inset p-2">
                <p className="text-[10px] font-semibold text-fg">{service.name}</p>
                <p className="mt-0.5 font-serif text-sm font-bold text-fg">{formatPrice(service.price)}</p>
              </div>
              <p className="line-clamp-3 text-[10px] leading-relaxed text-fg-muted">{reason}</p>
              {onBook && (
                <button type="button" onClick={() => onBook(salon, service)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wide text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong">
                  <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" /> Book this service
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
