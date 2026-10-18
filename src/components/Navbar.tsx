/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Sparkles,
  Calendar,
  User as UserIcon,
  Search,
  LogIn,
  UserPlus,
  ChevronDown,
  LogOut,
  Settings,
  Scissors,
  Menu,
  X,
  Palette,
  MoreHorizontal,
  Image as ImageIcon,
  Video,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStore } from '../lib/store';

type NavTab = 'explore' | 'lookbook' | 'ai-stylist' | 'client' | 'provider' | 'admin' | 'image-studio' | 'video-studio' | 'concierge';

interface NavItem {
  id: NavTab;
  label: string;
  icon: LucideIcon;
}

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenAuth: (mode: 'signin' | 'signup') => void;
  onOpenAuthPage: () => void;
  onOpenProfile: () => void;
}

/** Public discovery surface — always visible in the top bar. */
const PRIMARY_ITEMS: NavItem[] = [
  { id: 'explore', label: 'Discover', icon: Search },
  { id: 'lookbook', label: 'AI Lookbook', icon: Palette },
  { id: 'ai-stylist', label: 'AI Advisor', icon: Sparkles },
];

/** Personal destinations — live in the account / "More" menus, not the top bar. */
const TOOL_ITEMS: NavItem[] = [
  { id: 'client', label: 'My Bookings', icon: Calendar },
  { id: 'image-studio', label: 'Image Studio', icon: ImageIcon },
  { id: 'video-studio', label: 'Video Studio', icon: Video },
  { id: 'concierge', label: 'Beauty Concierge', icon: MessageSquare },
];

const SALON_ITEM: NavItem = { id: 'provider', label: 'Salon Portal', icon: Scissors };

const ADMIN_ITEM: NavItem = { id: 'admin', label: 'Admin Users', icon: ShieldCheck };

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 focus-visible:ring-offset-canvas';

function springTransition(reduce: boolean | null) {
  return reduce
    ? { duration: 0 }
    : ({ type: 'spring', stiffness: 380, damping: 34 } as const);
}

/** Shared row for dropdown menus (account + "More"). */
function MenuRow({
  icon: Icon,
  label,
  active,
  danger,
  onClick,
}: {
  key?: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs transition-colors ${FOCUS_RING} ${
        danger
          ? 'text-danger hover:bg-danger-surface/30'
          : active
             ? 'bg-primary text-on-primary'
            : 'text-fg-muted hover:bg-surface hover:text-fg'
      }`}
    >
      <Icon
        aria-hidden="true"
         className={`h-3.5 w-3.5 shrink-0 ${danger ? '' : active ? 'text-on-primary' : 'text-fg-dim'}`}
      />
      <span className="truncate">{label}</span>
      {active && !danger && (
        <span aria-hidden="true" className="ml-auto h-1.5 w-1.5 rounded-full bg-on-primary" />
      )}
    </button>
  );
}

/** Row for the mobile disclosure panel. */
function MobileRow({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  key?: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors ${FOCUS_RING} ${
        active ? 'text-on-primary' : 'text-fg-muted hover:bg-surface hover:text-fg'
      }`}
    >
      {active && (
        <motion.span
          aria-hidden="true"
          layoutId="mobile-nav-active"
          className="absolute inset-0 rounded-xl bg-primary"
          transition={springTransition(reduce)}
        />
      )}
      <Icon aria-hidden="true" className="relative h-4 w-4 shrink-0" />
      <span className="relative">{label}</span>
    </button>
  );
}

function MobileGroup({
  labelId,
  label,
  children,
}: {
  labelId: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-labelledby={labelId} className="space-y-1">
      <span
        id={labelId}
        className="block px-3 pb-1 font-mono text-[10px] uppercase tracking-widest text-fg-dim"
      >
        {label}
      </span>
      {children}
    </div>
  );
}

