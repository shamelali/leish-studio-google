/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * AuthChoice — provider selection page for Leish! Aesthetic Marketplace.
 * Renders at /auth. Offers email/password and OAuth (Google, Facebook).
 * On OAuth success, App exchanges the Supabase session for an app JWT via
 * POST /api/auth/oauth, so sessions stay uniform across all providers.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mail,
  Lock,
  User as UserIcon,
  Sparkles,
  Building2,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Facebook,
  X,
  Loader2,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi } from '../lib/api';
import { supabaseBrowser, signInWithGoogle, signInWithFacebook } from '../lib/supabase';
import type { User } from '../types';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  role: z.enum(['client', 'MUA', 'studio']).optional(),
  phone: z.string().optional(),
  bio: z.string().max(500).optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;

interface AuthChoiceProps {
  onAuthSuccess: (user: User, token: string) => void;
  onClose: () => void;
}

const PROVIDERS = [
  { id: 'google', label: 'Continue with Google', icon: undefined as React.ComponentType<any> | undefined, color: 'text-red-600', bg: 'bg-white' },
  { id: 'facebook', label: 'Continue with Facebook', icon: Facebook, color: 'text-blue-600', bg: 'bg-white' },
] as const;

export default function AuthChoice({ onAuthSuccess, onClose }: AuthChoiceProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [busy, setBusy] = useState<'idle' | 'signing-in' | 'signing-up' | 'oauth'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'client',
      phone: '',
      bio: '',
    },
  });

  React.useEffect(() => {
    loginForm.reset();
    registerForm.reset();
    setErrorMessage(null);
  }, []);

  const handleLogin = async (data: LoginFormData) => {
    setErrorMessage(null);
    setBusy('signing-in');
    try {
      const response = await authApi.login(data);
      onAuthSuccess(response.user, response.token);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to sign in. Please check your credentials.');
      setBusy('idle');
    }
  };

  const handleRegister = async (data: RegisterFormData) => {
    setErrorMessage(null);
    setBusy('signing-up');
    try {
      const response = await authApi.register(data);
      onAuthSuccess(response.user, response.token);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed. Please try again.');
      setBusy('idle');
    }
  };

  const handleOAuth = async (provider: 'google' | 'facebook') => {
    setErrorMessage(null);
    setBusy('oauth');
    if (!supabaseBrowser) {
      setErrorMessage('OAuth sign-in is not set up in this environment yet. Use email sign-in instead.');
      setBusy('idle');
      return;
    }
    try {
      const { error } = await supabaseBrowser.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      // signInWithOAuth redirects the browser; if we're still here, it failed silently
      setBusy('idle');
    } catch (err: any) {
      setErrorMessage(err.message || `${provider.charAt(0).toUpperCase() + provider.slice(1)} sign-in failed.`);
      setBusy('idle');
    }
  };

  const isOAuthBusy = busy === 'oauth';
  const isFormBusy = busy === 'signing-in' || busy === 'signing-up';

  return (
    <div className="min-h-screen bg-canvas text-fg flex flex-col font-sans">
      <nav className="sticky top-0 z-40 w-full border-b border-line bg-canvas/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 flex items-center justify-between h-16">
          <button
            type="button"
            onClick={onClose}
            aria-label="Leish! home"
            className="flex shrink-0 items-center space-x-2 rounded-lg pr-2 transition-all duration-300"
          >
            <span className="flex items-baseline font-serif font-semibold tracking-tight text-brand-champagne text-3xl">
              <span>Lei</span>
              <span className="text-brand-gold italic font-bold">sh</span>
              <span className="text-brand-champagne text-2xl ml-0.5">!</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-xl p-3 text-fg-dim transition-colors hover:bg-surface hover:text-fg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </nav>

      <main className="flex-grow flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.25 }}
            className="w-full max-w-md my-4"
          >
            <div className="relative w-full max-w-md rounded-3xl border border-line bg-recessed p-6 sm:p-8 shadow-2xl shadow-black/90">
              {/* Brand */}
              <div className="text-center mb-8">
                <div className="inline-flex items-baseline font-serif text-3xl font-semibold tracking-tight text-brand-champagne mb-1">
                  <span>Lei</span>
                  <span className="text-brand-gold italic font-bold">sh</span>
                  <span className="text-brand-champagne text-2xl ml-0.5">!</span>
                </div>
                <p className="text-xs font-mono uppercase tracking-widest text-fg">
                  Aesthetic Marketplace
                </p>
              </div>

              {/* OAuth providers */}
              <div className="space-y-3 mb-8">
                {PROVIDERS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleOAuth(p.id)}
                      disabled={isOAuthBusy}
                      className={`w-full flex items-center justify-center space-x-2.5 rounded-xl py-2.5 px-4 text-sm font-medium shadow hover:scale-[0.99] transition-all disabled:opacity-60 ${
                        p.bg === 'bg-white'
                          ? 'border border-line text-slate-700 hover:bg-slate-50 active:scale-[0.99]'
                          : ''
                      } ${p.color}`}
                    >
                      {isOAuthBusy ? (
                        <div className="h-5 w-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                      ) : (
                        p.icon ? <p.icon className="h-5 w-5" /> : <span className="text-[10px] font-mono">{p.id.charAt(0).toUpperCase() + p.id.slice(1)}</span>
                      )}
                      <span>{isOAuthBusy ? 'Connecting…' : p.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 my-8">
                <div className="h-px flex-1 bg-line" />
                <span className="text-[11px] font-mono uppercase tracking-wider text-fg-dim">or with email</span>
                <div className="h-px flex-1 bg-line" />
              </div>

              {/* Email form */}
              <AnimatePresence mode="wait">
                {mode === 'signin' ? (
                  <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-fg-muted mb-1.5">
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-dim" />
                        <input
                          type="email"
                          {...loginForm.register('email')}
                          placeholder="name@example.com"
                          className="w-full rounded-xl border border-accent-soft bg-inset py-2.5 pl-10 pr-3 text-sm text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none transition-colors"
                        />
                      </div>
                      {loginForm.formState.errors.email && (
                        <p className="text-[10px] text-danger mt-1">{loginForm.formState.errors.email.message}</p>
                      )}
                    </div>

                    <div>
                      <div className="mb-1.5">
                        <label className="block text-xs font-mono uppercase tracking-wider text-fg-muted">
                          Password
                        </label>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-dim" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          {...loginForm.register('password')}
                          placeholder="••••••••"
                          className="w-full rounded-xl border border-accent-soft bg-inset py-2.5 pl-10 pr-10 text-sm text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-fg-dim hover:text-fg"
                        >
                          {showPassword ? <X className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        </button>
                      </div>
                      {loginForm.formState.errors.password && (
                        <p className="text-[10px] text-danger mt-1">{loginForm.formState.errors.password.message}</p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isFormBusy || loginForm.formState.isSubmitting}
                      className="w-full flex items-center justify-center space-x-2 rounded-xl bg-primary py-3 px-4 text-sm font-semibold text-on-primary shadow-lg shadow-accent/25 hover:bg-primary-hover active:scale-[0.99] transition-all disabled:opacity-50"
                    >
                      {isFormBusy || loginForm.formState.isSubmitting ? (
                        <div className="h-5 w-5 border-2 border-fg/30 border-t-fg rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>Sign In to Leish!</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-fg-muted mb-2">
                        I want to join as:
                      </label>
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => registerForm.setValue('role', 'client')}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                            registerForm.watch('role') === 'client'
                              ? 'border-accent bg-accent/15 text-fg'
                              : 'border-line bg-inset text-fg-dim hover:border-line'
                          }`}
                        >
                          <Sparkles className={`h-4 w-4 mb-1.5 ${registerForm.watch('role') === 'client' ? 'text-fg' : 'text-fg-dim'}`} />
                          <span className="text-xs font-medium">Makeup Client</span>
                          <span className="text-[10px] text-fg-muted mt-0.5">Book glam & trials</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => registerForm.setValue('role', 'MUA')}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                            registerForm.watch('role') === 'MUA'
                              ? 'border-accent bg-accent/15 text-fg'
                              : 'border-line bg-inset text-fg-dim hover:border-line'
                          }`}
                        >
                          <UserIcon className={`h-4 w-4 mb-1.5 ${registerForm.watch('role') === 'MUA' ? 'text-fg' : 'text-fg-dim'}`} />
                          <span className="text-xs font-medium">Makeup Artist</span>
                          <span className="text-[10px] text-fg-muted mt-0.5">Independent MUA</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => registerForm.setValue('role', 'studio')}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                            registerForm.watch('role') === 'studio'
                              ? 'border-accent bg-accent/15 text-fg'
                              : 'border-line bg-inset text-fg-dim hover:border-line'
                          }`}
                        >
                          <Building2 className={`h-4 w-4 mb-1.5 ${registerForm.watch('role') === 'studio' ? 'text-fg' : 'text-fg-dim'}`} />
                          <span className="text-xs font-medium">Salon Admin</span>
                          <span className="text-[10px] text-fg-muted mt-0.5">Manage a salon</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => registerForm.setValue('role', 'studio')}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                            registerForm.watch('role') === 'studio'
                              ? 'border-accent bg-accent/15 text-fg'
                              : 'border-line bg-inset text-fg-dim hover:border-line'
                          }`}
                        >
                          <Building2 className={`h-4 w-4 mb-1.5 ${registerForm.watch('role') === 'studio' ? 'text-fg' : 'text-fg-dim'}`} />
                          <span className="text-xs font-medium">Salon Owner</span>
                          <span className="text-[10px] text-fg-muted mt-0.5">Own your listing</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-fg-muted mb-1.5">
                        Full Name
                      </label>
                      <div className="relative">
                        <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-dim" />
                        <input
                          type="text"
                          {...registerForm.register('name')}
                          placeholder="e.g. Camille Laurent"
                          className="w-full rounded-xl border border-accent-soft bg-inset py-2.5 pl-10 pr-3 text-sm text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none transition-colors"
                        />
                      </div>
                      {registerForm.formState.errors.name && (
                        <p className="text-[10px] text-danger mt-1">{registerForm.formState.errors.name.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-fg-muted mb-1.5">
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-dim" />
                        <input
                          type="email"
                          {...registerForm.register('email')}
                          placeholder="name@example.com"
                          className="w-full rounded-xl border border-accent-soft bg-inset py-2.5 pl-10 pr-3 text-sm text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none transition-colors"
                        />
                      </div>
                      {registerForm.formState.errors.email && (
                        <p className="text-[10px] text-danger mt-1">{registerForm.formState.errors.email.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-fg-muted mb-1.5">
                        Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-dim" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          {...registerForm.register('password')}
                          placeholder="••••••••"
                          className="w-full rounded-xl border border-accent-soft bg-inset py-2.5 pl-10 pr-10 text-sm text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-fg-dim hover:text-fg"
                        >
                          {showPassword ? <X className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        </button>
                      </div>
                      {registerForm.formState.errors.password && (
                        <p className="text-[10px] text-danger mt-1">{registerForm.formState.errors.password.message}</p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isFormBusy || registerForm.formState.isSubmitting}
                      className="w-full flex items-center justify-center space-x-2 rounded-xl bg-primary py-3 px-4 text-sm font-semibold text-on-primary shadow-lg shadow-accent/25 hover:bg-primary-hover active:scale-[0.99] transition-all disabled:opacity-50"
                    >
                      {isFormBusy || registerForm.formState.isSubmitting ? (
                        <div className="h-5 w-5 border-2 border-fg/30 border-t-fg rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>Create My Account</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </form>
                )}
              </AnimatePresence>

              <AnimatePresence mode="wait">
                {errorMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="mt-6 flex items-start space-x-2.5 rounded-xl border border-danger-border/30 bg-danger-surface/40 p-3.5 text-xs text-danger"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 text-danger mt-0.5" />
                    <span>{errorMessage}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-8 flex items-center justify-center space-x-1.5 text-[11px] text-fg-dim">
                <ShieldCheck className="h-3.5 w-3.5 text-accent-text" />
                <span>Encrypted Beauty Profile • Leish! Aesthetic Security</span>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}