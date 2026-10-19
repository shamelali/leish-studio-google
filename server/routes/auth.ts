/**
 * Authentication & user-profile routes (extracted from server.ts).
 * Register / login / OAuth exchange / current user / profile update.
 */
import type { Express, Request } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { User } from '../../src/types.ts';
import type { StoredUser } from '../data-store.ts';
import {
  isSupabaseAuthConfigured,
  verifySupabasePassword,
  verifySupabaseToken,
  createSupabaseUser,
  deleteSupabaseUser,
  type VerifiedIdentity,
} from '../supabase-auth.ts';
import { generateUserId, generateOauthPlaceholderPassword } from '../ids.ts';
import { serverError } from '../http-utils.ts';
import type { AuthenticatedRequest, RouteContext } from './context.ts';

const JWT_EXPIRES_IN = '7d';

const STUDIO_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200';
const CLIENT_AVATAR = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200';

// Helper to strip sensitive data
export const sanitizeUser = (u: User | StoredUser): User => {
  const { password: _password, ...safeUser } = u as StoredUser;
  return safeUser as User;
};

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  role: z.enum(['client', 'MUA', 'studio']).optional(),
  phone: z.string().optional(),
  bio: z.string().max(500).optional(),
});

// Login accepts an email address or a short demo username (e.g. the
// `client` / `studio` demo accounts). Registration still requires a
// real email address; see registerSchema above.
const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email or demo username.').max(254),
  password: z.string().min(1),
});

const oauthCompleteSchema = z.object({
  role: z.enum(['client', 'MUA', 'studio']),
});

const updateProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  phone: z.string().optional(),
  bio: z.string().max(500).optional(),
  avatar: z.string().url().optional(),
});

const issueToken = (userId: string, secret: string): string =>
  jwt.sign({ userId }, secret, { expiresIn: JWT_EXPIRES_IN });

const defaultBio = (role: string | undefined): string =>
  role === 'studio'
    ? 'Boutique beauty specialist at Leish! Aesthetic Marketplace.'
    : 'Beauty enthusiast exploring curated salon treatments.';

const mappedRole = (role: string | undefined): User['role'] =>
  role === 'studio' ? 'studio' : role === 'MUA' ? 'MUA' : 'client';

/** Extracts the Bearer credential from a request (empty string when absent). */
const bearerToken = (req: Request): string => {
  const authHeader = req.headers.authorization;
  return authHeader && authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '').trim() : '';
};

