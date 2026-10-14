import type { Salon } from '../types';

export interface PageSeoInput {
  origin: string;
  pathname: string;
  activeTab?: string;
  selectedSalon?: Salon | null;
  salons?: Salon[];
}

export interface PageMetadata {
  title: string;
  description: string;
  canonicalUrl: string;
}

const DEFAULT_TITLE = 'Leish! Luxury Makeup Studio Marketplace';
const DEFAULT_DESCRIPTION =
  'Discover verified makeup artists, luxury beauty studios, bridal artistry, and bespoke masterclasses across Klang Valley.';

function absoluteUrl(origin: string, pathname: string): string {
  const normalizedOrigin = origin.replace(/\/$/, '');
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${normalizedOrigin}${normalizedPath}`;
}

export function buildPageMetadata({ origin, pathname, selectedSalon }: PageSeoInput): PageMetadata {
  const title = selectedSalon ? `${selectedSalon.name} | Leish!` : DEFAULT_TITLE;
  const description = selectedSalon
    ? `${selectedSalon.tagline} Explore services, reviews, and booking availability at ${selectedSalon.name} in ${selectedSalon.location}.`
    : DEFAULT_DESCRIPTION;

  return {
    title,
    description,
    canonicalUrl: absoluteUrl(origin, pathname),
  };
}

function salonStructuredData(salon: Salon, origin: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    '@type': 'BeautySalon',
    '@id': `${origin.replace(/\/$/, '')}/#listing-${encodeURIComponent(salon.id)}`,
    name: salon.name,
    description: salon.description,
    image: salon.image,
    url: `${origin.replace(/\/$/, '')}/#listing-${encodeURIComponent(salon.id)}`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: salon.address,
      addressLocality: salon.location,
      addressCountry: 'MY',
    },
  };

  if (salon.services.length > 0) {
    data.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: `${salon.name} services`,
      itemListElement: salon.services.map((service) => ({
        '@type': 'Offer',
        name: service.name,
        description: service.description,
        price: service.price,
        priceCurrency: 'MYR',
        itemOffered: {
          '@type': 'Service',
          name: service.name,
          serviceType: service.category,
        },
      })),
    };
  }

  if (salon.reviewCount > 0 && salon.rating >= 0 && salon.rating <= 5) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: salon.rating,
      reviewCount: salon.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return data;
}

export function buildStructuredData({ origin, pathname, selectedSalon, salons = [] }: PageSeoInput): Record<string, unknown> {
  const canonicalUrl = absoluteUrl(origin, pathname);
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'WebSite',
      '@id': `${canonicalUrl}#website`,
      name: DEFAULT_TITLE,
      url: canonicalUrl,
      description: DEFAULT_DESCRIPTION,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${canonicalUrl}?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'Organization',
      '@id': `${canonicalUrl}#organization`,
      name: 'Duta Integra Solutions',
    },
  ];

  if (selectedSalon) {
    graph.push(salonStructuredData(selectedSalon, origin));
  } else if (salons.length > 0) {
    graph.push({
      '@type': 'ItemList',
      name: 'Leish! makeup artists and studios',
      itemListElement: salons.slice(0, 50).map((salon, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: salonStructuredData(salon, origin),
      })),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

function upsertMeta(nameOrProperty: 'name' | 'property', value: string, content: string): void {
  const selector = `meta[${nameOrProperty}="${nameOrProperty === 'property' ? value : value}"]`;
  let meta = document.head.querySelector<HTMLMetaElement>(selector);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(nameOrProperty, value);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

export function applyPageSeo(input: PageSeoInput): void {
  if (typeof document === 'undefined') return;

  const metadata = buildPageMetadata(input);
  document.title = metadata.title;
  upsertMeta('name', 'description', metadata.description);
  upsertMeta('property', 'og:title', metadata.title);
  upsertMeta('property', 'og:description', metadata.description);
  upsertMeta('property', 'og:url', metadata.canonicalUrl);
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('name', 'twitter:title', metadata.title);
  upsertMeta('name', 'twitter:description', metadata.description);

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = metadata.canonicalUrl;

  let jsonLd = document.head.querySelector<HTMLScriptElement>('#leish-structured-data');
  if (!jsonLd) {
    jsonLd = document.createElement('script');
    jsonLd.id = 'leish-structured-data';
    jsonLd.type = 'application/ld+json';
    document.head.appendChild(jsonLd);
  }
  jsonLd.textContent = JSON.stringify(buildStructuredData(input));
}
