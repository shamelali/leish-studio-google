/**
 * Salon catalogue, service menu, user administration, and admin moderation
 * routes (extracted from server.ts).
 */
import type { Express } from 'express';
import type { Salon, Service, User } from '../../src/types.ts';
import {
  adminUserUpdateSchema,
  pageQuerySchema,
  salonCreateSchema,
  salonUpdateSchema,
  serviceCreateSchema,
  serviceUpdateSchema,
} from '../validation.ts';
import { DEFAULT_PAGE_LIMIT } from '../pagination.ts';
import { generateSalonId, generateServiceId } from '../ids.ts';
import { serverError } from '../http-utils.ts';
import { sanitizeUser } from './auth.ts';
import type { AuthenticatedRequest, RouteContext } from './context.ts';

const paginated = (query: unknown) => {
  const parsed = pageQuerySchema.safeParse(query);
  return parsed.success
    ? { ok: true as const, params: { page: parsed.data.page ?? 1, limit: parsed.data.limit ?? DEFAULT_PAGE_LIMIT } }
    : { ok: false as const, error: parsed.error.issues[0].message };
};

export function registerSalonRoutes(app: Express, ctx: RouteContext): void {
  const { store: appStore, authenticateToken, requireAdmin, requireSalonOwner } = ctx;

  // API Route: Create salon (admin-only; providers get listings linked by an administrator)
  app.post('/api/salons', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = salonCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const details = parsed.data;
      const salon: Salon = {
        id: generateSalonId(),
        name: details.name,
        category: details.category,
        location: details.location,
        address: details.address,
        tagline: details.tagline ?? '',
        description: details.description ?? '',
        rating: 0,
        reviewCount: 0,
        image: details.image ?? '',
        gallery: details.gallery ?? [],
        services: [],
        staff: [],
        featured: false,
        workingHours: details.workingHours ?? {},
        ...(details.type !== undefined ? { type: details.type } : {}),
        ...(details.artistTitle !== undefined ? { artistTitle: details.artistTitle } : {}),
        ...(details.yearsExperience !== undefined ? { yearsExperience: details.yearsExperience } : {}),
        ...(details.kitBrands !== undefined ? { kitBrands: details.kitBrands } : {}),
        ...(details.travelRadius !== undefined ? { travelRadius: details.travelRadius } : {}),
        ...(details.instagramHandle !== undefined ? { instagramHandle: details.instagramHandle } : {}),
        ...(details.startingPrice !== undefined ? { startingPrice: details.startingPrice } : {}),
      };
      const created = await appStore.createSalon(salon);
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.message === 'Salon already exists') {
        return res.status(409).json({ error: 'A listing with this id already exists.' });
      }
      serverError(res, 'Salon creation failed');
    }
  });

  // API Route: List all users (admin-only, passwords stripped, paginated)
  app.get('/api/users', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const pageParams = paginated(req.query);
      if (!pageParams.ok) {
        return res.status(400).json({ error: pageParams.error });
      }
      const page = await appStore.listUsers(pageParams.params);
      res.json({ data: page.data.map(sanitizeUser), pagination: page.pagination });
    } catch (error: any) {
      serverError(res, 'Could not load users');
    }
  });

  // API Route: Update user as admin (role changes, salon linkage, profile fields)
  app.patch('/api/users/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = adminUserUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      if (Object.keys(parsed.data).length === 0) {
        return res.status(400).json({ error: 'Provide at least one field to update.' });
      }
      // An administrator cannot remove their own administrator access:
      // with a single admin seed this would lock everyone out.
      if (req.params.id === req.user!.id && parsed.data.role !== undefined && parsed.data.role !== 'admin') {
        return res.status(403).json({ error: 'You cannot remove your own administrator access.' });
      }
      const patch: Partial<User> & { password?: string } = { ...parsed.data };
      if (patch.salonId !== undefined) {
        const linked = patch.salonId ? patch.salonId.trim() : '';
        if (!linked) {
          patch.salonId = undefined;
        } else {
          const salon = await appStore.getSalon(linked);
          if (!salon) {
            return res.status(404).json({ error: 'Salon not found' });
          }
          patch.salonId = linked;
        }
      }
      const updated = await appStore.updateUser(req.params.id, patch);
      res.json(sanitizeUser(updated));
    } catch (error: any) {
      if (error?.message === 'User not found') {
        return res.status(404).json({ error: 'User not found' });
      }
      if (error?.message === 'Email already registered') {
        return res.status(409).json({ error: 'Email already registered' });
      }
      serverError(res, 'User update failed');
    }
  });

  // API Route: Delete user as admin. Deliberately conservative: no
  // cascading deletes. Self-deletion, the last administrator, and accounts
  // with booking history are refused so no orphaned records or lockouts.
  app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      if (req.params.id === req.user!.id) {
        return res.status(403).json({ error: 'You cannot delete your own account. Ask another administrator.' });
      }
      const target = await appStore.getUserById(req.params.id);
      if (!target) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (target.role === 'admin') {
        const admins = (await appStore.getUsers()).filter(user => user.role === 'admin');
        if (admins.length <= 1) {
          return res.status(403).json({ error: 'Cannot delete the last administrator account.' });
        }
      }
      const email = target.email.trim().toLowerCase();
      const bookings = await appStore.getBookings();
      const hasHistory = bookings.some(
        booking => booking.clientId === target.id ||
          (booking.clientEmail && booking.clientEmail.trim().toLowerCase() === email),
      );
      if (hasHistory) {
        return res.status(409).json({ error: 'This account has booking history and cannot be deleted.' });
      }
      await appStore.deleteUser(req.params.id);
      res.json({ deleted: req.params.id });
    } catch (error: any) {
      if (error?.message === 'User not found') {
        return res.status(404).json({ error: 'User not found' });
      }
      serverError(res, 'User deletion failed');
    }
  });

  // API Route: Get all salons (paginated envelope)
  app.get('/api/salons', async (req, res) => {
    try {
      const pageParams = paginated(req.query);
      if (!pageParams.ok) {
        return res.status(400).json({ error: pageParams.error });
      }
      res.json(await appStore.listSalons(pageParams.params));
    } catch (error: any) {
      res.status(500).json({ error: 'Could not load salons' });
    }
  });

  // API Route: Get single salon
  app.get('/api/salons/:id', async (req, res) => {
    try {
      const salon = await appStore.getSalon(req.params.id);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }
      res.json(salon);
    } catch (error: any) {
      res.status(500).json({ error: 'Could not load salon' });
    }
  });

  // API Route: Update salon (owner-only, validated partial field allowlist)
  app.put('/api/salons/:id', authenticateToken, requireSalonOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = salonUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const updated = await appStore.updateSalon(req.params.id, parsed.data);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Salon update failed' });
    }
  });

  // API Route: Add service to salon (owner-only)
  app.post('/api/salons/:id/services', authenticateToken, requireSalonOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const salon = await appStore.getSalon(req.params.id);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }

      const parsed = serviceCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const newService: Service = {
        id: generateServiceId(req.params.id),
        name: parsed.data.name,
        price: parsed.data.price,
        duration: parsed.data.duration,
        description: parsed.data.description || '',
        category: parsed.data.category || salon.category
      };
      const updatedServices = [...salon.services, newService];
      const updated = await appStore.updateSalon(req.params.id, { services: updatedServices });
      res.status(201).json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Service update failed' });
    }
  });

  // API Route: Edit an existing service (owner-only). The route keeps the
  // path-selected service ID rather than accepting an ID from the request
  // body, so existing bookings continue to reference the same catalogue item.
  app.put('/api/salons/:id/services/:serviceId', authenticateToken, requireSalonOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const salon = await appStore.getSalon(req.params.id);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }
      const service = salon.services.find(candidate => candidate.id === req.params.serviceId);
      if (!service) {
        return res.status(404).json({ error: 'Service not found' });
      }

      // Strip 'id' from request body since it's determined by the URL path
      const { id: _ignoredId, ...bodyWithoutId } = req.body;
      const parsed = serviceUpdateSchema.safeParse(bodyWithoutId);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const updatedService: Service = {
        ...service,
        ...parsed.data,
        id: service.id,
      };
      const updatedServices = salon.services.map(candidate =>
        candidate.id === service.id ? updatedService : candidate,
      );
      const updated = await appStore.updateSalon(req.params.id, { services: updatedServices });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Service update failed' });
    }
  });

  // API Route: Delete service from salon (owner-only)
  app.delete('/api/salons/:id/services/:serviceId', authenticateToken, requireSalonOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const salon = await appStore.getSalon(req.params.id);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }
      if (!salon.services.some(s => s.id === req.params.serviceId)) {
        return res.status(404).json({ error: 'Service not found' });
      }
      const updatedServices = salon.services.filter(s => s.id !== req.params.serviceId);
      const updated = await appStore.updateSalon(req.params.id, { services: updatedServices });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Service update failed' });
    }
  });

  // ── Admin salon management ─────────────────────────────────────────────

  // API Route: Update any salon as admin (featured flag, details, etc.)
  app.put('/api/admin/salons/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = salonUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const salon = await appStore.getSalon(req.params.id);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }
      const updated = await appStore.updateSalon(req.params.id, parsed.data);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Salon update failed' });
    }
  });

  // API Route: Delete a salon as admin (cascades services; bookings remain
  // with a dangling salon reference — use with care).
  app.delete('/api/admin/salons/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const salon = await appStore.getSalon(req.params.id);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }
      await appStore.deleteSalon(req.params.id);
      res.json({ deleted: req.params.id });
    } catch (error: any) {
      if (error?.message === 'Salon not found') {
        return res.status(404).json({ error: 'Salon not found' });
      }
      res.status(500).json({ error: 'Salon deletion failed' });
    }
  });

  // ── Admin review moderation ────────────────────────────────────────────

  // API Route: List all reviews across all salons (admin-only, paginated)
  app.get('/api/admin/reviews', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const pageParams = paginated(req.query);
      if (!pageParams.ok) {
        return res.status(400).json({ error: pageParams.error });
      }
      const page = await appStore.listAllReviews(pageParams.params);
      res.json(page);
    } catch (error: any) {
      res.status(500).json({ error: 'Could not load reviews' });
    }
  });

  // API Route: Delete a review as admin
  app.delete('/api/admin/reviews/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      await appStore.deleteReview(req.params.id);
      res.json({ deleted: req.params.id });
    } catch (error: any) {
      if (error?.message === 'Review not found') {
        return res.status(404).json({ error: 'Review not found' });
      }
      res.status(500).json({ error: 'Review deletion failed' });
    }
  });

  // ── Admin booking management ───────────────────────────────────────────

  // API Route: Delete a booking as admin
  app.delete('/api/admin/bookings/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      await appStore.deleteBooking(req.params.id);
      res.json({ deleted: req.params.id });
    } catch (error: any) {
      if (error?.message === 'Booking not found') {
        return res.status(404).json({ error: 'Booking not found' });
      }
      res.status(500).json({ error: 'Booking deletion failed' });
    }
  });
}