export function registerAuthRoutes(app: Express, ctx: RouteContext): void {
  const { store: appStore, jwtSecret: JWT_SECRET, authenticateToken } = ctx;

  // API Route: Register new user (Sign Up)
  app.post('/api/auth/register', async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const { name, email, password, role, phone, bio } = parsed.data;

      const normalizedEmail = email.trim().toLowerCase();
      const existing = await appStore.getUserByEmail(normalizedEmail);
      if (existing) {
        return res.status(400).json({ error: 'An account with this email already exists. Please sign in instead.' });
      }

      const defaultAvatar = role === 'studio' ? STUDIO_AVATAR : CLIENT_AVATAR;

      // Supabase Auth owns credentials when configured: pre-confirmed Auth
      // user first, then the app profile keyed by the Auth id. If Supabase
      // Auth user creation fails (e.g. FK constraint on shared tables), fall
      // through to the legacy bcrypt path so registration keeps working.
      let supabaseIdentity: VerifiedIdentity | null = null;
      if (isSupabaseAuthConfigured()) {
        supabaseIdentity = await createSupabaseUser(normalizedEmail, password, name.trim());
      }

      let newUser: StoredUser;
      let token: string;

      if (supabaseIdentity) {
        try {
          newUser = await appStore.createUser({
            id: supabaseIdentity.id,
            name: name.trim(),
            email: normalizedEmail,
            password,
            role: mappedRole(role),
            phone: phone ? phone.trim() : undefined,
            bio: bio ? bio.trim() : defaultBio(role),
            avatar: defaultAvatar,
            createdAt: new Date().toISOString()
          });
          token = issueToken(newUser.id, JWT_SECRET);
          return res.status(201).json({
            user: sanitizeUser(newUser),
            token,
            message: 'Account successfully registered!'
          });
        } catch (error: any) {
          await deleteSupabaseUser(supabaseIdentity.id);
          if (error?.message && /already (exists|registered)/i.test(error.message)) {
            return res.status(400).json({ error: 'An account with this email already exists. Please sign in instead.' });
          }
          return res.status(500).json({ error: 'Registration failed' });
        }
      }

      // Legacy bcrypt path (Supabase Auth not configured or user creation failed).
      newUser = await appStore.createUser({
        id: generateUserId(),
        name: name.trim(),
        email: normalizedEmail,
        password,
        role: mappedRole(role),
        phone: phone ? phone.trim() : undefined,
        // Studio ownership is provisioned by an administrator, never claimed at signup.
        bio: bio ? bio.trim() : defaultBio(role),
        avatar: defaultAvatar,
        createdAt: new Date().toISOString()
      });

      token = issueToken(newUser.id, JWT_SECRET);

      res.status(201).json({
        user: sanitizeUser(newUser),
        token,
        message: 'Account successfully registered!'
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // API Route: Sign In (Login)
  app.post('/api/auth/login', async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const { email, password } = parsed.data;
      const normalizedEmail = email.trim().toLowerCase();

      // Supabase Auth verifies credentials when configured; sessions stay
      // app JWTs so the client shape and middleware are unchanged. If the
      // user is not found in Supabase Auth (e.g. registered via legacy
      // bcrypt path), fall through to the legacy check instead of 401.
      let supabaseIdentity: VerifiedIdentity | null = null;
      if (isSupabaseAuthConfigured()) {
        supabaseIdentity = await verifySupabasePassword(email, password);
      }

      let user: StoredUser | undefined;

      if (supabaseIdentity) {
        user = (await appStore.getUserById(supabaseIdentity.id)) ?? (await appStore.getUserByEmail(supabaseIdentity.email.trim().toLowerCase()));
        if (!user || user.email.trim().toLowerCase() !== normalizedEmail) {
          return res.status(401).json({ error: 'Invalid email or password.' });
        }
      } else {
        // Legacy bcrypt path.
        user = await appStore.getUserByEmail(normalizedEmail);
        if (!user) {
          return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const passwordValid = await bcrypt.compare(password, user.password);
        if (!passwordValid) {
          return res.status(401).json({ error: 'Invalid email or password.' });
        }
      }

      const token = issueToken(user.id, JWT_SECRET);

      res.json({
        user: sanitizeUser(user),
        token,
        message: `Welcome back, ${user.name}!`
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Sign in failed' });
    }
  });

  // API Route: OAuth session exchange (Supabase Auth: Google + any provider).
  // The browser signs in via Supabase (lib/supabase browser client) and
  // POSTs its Supabase access token as the Bearer credential. The server
  // verifies it, finds or creates the app profile, and mints the standard
  // app JWT, so sessions stay uniform across password and OAuth sign-ins.
  app.post('/api/auth/oauth', async (req, res) => {
    try {
      const supabaseToken = bearerToken(req);
      if (!supabaseToken) {
        return res.status(401).json({ error: 'A sign-in token is required.' });
      }
      if (!isSupabaseAuthConfigured()) {
        return res.status(503).json({ error: 'OAuth sign-in is not configured on the server.' });
      }
      const identity = await verifySupabaseToken(supabaseToken);
      if (!identity?.email) {
        return res.status(401).json({ error: 'Invalid sign-in. Please try again.' });
      }
      const normalizedEmail = identity.email.trim().toLowerCase();
      const user = (await appStore.getUserById(identity.id)) ?? (await appStore.getUserByEmail(normalizedEmail));
      if (!user) {
        // New OAuth user: return needs_role_selection so the client can
        // show a role picker before creating the profile.
        return res.json({
          needs_role_selection: true,
          identity: {
            id: identity.id,
            email: normalizedEmail,
            name: identity.name?.trim().slice(0, 100) || normalizedEmail.split('@')[0],
            avatar: identity.avatar,
          },
        });
      }
      res.json({
        user: sanitizeUser(user),
        token: issueToken(user.id, JWT_SECRET),
        message: `Welcome${user.name ? `, ${user.name}` : ''}!`,
      });
    } catch (error: any) {
      serverError(res, 'OAuth sign-in failed');
    }
  });

  // API Route: Complete OAuth registration with role selection.
  // Called after /api/auth/oauth returns needs_role_selection: true.
  // Verifies the Supabase access token (same as /api/auth/oauth) and creates
  // the app profile with the selected role.
  app.post('/api/auth/oauth/complete', async (req, res) => {
    try {
      const supabaseToken = bearerToken(req);
      if (!supabaseToken) {
        return res.status(401).json({ error: 'A sign-in token is required.' });
      }
      const identity = await verifySupabaseToken(supabaseToken);
      if (!identity?.email) {
        return res.status(401).json({ error: 'Invalid sign-in. Please try again.' });
      }
      const parsed = oauthCompleteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { role } = parsed.data;
      const normalizedEmail = identity.email.trim().toLowerCase();
      const existing = await appStore.getUserById(identity.id) ?? await appStore.getUserByEmail(normalizedEmail);
      if (!existing) {
        const displayName = identity.name?.trim().slice(0, 100) || normalizedEmail.split('@')[0];
        const user = await appStore.createUser({
          id: identity.id,
          name: displayName,
          email: normalizedEmail,
          password: generateOauthPlaceholderPassword(),
          role,
          bio: 'Signed up with OAuth.',
          avatar: identity.avatar,
          createdAt: new Date().toISOString(),
        });
        return res.json({
          user: sanitizeUser(user),
          token: issueToken(user.id, JWT_SECRET),
          message: `Welcome${user.name ? `, ${user.name}` : ''}!`,
        });
      }
      // Role selection is only for a new OAuth profile. Existing profiles must
      // keep their role; privilege changes belong to the admin workflow.
      if (existing.role !== role) {
        return res.status(409).json({ error: 'This account already has a role. Contact an administrator to change it.' });
      }
      res.json({
        user: sanitizeUser(existing),
        token: issueToken(existing.id, JWT_SECRET),
        message: `Welcome back, ${existing.name}!`,
      });
    } catch (error: any) {
      serverError(res, 'OAuth completion failed');
    }
  });

  // API Route: Get current user info
  app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res) => {
    try {
      res.json(sanitizeUser(req.user!));
    } catch (error: any) {
      serverError(res, 'Could not load profile');
    }
  });

  // API Route: Update user profile
  app.put('/api/auth/profile', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const { id, name, phone, bio, avatar } = parsed.data;

      // Users can only update their own profile
      if (req.user!.id !== id) {
        return res.status(403).json({ error: 'You can only update your own profile.' });
      }

      const updated = await appStore.updateUser(id, {
        ...(name && { name: name.trim() }),
        ...(phone !== undefined && { phone }),
        ...(bio !== undefined && { bio }),
        ...(avatar && { avatar })
      });

      res.json({
        user: sanitizeUser(updated),
        message: 'Profile updated successfully!'
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Profile update failed' });
    }
  });
}
