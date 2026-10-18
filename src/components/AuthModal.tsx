/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  X,
  Mail,
  Lock,
  User as UserIcon,
  Phone,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Building2,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { User } from '../types';
import { authApi } from '../lib/api';
import { supabaseBrowser, signInWithGoogle } from '../lib/supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
  onAuthSuccess: (user: User, token: string) => void;
  promptMessage?: string;
}

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  role: z.enum(['client', 'MUA', 'studio', 'admin']).optional(),
  phone: z.string().optional(),
  bio: z.string().max(500).optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;

export default function AuthModal({
  isOpen,
  onClose,
  initialMode = 'signin',
  onAuthSuccess,
  promptMessage
}: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

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
    if (isOpen) {
      setMode(initialMode);
      setErrorMessage(null);
      setSuccessMessage(null);
      loginForm.reset();
      registerForm.reset();
    }
  }, [isOpen, initialMode, loginForm, registerForm]);

  if (!isOpen) return null;

  const handleLogin = async (data: LoginFormData) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await authApi.login(data);
      setSuccessMessage(`Welcome back, ${response.user.name}!`);
      setTimeout(() => {
        onAuthSuccess(response.user, response.token);
        onClose();
      }, 800);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to sign in. Please check your credentials.');
    }
  };

  const handleRegister = async (data: RegisterFormData) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await authApi.register(data);
      setSuccessMessage('Account created successfully! Signing you in...');
      setTimeout(() => {
        onAuthSuccess(response.user, response.token);
        onClose();
      }, 900);
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed. Please try again.');
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!supabaseBrowser) {
      setErrorMessage('Google sign-in is not set up in this environment yet. Use email sign-in instead.');
      return;
    }
    setGoogleBusy(true);
    try {
      // Redirects to Google; on return App exchanges the Supabase session
      // for an app session via POST /api/auth/oauth.
      await signInWithGoogle();
    } catch (err: any) {
      setErrorMessage(err.message || 'Google sign-in failed. Please try again.');
      setGoogleBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.25 }}
        className="relative w-full max-w-md my-8 rounded-3xl border border-line bg-recessed p-6 sm:p-8 shadow-2xl shadow-black/90 text-fg"
      >
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-2 text-fg-dim hover:bg-surface hover:text-fg transition-colors"
          aria-label="Close authentication modal"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-baseline font-serif text-3xl font-semibold tracking-tight text-brand-champagne mb-1">
            <span>Lei</span>
            <span className="text-brand-gold italic font-bold">sh</span>
            <span className="text-brand-champagne text-2xl ml-0.5">!</span>
          </div>
          <p className="text-xs font-mono uppercase tracking-widest text-fg">
            Aesthetic Marketplace
          </p>
          {promptMessage && (
            <div className="mt-3 inline-block rounded-xl border border-accent-soft/40 bg-accent/10 px-3.5 py-1.5 text-xs text-fg">
              {promptMessage}
            </div>
          )}
        </div>

        <div className="mb-6">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleBusy}
            className="w-full flex items-center justify-center space-x-2.5 rounded-xl bg-white py-2.5 px-4 text-sm font-medium text-slate-700 shadow hover:bg-slate-100 active:scale-[0.99] transition-all disabled:opacity-60"
          >
            {googleBusy ? (
              <div className="h-5 w-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
                <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
              </svg>
            )}
            <span>{googleBusy ? 'Connecting to Google…' : 'Continue with Google'}</span>
          </button>
          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-line" />
            <span className="text-[11px] font-mono uppercase tracking-wider text-fg-dim">or with email</span>
            <div className="h-px flex-1 bg-line" />
          </div>
        </div>

        <div className="flex rounded-xl bg-panel-mid p-1 mb-6 border border-line">
          <button
            type="button"
            onClick={() => { setMode('signin'); setErrorMessage(null); }}
            className={`flex-1 py-2 text-xs font-medium tracking-wide rounded-lg transition-all duration-200 ${
              mode === 'signin'
                ? 'bg-primary text-on-primary shadow-md font-semibold'
                : 'text-fg-dim hover:text-fg'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setErrorMessage(null); }}
            className={`flex-1 py-2 text-xs font-medium tracking-wide rounded-lg transition-all duration-200 ${
              mode === 'signup'
                ? 'bg-primary text-on-primary shadow-md font-semibold'
                : 'text-fg-dim hover:text-fg'
            }`}
          >
            Create Account
          </button>
        </div>

        <AnimatePresence mode="wait">
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-5 flex items-start space-x-2.5 rounded-xl border border-danger-border/30 bg-danger-surface/40 p-3.5 text-xs text-danger"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-danger mt-0.5" />
              <span>{errorMessage}</span>
            </motion.div>
          )}

          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-5 flex items-center space-x-2.5 rounded-xl border border-success-border/30 bg-success-surface/40 p-3.5 text-xs text-success"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              <span>{successMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

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
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {loginForm.formState.errors.password && (
                <p className="text-[10px] text-danger mt-1">{loginForm.formState.errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loginForm.formState.isSubmitting}
              className="w-full mt-2 flex items-center justify-center space-x-2 rounded-xl bg-primary py-3 px-4 text-sm font-semibold text-on-primary shadow-lg shadow-accent/25 hover:bg-primary-hover active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {loginForm.formState.isSubmitting ? (
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
                  onClick={() => registerForm.setValue('role', 'studio')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                    registerForm.watch('role') === 'studio'
                      ? 'border-accent bg-accent/15 text-fg'
                      : 'border-line bg-inset text-fg-dim hover:border-line'
                  }`}
                >
                  <Building2 className={`h-4 w-4 mb-1.5 ${registerForm.watch('role') === 'studio' ? 'text-fg' : 'text-fg-dim'}`} />
                  <span className="text-xs font-medium">Studio / MUA</span>
                  <span className="text-[10px] text-fg-muted mt-0.5">Makeup Artist Director</span>
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
                Phone Number <span className="text-[10px] text-fg-dim normal-case">(For booking SMS alerts)</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-dim" />
                <input
                  type="tel"
                  {...registerForm.register('phone')}
                  placeholder="+60 12-345 6789"
                  className="w-full rounded-xl border border-accent-soft bg-inset py-2.5 pl-10 pr-3 text-sm text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none transition-colors"
                />
              </div>
            </div>

            {registerForm.watch('role') === 'studio' && (
              <p className="text-xs text-fg-muted">A studio administrator will link your account to a listing after verification.</p>
            )}

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
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {registerForm.formState.errors.password && (
                <p className="text-[10px] text-danger mt-1">{registerForm.formState.errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={registerForm.formState.isSubmitting}
              className="w-full mt-2 flex items-center justify-center space-x-2 rounded-xl bg-primary py-3 px-4 text-sm font-semibold text-on-primary shadow-lg shadow-accent/25 hover:bg-primary-hover active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {registerForm.formState.isSubmitting ? (
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

        <div className="mt-4 flex items-center justify-center space-x-1.5 text-[11px] text-fg-dim">
          <ShieldCheck className="h-3.5 w-3.5 text-accent-text" />
          <span>Encrypted Beauty Profile • Leish! Aesthetic Security</span>
        </div>
      </motion.div>
    </div>
  );
}
