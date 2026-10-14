import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Salon } from '../types';

interface AppState {
  // Auth
  currentUser: User | null;
  token: string | null;
  setCurrentUser: (user: User | null, token?: string | null) => void;
  setToken: (token: string | null) => void;
  logout: () => void;

  // Salons
  salons: Salon[];
  setSalons: (salons: Salon[]) => void;

  // UI State
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedSalon: Salon | null;
  setSelectedSalon: (salon: Salon | null) => void;

  // Filters
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  listingTypeFilter: 'all' | 'muas' | 'studios' | 'map';
  setListingTypeFilter: (filter: 'all' | 'muas' | 'studios' | 'map') => void;

  // Hero
  currentHeroImage: string;
  setCurrentHeroImage: (url: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Auth
      currentUser: null,
      token: null,
      setCurrentUser: (user, token) => {
        set({ currentUser: user, ...(token !== undefined && { token }) });
        if (user) {
          localStorage.setItem('leish_auth_user', JSON.stringify(user));
        } else {
          localStorage.removeItem('leish_auth_user');
        }
        if (token !== undefined) {
          if (token) {
            localStorage.setItem('leish_auth_token', token);
          } else {
            localStorage.removeItem('leish_auth_token');
          }
        }
      },
      setToken: (token) => {
        set({ token });
        if (token) {
          localStorage.setItem('leish_auth_token', token);
        } else {
          localStorage.removeItem('leish_auth_token');
        }
      },
      logout: () => {
        set({ currentUser: null, token: null });
        localStorage.removeItem('leish_auth_user');
        localStorage.removeItem('leish_auth_token');
      },

      // Salons
      salons: [],
      setSalons: (salons) => set({ salons }),

      // UI State
      activeTab: 'explore',
      setActiveTab: (tab) => set({ activeTab: tab }),
      selectedSalon: null,
      setSelectedSalon: (salon) => set({ selectedSalon: salon }),

      // Filters
      searchQuery: '',
      setSearchQuery: (query) => set({ searchQuery: query }),
      selectedCategory: 'all',
      setSelectedCategory: (category) => set({ selectedCategory: category }),
      listingTypeFilter: 'all',
      setListingTypeFilter: (filter) => set({ listingTypeFilter: filter }),

      // Hero
      currentHeroImage: '',
      setCurrentHeroImage: (url) => {
        set({ currentHeroImage: url });
        localStorage.setItem('leish_hero_image', url);
      },
    }),
    {
      name: 'leish-app-storage',
      partialize: (state) => ({
        currentUser: state.currentUser,
        token: state.token,
        currentHeroImage: state.currentHeroImage,
      }),
    }
  )
);
