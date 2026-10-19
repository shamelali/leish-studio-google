import { describe, expect, it } from 'vitest';
import { canUpdateSalon } from './authz.ts';
import type { User } from '../src/types.ts';

const provider = (role: User['role'], salonId?: string): User => ({
  id: `user-${role}`,
  name: 'Provider',
  email: `${role.toLowerCase()}@example.test`,
  role,
  salonId,
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('provider authorization', () => {
  it.each(['studio', 'MUA'] as const)('allows a linked %s account to manage its listing', (role) => {
    expect(canUpdateSalon(provider(role, 'salon-1'), 'salon-1')).toBe(true);
    expect(canUpdateSalon(provider(role, 'salon-1'), 'salon-2')).toBe(false);
  });

  it('does not grant an unlinked provider account access to the public catalog', () => {
    expect(canUpdateSalon(provider('MUA'), 'salon-1')).toBe(false);
  });
});