export default function Navbar({
  activeTab,
  setActiveTab,
  onOpenAuth,
  onOpenProfile,
}: NavbarProps) {
  const { currentUser, logout, setSelectedSalon } = useStore();
  const reduce = useReducedMotion();

  const [accountOpen, setAccountOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const headerRef = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const searchTimers = useRef<number[]>([]);

  const isStudio = currentUser?.role === 'studio';
  const isAdmin = currentUser?.role === 'admin';
  // Guests get the salon portal as an acquisition entry; providers get their own tool.
  const showSalonPortal = !currentUser || isStudio;
  const toolItems = [...TOOL_ITEMS];
  if (showSalonPortal) toolItems.push(SALON_ITEM);
  if (isAdmin) toolItems.push(ADMIN_ITEM);
  const personalActive =
    activeTab === 'client' ||
    activeTab === 'admin' ||
    activeTab === 'image-studio' ||
    activeTab === 'video-studio' ||
    activeTab === 'concierge' ||
    (activeTab === 'provider' && showSalonPortal);

  const modKey = useMemo(
    () =>
      typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
        ? '⌘ K'
        : 'Ctrl K',
    []
  );

  const goTab = useCallback(
    (tab: string) => {
      setActiveTab(tab);
      setMobileOpen(false);
      setAccountOpen(false);
      setMoreOpen(false);
    },
    [setActiveTab]
  );

  const handleSignOut = () => {
    logout();
    setAccountOpen(false);
    setMobileOpen(false);
    setActiveTab('explore');
  };

  /** Header search affordance: jump to Discover and focus the hero search field. */
  const focusSearch = useCallback(() => {
    goTab('explore');
    setSelectedSalon(null);
    searchTimers.current.forEach((id) => clearTimeout(id));
    searchTimers.current = [60, 260, 480].map((ms) =>
      window.setTimeout(() => {
        const el = document.getElementById('hero-search');
        if (el instanceof HTMLInputElement) el.focus();
      }, ms)
    );
  }, [goTab, setSelectedSalon]);

  // Condense the header once the page is scrolled.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 96);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close menus on outside click (and collapse the mobile panel if it leaves the header).
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (accountRef.current && !accountRef.current.contains(target)) setAccountOpen(false);
      if (moreRef.current && !moreRef.current.contains(target)) setMoreOpen(false);
      if (mobileOpen && headerRef.current && !headerRef.current.contains(target)) {
        setMobileOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [mobileOpen]);

  // Escape closes every open menu; Cmd/Ctrl+K focuses search.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setAccountOpen(false);
        setMoreOpen(false);
        setMobileOpen(false);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        focusSearch();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusSearch]);

  // Collapse the mobile panel when the desktop breakpoint kicks in.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(
    () => () => {
      searchTimers.current.forEach((id) => clearTimeout(id));
    },
    []
  );

  const menuPanelClass =
    'absolute top-full right-0 z-50 mt-2 w-60 rounded-2xl border border-line bg-elevated p-2 shadow-2xl';
  const menuMotion = {
    initial: { opacity: 0, y: -6, scale: 0.97 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -6, scale: 0.97 },
    transition: { duration: reduce ? 0 : 0.15, ease: 'easeOut' as const },
  };

  return (
    <header
      ref={headerRef}
      className={`sticky top-0 z-40 w-full border-b bg-canvas/95 backdrop-blur-md transition-colors duration-300 ${
        scrolled ? 'border-line shadow-lg shadow-black/40' : 'border-surface'
      }`}
    >
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 transition-[height] duration-300 sm:px-6 lg:px-8 ${
          scrolled ? 'h-16' : 'h-20'
        }`}
      >
        {/* Brand */}
        <button
          type="button"
          onClick={() => goTab('explore')}
          aria-label="Leish! home"
          className={`flex shrink-0 items-center space-x-2 rounded-lg pr-2 transition-all duration-300 ${FOCUS_RING}`}
        >
          <span
            aria-hidden="true"
            className={`flex items-baseline font-serif font-semibold tracking-tight text-brand-champagne transition-all duration-300 ${
              scrolled ? 'text-2xl' : 'text-3xl'
            }`}
          >
            <span>Lei</span>
            <span className="font-bold italic text-brand-gold">sh</span>
            <span className="ml-0.5 text-2xl">!</span>
          </span>
          <span
            aria-hidden="true"
            className={`border-l border-surface pl-2 font-mono text-xs uppercase tracking-widest text-fg transition-all duration-300 ${
              scrolled ? 'hidden' : 'hidden pt-2 sm:block'
            }`}
          >
            Aesthetic Market
          </span>
        </button>

        {/* Primary navigation */}
        <nav aria-label="Primary" className="hidden items-center gap-0.5 md:flex sm:gap-1">
          {PRIMARY_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goTab(item.id)}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
                className={`relative flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium tracking-wide transition-colors duration-300 sm:px-3.5 sm:text-sm ${FOCUS_RING} ${
                  isActive
                    ? 'text-on-primary'
                    : 'text-fg-muted hover:bg-surface hover:text-fg'
                }`}
              >
                {isActive && (
                  <motion.span
                    aria-hidden="true"
                    layoutId="desktop-nav-active"
                    className="absolute inset-0 rounded-full bg-primary shadow-lg shadow-primary/20"
                    transition={springTransition(reduce)}
                  />
                )}
                <Icon aria-hidden="true" className="relative h-3.5 w-3.5 shrink-0" />
                <span className="relative hidden whitespace-nowrap lg:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Utilities + account */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={focusSearch}
            aria-label={`Search salons and artists (${modKey})`}
            className={`hidden items-center gap-2 rounded-full border border-accent-soft bg-elevated px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-accent/60 hover:text-fg md:inline-flex ${FOCUS_RING}`}
          >
            <Search aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Search</span>
            <kbd
              aria-hidden="true"
              className="hidden rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] leading-none text-fg-dim xl:inline-block"
            >
              {modKey}
            </kbd>
          </button>

          {/* Guest-only "More" menu keeps Bookings / Portal reachable when signed out */}
          {!currentUser && (
            <div className="relative hidden md:block" ref={moreRef}>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen((v) => !v);
                  setAccountOpen(false);
                }}
                aria-expanded={moreOpen}
                aria-controls="nav-more-menu"
                aria-label="Portals and tools"
                title="Portals and tools"
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors ${FOCUS_RING} ${
                  personalActive || moreOpen
                     ? 'bg-primary/20 text-fg'
                    : 'text-fg-muted hover:bg-surface hover:text-fg'
                }`}
              >
                <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                <span className="hidden lg:inline">More</span>
                <ChevronDown
                  aria-hidden="true"
                  className={`hidden h-3.5 w-3.5 transition-transform lg:inline ${
                    moreOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              <AnimatePresence>
                {moreOpen && (
                  <motion.div
                    id="nav-more-menu"
                    {...menuMotion}
                    className={menuPanelClass}
                  >
                    <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-widest text-fg-dim">
                      Portals &amp; tools
                    </p>
                    {toolItems.map((item) => (
                      <MenuRow
                        key={item.id}
                        icon={item.icon}
                        label={item.label}
                        active={activeTab === item.id}
                        onClick={() => goTab(item.id)}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {currentUser ? (
            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => {
                  setAccountOpen((v) => !v);
                  setMoreOpen(false);
                }}
                aria-expanded={accountOpen}
                aria-controls="nav-account-menu"
                className={`flex items-center space-x-2.5 rounded-full border py-1.5 pl-2 pr-3.5 text-xs transition-all ${FOCUS_RING} ${
                  accountOpen || personalActive
                    ? 'border-accent/60 bg-accent/15'
                    : 'border-accent-soft bg-elevated hover:border-accent/60'
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent/50 bg-chip">
                  {currentUser.avatar ? (
                    <img
                      src={currentUser.avatar}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserIcon aria-hidden="true" className="h-3.5 w-3.5 text-fg" />
                  )}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[100px] truncate text-xs font-medium leading-tight text-fg">
                    {currentUser.name}
                  </span>
                  <span className="block font-mono text-[10px] capitalize text-fg-subtle">
                    {isStudio ? 'Salon Director' : 'VIP Client'}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 text-fg-dim transition-transform ${accountOpen ? 'rotate-180' : ''}`}
                />
              </button>

              <AnimatePresence>
                {accountOpen && (
                  <motion.div
                    id="nav-account-menu"
                    {...menuMotion}
                    className={menuPanelClass}
                  >
                    <div className="mb-1 border-b border-surface px-3 py-2">
                      <p className="truncate text-xs font-semibold text-fg">
                        {currentUser.name}
                      </p>
                      <p className="truncate font-mono text-[11px] text-fg-dim">
                        {currentUser.email}
                      </p>
                      <span className="mt-1 inline-block rounded-full border border-accent/40 bg-accent/20 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-fg">
                        {isStudio ? 'Salon Partner' : 'Client Account'}
                      </span>
                    </div>

                    <MenuRow
                      icon={Settings}
                      label="Profile & Account"
                      onClick={() => {
                        setAccountOpen(false);
                        onOpenProfile();
                      }}
                    />
                    <MenuRow
                      icon={Calendar}
                      label="My Bookings"
                      active={activeTab === 'client'}
                      onClick={() => goTab('client')}
                    />
                    {isStudio && (
                      <MenuRow
                        icon={Scissors}
                        label="Salon Portal"
                        active={activeTab === 'provider'}
                        onClick={() => goTab('provider')}
                      />
                    )}

                    <div className="my-1 border-t border-surface" />

                    <MenuRow icon={LogOut} label="Sign Out" danger onClick={handleSignOut} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onOpenAuth('signin')}
                className={`hidden items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-fg-muted transition-colors hover:text-fg lg:inline-flex ${FOCUS_RING}`}
              >
                <LogIn aria-hidden="true" className="h-3.5 w-3.5" />
                <span>Sign in</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenAuth('signup')}
                 className={`inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-on-primary shadow-md shadow-primary/25 transition-all hover:bg-primary-hover active:scale-95 ${FOCUS_RING}`}
              >
                <UserPlus aria-hidden="true" className="h-3.5 w-3.5" />
                <span>Get started</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className={`rounded-xl p-3 text-fg-dim transition-colors hover:bg-surface hover:text-fg md:hidden ${FOCUS_RING}`}
          >
            {mobileOpen ? (
              <X aria-hidden="true" className="h-5 w-5" />
            ) : (
              <Menu aria-hidden="true" className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile navigation */}
      <AnimatePresence initial={false}>
        {mobileOpen && (
          <motion.div
            id="mobile-nav"
            key="mobile-nav"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.25, ease: 'easeInOut' }}
            className="overflow-hidden md:hidden"
          >
            <div className="space-y-4 border-t border-surface bg-canvas px-4 py-4">
              <MobileGroup labelId="nav-group-explore" label="Explore">
                {PRIMARY_ITEMS.map((item) => (
                  <MobileRow
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    active={activeTab === item.id}
                    onClick={() => goTab(item.id)}
                  />
                ))}
              </MobileGroup>

              <MobileGroup labelId="nav-group-tools" label="Tools">
                {toolItems.map((item) => (
                  <MobileRow
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    active={activeTab === item.id}
                    onClick={() => goTab(item.id)}
                  />
                ))}
              </MobileGroup>

              <MobileGroup labelId="nav-group-account" label="Account">
                {currentUser ? (
                  <div className="space-y-1">
                    <MobileRow
                      icon={Settings}
                      label="Profile & Account"
                      onClick={() => {
                        setMobileOpen(false);
                        onOpenProfile();
                      }}
                    />
                    <MobileRow icon={LogOut} label="Sign Out" onClick={handleSignOut} />
                    <p className="px-3 pt-1 font-mono text-[10px] text-fg-dim">
                      {currentUser.email}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMobileOpen(false);
                        onOpenAuth('signin');
                      }}
                      className={`rounded-xl border border-accent-soft bg-elevated py-3 text-center text-xs font-medium text-fg transition-colors hover:border-accent ${FOCUS_RING}`}
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileOpen(false);
                        onOpenAuth('signup');
                      }}
                       className={`rounded-xl bg-primary py-3 text-center text-xs font-semibold text-on-primary transition-all active:scale-95 ${FOCUS_RING}`}
                    >
                      Get started
                    </button>
                  </div>
                )}
              </MobileGroup>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
