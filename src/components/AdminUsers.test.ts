import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import AdminUsers, { matchesAdminUserSearch } from './AdminUsers';
import type { Salon, User } from '../types';

const admin: User = {
  id: 'user-admin-test', name: 'Administrator', email: 'admin@example.test',
  role: 'admin', createdAt: '2026-01-01T00:00:00.000Z',
};
const artist: User = {
  id: 'b4d7e3a1-2abc-4def-8123-456789abcdef', name: 'Test Artist',
  email: 'artist@example.test', role: 'MUA', salonId: 'listing-mua-123',
  createdAt: '2026-01-01T00:00:00.000Z',
};
const listing: Salon = {
  id: 'listing-mua-123', name: 'Artist Listing', tagline: '', description: '',
  rating: 0, reviewCount: 0, location: 'Kuala Lumpur', address: '', image: '',
  gallery: [], category: 'bridal', services: [], staff: [], featured: false,
  workingHours: {}, type: 'mua',
};

function renderUsers(users: User[], salons: Salon[] = [listing], currentUser: User | null = admin) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  // Populate the real hooks' cache: this SSR test needs no live backend or credentials.
  client.setQueryData(['users'], users);
  client.setQueryData(['salons'], salons);
  try {
    return renderToStaticMarkup(React.createElement(QueryClientProvider, { client },
      React.createElement(AdminUsers, { currentUser, onOpenAuth: () => {} }),
    ));
  } finally {
    client.clear();
  }
}

describe('All Users identifiers', () => {
  it('shows the complete MUA account ID separately from the linked listing ID', () => {
    const html = renderUsers([artist]);
    expect(html).toContain('MUA account ID');
    expect(html).toContain(`>${artist.id}</span>`);
    expect(html).toContain('Linked listing ID');
    expect(html).toContain(`>${artist.salonId}</span>`);
    expect(html).toContain('Makeup Artist (MUA)');
    expect(html).toContain('Studio Operator');
    expect(html).not.toContain('Salon Admin');
    expect(html).toContain(`aria-label="Listing for ${artist.email}"`);
    expect(html).toContain('Search users by name, email, account ID, or linked listing ID');
  });

  it.each(['MUA', 'studio'] as const)('keeps an unlinked %s account ID visible', role => {
    const html = renderUsers([{ ...artist, role, salonId: undefined }], []);
    expect(html).toContain(`>${artist.id}</span>`);
    expect(html).toContain(role === 'MUA' ? 'MUA account ID' : 'Account ID');
    expect(html).toContain('Not linked yet');
    expect(html).not.toContain(listing.id);
  });

  it('preserves a linked ID when its listing is missing from the loaded catalog', () => {
    const html = renderUsers([artist], []);
    expect(html).toContain(`>${artist.salonId}</span>`);
    expect(html).toContain(`value="${artist.salonId}" selected=""`);
    expect(html).not.toContain('Not linked yet');
  });

  it('labels a client ID as an account ID, not an MUA ID', () => {
    const html = renderUsers([{ ...artist, role: 'client', salonId: undefined }]);
    expect(html).toContain('Account ID');
    expect(html).toContain(`>${artist.id}</span>`);
    expect(html).not.toContain('MUA account ID');
    expect(html).not.toContain('Not linked yet');
  });

  it.each([null, { ...admin, role: 'client' }, { ...admin, role: 'MUA' }] as const)(
    'does not expose cached account IDs to a non-administrator (%j)', currentUser => {
      const html = renderUsers([artist], [listing], currentUser);
      expect(html).toContain('Administrator Area');
      expect(html).not.toContain(artist.id);
      expect(html).not.toContain(artist.email);
      expect(html).not.toContain(artist.salonId);
    },
  );
});

describe('All Users ID search', () => {
  it.each([
    ['name', '  TEST ARTIST  '],
    ['email', 'ARTIST@EXAMPLE.TEST'],
    ['complete account ID', `  ${artist.id.toUpperCase()}  `],
    ['partial account ID', '2ABC-4DEF'],
    ['linked listing ID', '  LISTING-MUA-123  '],
  ])('finds an account by %s', (_field, query) => {
    expect(matchesAdminUserSearch(artist, query)).toBe(true);
  });

  it('matches all users when the search is empty or whitespace', () => {
    expect(matchesAdminUserSearch(artist, '')).toBe(true);
    expect(matchesAdminUserSearch(artist, '   ')).toBe(true);
  });

  it('does not match an unrelated ID', () => {
    expect(matchesAdminUserSearch(artist, 'listing-unrelated')).toBe(false);
  });

  it('searches unlinked accounts without treating absent IDs as searchable text', () => {
    const unlinked: User = { ...artist, salonId: undefined };
    expect(matchesAdminUserSearch(unlinked, artist.id)).toBe(true);
    expect(matchesAdminUserSearch(unlinked, 'undefined')).toBe(false);
    expect(matchesAdminUserSearch(unlinked, listing.id)).toBe(false);
  });
});
