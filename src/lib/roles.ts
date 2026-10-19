import type { User } from '../types';

export const isProviderRole = (role: User['role'] | undefined): boolean =>
  role === 'studio' || role === 'MUA';
