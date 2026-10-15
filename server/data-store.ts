import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import type { Salon, Booking, Review, Service, StaffMember, User } from '../src/types.ts';
import { FirestoreStore } from './firestore-store.ts';

export interface StoredUser extends User {
  password: string;
}

/**
 * Server-side persistence contract.
 *
 * Keeping the API independent from the JSON implementation means the route
 * layer can use the synchronous JSON backend or the asynchronous Firestore
 * backend without changing authorization or business logic.
 */
export interface DataStore {
  save(): void | Promise<void>;
  getSalons(): Salon[] | Promise<Salon[]>;
  getSalon(id: string): Salon | undefined | Promise<Salon | undefined>;
  updateSalon(id: string, updates: Partial<Salon>): Salon | Promise<Salon>;
  getBookings(): Booking[] | Promise<Booking[]>;
  getBooking(id: string): Booking | undefined | Promise<Booking | undefined>;
  createBooking(booking: Booking): Booking | Promise<Booking>;
  updateBookingStatus(id: string, status: Booking['status']): Booking | Promise<Booking>;
  getSalonReviews(salonId: string): Review[] | Promise<Review[]>;
  createReview(review: Review): Review | Promise<Review>;
  getUsers(): StoredUser[] | Promise<StoredUser[]>;
  getUserById(id: string): StoredUser | undefined | Promise<StoredUser | undefined>;
  getUserByEmail(email: string): StoredUser | undefined | Promise<StoredUser | undefined>;
  createUser(user: StoredUser): StoredUser | Promise<StoredUser>;
  updateUser(id: string, updates: Partial<StoredUser>): StoredUser | Promise<StoredUser>;
}

// On Vercel the root filesystem is read-only; /tmp is the only writable path.
// LEISH_DB_PATH lets tests point at an isolated store without touching real data.
const STORE_PATH = process.env.LEISH_DB_PATH
  ? path.resolve(process.env.LEISH_DB_PATH)
  : process.env.VERCEL
  ? path.join('/tmp', 'db_store.json')
  : path.join(process.cwd(), 'db_store.json');

/**
 * Resolve the persistence backend before constructing any store. JSON is a
 * useful local/test fallback, but it cannot provide production durability.
 * Refusing to boot is safer than serving an empty catalog or writing to an
 * ephemeral deployment filesystem.
 */
export function getStoreBackend(
  environment = process.env.NODE_ENV,
  configuredBackend = process.env.STORE_BACKEND,
): 'json' | 'firestore' {
  const backend = configuredBackend?.trim();
  const isProduction = environment === 'production' || process.env.VERCEL === '1';

  if (isProduction && backend !== 'firestore') {
    // Explicit staging/demo escape hatch: serve the seeded JSON catalog
    // ephemerally instead of refusing to boot. Writes evaporate with the
    // serverless container, so this must never back real user data — it
    // exists so staging can be browsed before Firestore credentials land.
    if (process.env.LEISH_ALLOW_EPHEMERAL_DEMO === '1') {
      console.warn(
        '[leish] WARNING: serving the EPHEMERAL seed catalog ' +
          '(LEISH_ALLOW_EPHEMERAL_DEMO=1). Bookings and edits will evaporate. ' +
          'Configure STORE_BACKEND=firestore with credentials for real data.',
      );
      return 'json';
    }
    throw new Error(
      '[leish] Production requires STORE_BACKEND=firestore. The JSON backend is supported only for local development and tests. ' +
        'Set LEISH_ALLOW_EPHEMERAL_DEMO=1 to serve seed demo data instead (staging only, writes evaporate).',
    );
  }

  const selected = backend || 'json';
  if (selected !== 'json' && selected !== 'firestore') {
    throw new Error(`Unknown STORE_BACKEND: ${selected}`);
  }
  return selected;
}

const hashPassword = (password: string): string => bcrypt.hashSync(password, 10);

const INITIAL_USERS: StoredUser[] = [
  {
    id: 'user-client-1',
    name: 'Shamel Ali',
    email: 'shamelali@gmail.com',
    password: hashPassword('password123'),
    role: 'client',
    phone: '+1 (555) 234-5678',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
    bio: 'Beauty enthusiast booking bridal glam, red carpet artistry, and makeup masterclasses.',
    createdAt: '2026-01-15T08:00:00.000Z'
  },
  {
    id: 'user-provider-1',
    name: 'Jean-Marc Laurent',
    email: 'director@atelierleish.com',
    password: hashPassword('password123'),
    role: 'provider',
    salonId: 'salon-1',
    phone: '+1 (555) 890-1234',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
    bio: 'Celebrity Makeup Artist & Creative Director at Maison Leish Haute Makeup Atelier.',
    createdAt: '2026-01-10T10:00:00.000Z'
  },
  {
    id: 'user-provider-2',
    name: 'Elena Rose',
    email: 'rosewood@beauty.com',
    password: hashPassword('password123'),
    role: 'provider',
    salonId: 'salon-2',
    phone: '+1 (555) 456-7890',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200',
    bio: 'Principal Runway MUA & Airbrush Specialist at L’Éclat Makeup Lab.',
    createdAt: '2026-01-12T12:00:00.000Z'
  },
  // One-click demo accounts used by the auth modal's Instant Demo Access.
  // These intentionally use short usernames instead of email addresses so
  // visitors can sign in without typing; login and booking contact fields
  // accept any non-empty identifier for the same reason.
  {
    id: 'user-client-demo',
    name: 'Demo Client',
    email: 'client',
    password: hashPassword('password123'),
    role: 'client',
    phone: '+60 12-000 0000',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200',
    bio: 'Demo makeup client account for trying bookings end to end.',
    createdAt: '2026-10-16T00:00:00.000Z'
  },
  {
    id: 'user-studio-demo',
    name: 'Demo Studio',
    email: 'studio',
    password: hashPassword('password123'),
    role: 'provider',
    phone: '+60 12-000 0001',
    avatar: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=200',
    bio: 'Demo studio/MUA account for exploring the provider portal.',
    createdAt: '2026-10-16T00:00:00.000Z'
  }
];

// Curated Seed Data Exclusively for MVP Makeup Studios
const INITIAL_SALONS: Salon[] = [
  {
    id: 'salon-1',
    name: 'Maison Leish Haute Makeup Atelier',
    tagline: 'Haute couture bridal, red carpet & VIP gala makeup artistry',
    description: 'Maison Leish is our flagship luxury makeup studio, renowned for bespoke bridal looks, red-carpet complexion sculpting, and camera-ready luxury artistry. Founded on Parisian couture aesthetics, our master MUAs tailor every stroke, contour, and highlight to your unique bone structure and skin undertone.',
    rating: 4.95,
    reviewCount: 148,
    location: 'Bukit Bintang, Kuala Lumpur',
    address: '404 Jalan Bukit Bintang, Kuala Lumpur',
    image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&q=80&w=1200',
    gallery: [
      'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=600'
    ],
    category: 'bridal',
    featured: true,
    type: 'studio',
    workingHours: {
      Monday: '09:00 AM - 07:00 PM',
      Tuesday: '09:00 AM - 08:00 PM',
      Wednesday: '09:00 AM - 08:00 PM',
      Thursday: '09:00 AM - 09:00 PM',
      Friday: '09:00 AM - 09:00 PM',
      Saturday: '08:30 AM - 07:00 PM',
      Sunday: '10:00 AM - 04:00 PM'
    },
    services: [
      {
        id: 'serv-1-1',
        name: 'Royal Bridal Glam & Touch-Up Kit',
        price: 320,
        duration: 120,
        description: 'Includes luxury skincare prep, custom waterproof airbrush base, 3D mink/silk lashes, lip sculpting, and a custom VIP bridal touch-up kit.',
        category: 'bridal'
      },
      {
        id: 'serv-1-2',
        name: 'Red Carpet Gala Contour & Radiance',
        price: 195,
        duration: 75,
        description: 'High-definition sculpting, luminous glass skin finish, bespoke eye design, and 18-hour transfer-resistant setting.',
        category: 'editorial'
      },
      {
        id: 'serv-1-3',
        name: 'Bridal Glam Trial & Artistry Consultation',
        price: 160,
        duration: 90,
        description: 'Comprehensive bridal trial testing lighting variations, skin compatibility, and veil/jewelry color harmony.',
        category: 'bridal'
      }
    ],
    staff: [
      {
        id: 'staff-1-1',
        name: 'Jean-Marc Laurent',
        role: 'Master Celebrity Makeup Artist',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150',
        rating: 4.95
      },
      {
        id: 'staff-1-2',
        name: 'Camille Dubois',
        role: 'Senior Bridal Artistry Director',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150',
        rating: 4.92
      }
    ]
  },
  {
    id: 'salon-2',
    name: 'L’Éclat Makeup & Airbrush Lab',
    tagline: 'High-definition 4K airbrushing, editorial & runway perfection',
    description: 'L’Éclat is an avant-garde makeup atelier specializing in precision airbrush technology and high-fashion editorial styling. We create seamless, poreless skin finishes that look effortless in daylight and flawless under high-intensity 4K cameras.',
    rating: 4.88,
    reviewCount: 112,
    location: 'Bangsar, Kuala Lumpur',
    address: '88 Jalan Bangsar, Kuala Lumpur',
    image: 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&q=80&w=1200',
    gallery: [
      'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1503236823255-94609f598e71?auto=format&fit=crop&q=80&w=600'
    ],
    category: 'editorial',
    featured: true,
    type: 'studio',
    workingHours: {
      Monday: '10:00 AM - 07:00 PM',
      Tuesday: '10:00 AM - 07:00 PM',
      Wednesday: '10:00 AM - 08:00 PM',
      Thursday: '10:00 AM - 08:00 PM',
      Friday: '09:00 AM - 08:00 PM',
      Saturday: '09:00 AM - 07:00 PM',
      Sunday: '11:00 AM - 05:00 PM'
    },
    services: [
      {
        id: 'serv-2-1',
        name: '4K Ultra-HD Airbrush Artistry',
        price: 210,
        duration: 75,
        description: 'Micro-fine airbrushed foundation with custom pigment matching, sweat-resistant silicone veil, and sculpted cheekbones.',
        category: 'airbrush'
      },
      {
        id: 'serv-2-2',
        name: 'High-Fashion Editorial & Graphic Wing',
        price: 180,
        duration: 70,
        description: 'Bold runway color gradients, chromatic pigments, precision winged liner, and sculpted brows.',
        category: 'editorial'
      },
      {
        id: 'serv-2-3',
        name: 'Editorial Photoshoot Day-Rate Package',
        price: 450,
        duration: 240,
        description: 'On-set makeup artistry with 3 full look changes and continuous camera touch-ups for studio photography.',
        category: 'editorial'
      }
    ],
    staff: [
      {
        id: 'staff-2-1',
        name: 'Elena Rose',
        role: 'Principal Runway & Editorial MUA',
        avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150',
        rating: 4.9
      },
      {
        id: 'staff-2-2',
        name: 'Mayumi Lin',
        role: 'Creative Color & FX Specialist',
        avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=150',
        rating: 4.85
      }
    ]
  },
  {
    id: 'salon-3',
    name: 'Velvet Glow Makeup Studio',
    tagline: 'Bespoke soft glam, dewy clean luxury & sculpted skin',
    description: 'Velvet Glow is the premier destination for refined Soft Glam and radiant, luminous makeup. We believe in elevating your natural allure through lymphatic skin prep, hydrating serum-infused bases, and velvety neutral accents that never feel heavy.',
    rating: 4.92,
    reviewCount: 134,
    location: 'Petaling Jaya, Selangor',
    address: '505 Jalan SS2/61, Petaling Jaya',
    image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=1200',
    gallery: [
      'https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1596704017254-9b121068fb31?auto=format&fit=crop&q=80&w=600'
    ],
    category: 'soft-glam',
    featured: true,
    type: 'studio',
    workingHours: {
      Monday: '09:30 AM - 06:30 PM',
      Tuesday: '09:30 AM - 06:30 PM',
      Wednesday: '09:30 AM - 08:00 PM',
      Thursday: '09:30 AM - 08:00 PM',
      Friday: '09:00 AM - 08:00 PM',
      Saturday: '09:00 AM - 07:00 PM',
      Sunday: 'Closed'
    },
    services: [
      {
        id: 'serv-3-1',
        name: 'Signature Velvet Soft Glam',
        price: 150,
        duration: 60,
        description: 'Seamless skin-like foundation, soft taupe crease sculpting, fluffy individual lash clusters, and ombre nude lip.',
        category: 'soft-glam'
      },
      {
        id: 'serv-3-2',
        name: 'Clean Girl Glass Skin & Brow Architecture',
        price: 130,
        duration: 50,
        description: 'Dewy botanical prep, minimal spot-conceal, soap-brow lamination effect, and hydrated glass-sheen tint.',
        category: 'soft-glam'
      },
      {
        id: 'serv-3-3',
        name: 'Golden Hour Bronze & Lip Plump Ritual',
        price: 165,
        duration: 65,
        description: 'Sun-kissed warm bronzing, champagne high points, soft terracotta eye wash, and peptidic lip glaze.',
        category: 'soft-glam'
      }
    ],
    staff: [
      {
        id: 'staff-3-1',
        name: 'Sasha Morello',
        role: 'Lead Soft Glam Specialist',
        avatar: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=150',
        rating: 4.92
      },
      {
        id: 'staff-3-2',
        name: 'Chloe Bennett',
        role: 'Glow Complexion Artist',
        avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150',
        rating: 4.88
      }
    ]
  },
  {
    id: 'salon-4',
    name: 'Noor Ceremonial Bridal Studio',
    tagline: 'Traditional, Middle Eastern & South Asian grand bridal makeup',
    description: 'Noor Bridal Studio celebrates the grandeur of cultural and destination weddings. Specializing in dramatic smokey cut-creases, waterproof 24-hour setting for tearful ceremonies, and heavy dupatta/jewelry setting alongside flawless makeup artistry.',
    rating: 4.96,
    reviewCount: 162,
    location: 'Ampang, Kuala Lumpur',
    address: '712 Jalan Ampang, Kuala Lumpur',
    image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=1200',
    gallery: [
      'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&q=80&w=600'
    ],
    category: 'bridal',
    featured: false,
    type: 'studio',
    workingHours: {
      Monday: '10:00 AM - 07:00 PM',
      Tuesday: '10:00 AM - 07:00 PM',
      Wednesday: '10:00 AM - 08:00 PM',
      Thursday: '10:00 AM - 08:00 PM',
      Friday: '09:00 AM - 08:00 PM',
      Saturday: '08:00 AM - 08:00 PM',
      Sunday: '09:00 AM - 05:00 PM'
    },
    services: [
      {
        id: 'serv-4-1',
        name: 'Grand Royal Bridal Makeup & Dupatta Draping',
        price: 380,
        duration: 150,
        description: 'Full jewel-toned cut crease, luxury 3D lashes, waterproof baking, matte velvet finish, and bridal jewelry setting.',
        category: 'bridal'
      },
      {
        id: 'serv-4-2',
        name: 'Reception & Sangeet Evening Glam',
        price: 220,
        duration: 90,
        description: 'Shimmer pigments, bold winged eye, long-wear matte pout, and high-impact strobing for evening spotlights.',
        category: 'bridal'
      }
    ],
    staff: [
      {
        id: 'staff-4-1',
        name: 'Amira Zahra',
        role: 'Master Cultural Bridal Artist',
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150',
        rating: 5.0
      },
      {
        id: 'staff-4-2',
        name: 'Kavi Chandra',
        role: 'Precision Symmetry & Lash Artisan',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150',
        rating: 4.9
      }
    ]
  },
  {
    id: 'salon-5',
    name: 'Aura Airbrush Makeup Studio',
    tagline: 'Sweat-proof, humidity-resistant 24hr HD airbrush makeup',
    description: 'Aura Airbrush transforms event beauty with next-generation atomized micro-pigments. Our formulations resist sweat, humidity, and heat while maintaining a feather-light breathable veil. Ideal for summer galas, outdoor weddings, and studio video shoots.',
    rating: 4.85,
    reviewCount: 89,
    location: 'Cheras, Kuala Lumpur',
    address: '15 Jalan Cheras, Kuala Lumpur',
    image: 'https://images.unsplash.com/photo-1596704017254-9b121068fb31?auto=format&fit=crop&q=80&w=1200',
    gallery: [
      'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=600'
    ],
    category: 'airbrush',
    featured: false,
    workingHours: {
      Monday: '10:00 AM - 06:00 PM',
      Tuesday: '10:00 AM - 06:00 PM',
      Wednesday: '10:00 AM - 08:00 PM',
      Thursday: '10:00 AM - 08:00 PM',
      Friday: '09:00 AM - 08:00 PM',
      Saturday: '09:00 AM - 07:00 PM',
      Sunday: 'Closed'
    },
    services: [
      {
        id: 'serv-5-1',
        name: 'Humidity-Proof Airbrush Event Glam',
        price: 190,
        duration: 70,
        description: 'Atomized primer, high-coverage lightweight airbrush veil, targeted powder baking, and setting seal.',
        category: 'airbrush'
      },
      {
        id: 'serv-5-2',
        name: 'Red Carpet Airbrush Body & Décolleté Glow',
        price: 120,
        duration: 45,
        description: 'Airbrushed collarbone sculpting, shoulder bronzing, and shimmering body glow for open-back evening gowns.',
        category: 'airbrush'
      }
    ],
    staff: [
      {
        id: 'staff-5-1',
        name: 'Marcus Thorne',
        role: 'Airbrush Technique Pioneer',
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150',
        rating: 4.85
      }
    ]
  },
  {
    id: 'salon-6',
    name: 'The MUA Masterclass Academy & Studio',
    tagline: 'Private 1-on-1 makeup lessons & professional artistry masterclasses',
    description: 'Learn the secret techniques of celebrity makeup artists in our dedicated studio workshop. Whether you want to master your own everyday 10-minute glam or elevate your professional MUA portfolio, our certified educators provide hands-on coaching with top luxury cosmetics.',
    rating: 4.97,
    reviewCount: 105,
    location: 'Mont Kiara, Kuala Lumpur',
    address: '310 Jalan Kiara 3, Mont Kiara, Kuala Lumpur',
    image: 'https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&q=80&w=1200',
    gallery: [
      'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&q=80&w=600'
    ],
    category: 'masterclass',
    featured: true,
    type: 'studio',
    workingHours: {
      Monday: '10:00 AM - 06:00 PM',
      Tuesday: '10:00 AM - 06:00 PM',
      Wednesday: '10:00 AM - 07:00 PM',
      Thursday: '10:00 AM - 07:00 PM',
      Friday: '10:00 AM - 07:00 PM',
      Saturday: '10:00 AM - 05:00 PM',
      Sunday: 'Closed'
    },
    services: [
      {
        id: 'serv-6-1',
        name: 'Personal Makeup Bag Audit & 1-on-1 Glam Lesson',
        price: 250,
        duration: 120,
        description: 'Bring your personal makeup kit. We declutter, color-match, teach you contouring for your face shape, and build your custom signature routine.',
        category: 'masterclass'
      },
      {
        id: 'serv-6-2',
        name: 'Advanced Smokey Eye & Cut-Crease Intensive',
        price: 290,
        duration: 150,
        description: 'Hands-on masterclass focusing on color theory, seamless eye blending, cut-crease cutouts, and false lash application.',
        category: 'masterclass'
      }
    ],
    staff: [
      {
        id: 'staff-6-1',
        name: 'Victoria Hastings',
        role: 'Master Makeup Educator & Author',
        avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150',
        rating: 4.98
      }
    ]
  },
  {
    id: 'mua-1',
    name: 'Jean-Marc Laurent',
    artistTitle: 'Celebrity Red Carpet MUA & Haute Bridal Master',
    tagline: 'Vogue & Cannes red-carpet makeup artist with signature Parisian undertone contour',
    description: 'Over 14 years creating red-carpet looks for Cannes, Met Gala, and high-society European destination weddings. Renowned for waterproof underpainting and sculpted bone symmetry.',
    rating: 4.98,
    reviewCount: 124,
    location: 'Kuala Lumpur City Centre (Mobile Dispatch)',
    address: 'Private Studio Loft, Bukit Bintang, Kuala Lumpur',
    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=800',
    gallery: [
      'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=600'
    ],
    category: 'editorial',
    featured: true,
    type: 'mua',
    yearsExperience: 14,
    kitBrands: ['Pat McGrath Labs', 'Dior Backstage', 'Charlotte Tilbury Pro', 'Temptu 4K'],
    travelRadius: 'Mobile dispatch up to 50 km',
    instagramHandle: '@jeanmarc.artistry',
    startingPrice: 195,
    workingHours: {
      Monday: '08:00 AM - 08:00 PM',
      Tuesday: '08:00 AM - 08:00 PM',
      Wednesday: '08:00 AM - 08:00 PM',
      Thursday: '08:00 AM - 09:00 PM',
      Friday: '07:00 AM - 10:00 PM',
      Saturday: '06:00 AM - 10:00 PM',
      Sunday: '08:00 AM - 06:00 PM'
    },
    services: [
      {
        id: 'serv-mua1-1',
        name: 'Signature Red Carpet Gala Face & Complexion Sculpt',
        price: 195,
        duration: 75,
        description: 'Vogue-grade underpainting, camera-flash silica setting, bespoke smoked almond eye, and 18-hour waterproof hold.',
        category: 'editorial'
      },
      {
        id: 'serv-mua1-2',
        name: 'Haute Couture Bridal Artistry (On-Location)',
        price: 340,
        duration: 120,
        description: 'Bespoke bridal morning glamour, luxury skin prep ritual, custom blended lip tint, and emergency bridal touch-up kit.',
        category: 'bridal'
      }
    ],
    staff: [
      {
        id: 'staff-mua1-1',
        name: 'Jean-Marc Laurent',
        role: 'Master Celebrity Makeup Artist',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150',
        rating: 4.98
      }
    ]
  },
  {
    id: 'mua-2',
    name: 'Amira Zahra',
    artistTitle: 'Grand Cultural & South Asian Bridal Specialist',
    tagline: '24-Hour cry-proof ceremonial bridal glam, cut creases & dupatta setting',
    description: 'Amira specializes in traditional and destination South Asian, Middle Eastern, and multi-day ceremonial weddings. Flawless jewel-toned blending that looks regal in natural light and spotlight photography.',
    rating: 4.96,
    reviewCount: 142,
    location: 'Ampang & Destination (Mobile Dispatch)',
    address: 'Atelier Suite, Ampang, Kuala Lumpur',
    image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=800',
    gallery: [
      'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=600'
    ],
    category: 'bridal',
    featured: true,
    type: 'mua',
    yearsExperience: 11,
    kitBrands: ['Huda Beauty Pro', 'Natasha Denona', 'Anastasia Pro', 'NARS Complexion'],
    travelRadius: 'Mobile dispatch up to 60 km (Worldwide Travel Available)',
    instagramHandle: '@amira.bridalglam',
    startingPrice: 220,
    workingHours: {
      Monday: '09:00 AM - 07:00 PM',
      Tuesday: '09:00 AM - 07:00 PM',
      Wednesday: '09:00 AM - 08:00 PM',
      Thursday: '09:00 AM - 08:00 PM',
      Friday: '07:00 AM - 09:00 PM',
      Saturday: '06:00 AM - 09:00 PM',
      Sunday: '08:00 AM - 06:00 PM'
    },
    services: [
      {
        id: 'serv-mua2-1',
        name: 'Grand Royal Bridal Glam & Dupatta Setting',
        price: 360,
        duration: 150,
        description: '24-Hour sweat and tear proof baking, dramatic jewel cut-crease, mink lashes, and heavy dupatta/tikka setting.',
        category: 'bridal'
      },
      {
        id: 'serv-mua2-2',
        name: 'Sangeet & Reception Evening Spotlight Glam',
        price: 220,
        duration: 90,
        description: 'Luminous strobing, vibrant chromatic eyeshadow, and long-wear transfer-resistant matte pout.',
        category: 'bridal'
      }
    ],
    staff: [
      {
        id: 'staff-mua2-1',
        name: 'Amira Zahra',
        role: 'Master Cultural Bridal Artist',
        avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150',
        rating: 4.96
      }
    ]
  },
  {
    id: 'mua-3',
    name: 'Sasha Morello',
    artistTitle: 'Lead Soft Glam & Glass Skin Specialist',
    tagline: 'Pioneer of the Cashmere Cloud and feather-light camera-ready skin finishes',
    description: 'Sasha delivers the internet’s most coveted soft glam aesthetic: blurred poreless skin with a luminous glass high-point, brushed soap brows, and custom ombre nude lips.',
    rating: 4.94,
    reviewCount: 98,
    location: 'Petaling Jaya & Klang Valley (Mobile Dispatch)',
    address: 'The Velvet Lounge, Suite 4, Subang Jaya',
    image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=800',
    gallery: [
      'https://images.unsplash.com/photo-1503236823255-94609f598e71?auto=format&fit=crop&q=80&w=600'
    ],
    category: 'soft-glam',
    featured: true,
    type: 'mua',
    yearsExperience: 8,
    kitBrands: ['Hourglass Ambient', 'Patrick Ta Beauty', 'Westman Atelier', 'Rhode Skin'],
    travelRadius: 'Mobile dispatch up to 35 km',
    instagramHandle: '@sashamorello.artistry',
    startingPrice: 150,
    workingHours: {
      Monday: '10:00 AM - 06:00 PM',
      Tuesday: '10:00 AM - 06:00 PM',
      Wednesday: '10:00 AM - 07:00 PM',
      Thursday: '10:00 AM - 07:00 PM',
      Friday: '09:00 AM - 08:00 PM',
      Saturday: '08:00 AM - 07:00 PM',
      Sunday: '10:00 AM - 04:00 PM'
    },
    services: [
      {
        id: 'serv-mua3-1',
        name: 'Signature Cashmere Velvet Soft Glam',
        price: 150,
        duration: 65,
        description: 'Skin-like breathable foundation, taupe eye sculpt, silk individual lash flares, and hydrated nude ombre lips.',
        category: 'soft-glam'
      },
      {
        id: 'serv-mua3-2',
        name: 'Clean Girl Glass Radiance & Laminated Brow',
        price: 135,
        duration: 50,
        description: 'High-slip botanical hydration, pinpoint micro-concealing, soap brow architecture, and juicy glazed lips.',
        category: 'soft-glam'
      }
    ],
    staff: [
      {
        id: 'staff-mua3-1',
        name: 'Sasha Morello',
        role: 'Lead Soft Glam Specialist',
        avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=150',
        rating: 4.94
      }
    ]
  },
  {
    id: 'mua-4',
    name: 'Elena Rose',
    artistTitle: 'NYFW Lead Artist & 4K Airbrush Pioneer',
    tagline: 'Zero-flashback atomized micro-airbrushing for 4K video, galas, and photography',
    description: 'With 12 years leading beauty teams at New York and Paris fashion weeks, Elena utilizes medical-grade atomizers and micro-fine silicone emulsions for 18-hour waterproof camera perfection.',
    rating: 4.92,
    reviewCount: 115,
    location: 'Bangsar South (Mobile Dispatch)',
    address: 'Studio Air, Bangsar South, Kuala Lumpur',
    image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=800',
    gallery: [
      'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&q=80&w=600'
    ],
    category: 'airbrush',
    featured: true,
    type: 'mua',
    yearsExperience: 12,
    kitBrands: ['Temptu Pro Airbrush', 'MAC Cosmetics Pro', 'Danessa Myricks', 'Kett Cosmetics'],
    travelRadius: 'Mobile dispatch up to 45 km',
    instagramHandle: '@elenarose.airbrush',
    startingPrice: 180,
    workingHours: {
      Monday: '09:00 AM - 07:00 PM',
      Tuesday: '09:00 AM - 07:00 PM',
      Wednesday: '09:00 AM - 08:00 PM',
      Thursday: '09:00 AM - 08:00 PM',
      Friday: '08:00 AM - 09:00 PM',
      Saturday: '07:00 AM - 08:00 PM',
      Sunday: '09:00 AM - 05:00 PM'
    },
    services: [
      {
        id: 'serv-mua4-1',
        name: '4K Micro-Mist Ceramic Airbrush Glam',
        price: 210,
        duration: 75,
        description: 'Atomized foundation micro-particles that merge seamlessly with skin. Zero texture, completely flashback-free.',
        category: 'airbrush'
      },
      {
        id: 'serv-mua4-2',
        name: 'High-Fashion Camera Wing & Graphic Eye',
        price: 180,
        duration: 70,
        description: 'Runway-level eye geometry, chromatic duochrome reflects, and transfer-proof waterline setting.',
        category: 'editorial'
      }
    ],
    staff: [
      {
        id: 'staff-mua4-1',
        name: 'Elena Rose',
        role: 'Runway MUA & Airbrush Specialist',
        avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=150',
        rating: 4.92
      }
    ]
  }
];

const INITIAL_REVIEWS: Review[] = [
  {
    id: 'rev-1',
    salonId: 'salon-1',
    clientName: 'Amelie Laurent',
    rating: 5,
    text: 'Jean-Marc made me feel like royalty on my wedding day! My bridal makeup stayed totally pristine through 14 hours of happy tears and dancing. The custom lip color and lash cluster placement were absolute perfection.',
    date: '2026-06-20'
  },
  {
    id: 'rev-2',
    salonId: 'salon-1',
    clientName: 'Victoria Hastings',
    rating: 5,
    text: 'The red carpet contour and radiance service gave me the most sculpted cheekbones without ever looking cakey under camera flash. True haute couture artistry!',
    date: '2026-06-15'
  },
  {
    id: 'rev-3',
    salonId: 'salon-2',
    clientName: 'Keiko Tanaka',
    rating: 5,
    text: 'Elena’s 4K airbrush makeup is incredible. My pores were completely erased, and the makeup felt as lightweight as a serum. Perfect for our editorial photoshoot.',
    date: '2026-06-25'
  },
  {
    id: 'rev-4',
    salonId: 'salon-3',
    clientName: 'Chloe Bennett',
    rating: 5,
    text: 'Velvet Glow has completely redefined Soft Glam for me! Sasha prepped my skin so beautifully with facial massage, and the golden hour bronze looked so effortless.',
    date: '2026-06-22'
  },
  {
    id: 'rev-5',
    salonId: 'salon-4',
    clientName: 'Fatima Al-Mansoor',
    rating: 5,
    text: 'Amira is the undisputed queen of ceremonial bridal makeup. The jewel tones in my smokey eye matched my lehenga to perfection, and the dupatta setting was rock solid.',
    date: '2026-06-24'
  },
  {
    id: 'rev-6',
    salonId: 'salon-6',
    clientName: 'Rachel Green',
    rating: 5,
    text: 'The 1-on-1 makeup bag audit and lesson was worth every dollar. Victoria showed me why my concealer was creasing and taught me how to do a 10-minute glam that actually suits my hooded eyes.',
    date: '2026-06-26'
  }
];

const INITIAL_BOOKINGS: Booking[] = [
  {
    id: 'book-1',
    salonId: 'salon-1',
    salonName: 'Maison Leish Haute Makeup Atelier',
    salonAddress: '404 Jalan Bukit Bintang, Kuala Lumpur',
    serviceId: 'serv-1-1',
    serviceName: 'Royal Bridal Glam & Touch-Up Kit',
    servicePrice: 320,
    serviceDuration: 120,
    staffId: 'staff-1-1',
    staffName: 'Jean-Marc Laurent',
    date: '2026-07-02',
    time: '10:00 AM',
    clientName: 'Shamel Ali',
    clientEmail: 'shamelali@gmail.com',
    clientPhone: '555-0199',
    notes: 'Excited for signature bridal glam with warm neutral tones!',
    status: 'confirmed',
    createdAt: '2026-06-28T10:00:00-07:00'
  }
];

export class JsonDataStore implements DataStore {
  private salons: Salon[] = [];
  private bookings: Booking[] = [];
  private reviews: Review[] = [];
  private users: StoredUser[] = [];

  constructor() {
    this.load();
    this.normalizePasswords();
  }

  /**
   * Stores persisted before bcrypt was introduced hold PLAINTEXT passwords.
   * bcrypt.compareSync() always rejects those, so every login 401s and the
   * data file silently stays broken. Re-hash legacy values once on load.
   */
  private normalizePasswords(): void {
    const looksHashed = (p: string) => /^\$2[aby]\$\d{2}\$/.test(p || '');
    const legacy = this.users.filter(u => !looksHashed(u.password));
    if (legacy.length === 0) return;

    for (const user of legacy) {
      user.password = hashPassword(user.password);
    }
    this.save();
    console.log(`[DataStore] Re-hashed ${legacy.length} legacy plaintext password(s).`);
  }

  private load() {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf-8');
        const data = JSON.parse(raw);
        
        // Ensure MVP only contains makeup studios. If old data contains hair/nails, re-seed to makeup studios.
        const hasLegacyCategories = data.salons && data.salons.some((s: Salon) => s.category === 'hair' || s.category === 'nails' || s.category === 'massage');
        if (hasLegacyCategories || !data.salons || data.salons.length === 0) {
          console.log('[DataStore] Migrating data store to MVP Makeup Studios...');
          this.salons = INITIAL_SALONS;
          this.reviews = INITIAL_REVIEWS;
          this.bookings = INITIAL_BOOKINGS;
          this.users = INITIAL_USERS;
          this.save();
        } else {
          this.salons = data.salons;
          this.bookings = data.bookings || [];
          this.reviews = data.reviews || [];
          this.users = (data.users && data.users.length > 0) ? data.users : INITIAL_USERS;
        }
        console.log(`[DataStore] Loaded ${this.salons.length} makeup studios, ${this.bookings.length} bookings, ${this.reviews.length} reviews, ${this.users.length} users.`);
      } else {
        this.salons = INITIAL_SALONS;
        this.reviews = INITIAL_REVIEWS;
        this.bookings = INITIAL_BOOKINGS;
        this.users = INITIAL_USERS;
        this.save();
        console.log('[DataStore] Initialized with makeup studio seed data and written to file.');
      }
    } catch (e) {
      console.error('[DataStore] Error loading database store, falling back to in-memory seed.', e);
      this.salons = INITIAL_SALONS;
      this.reviews = INITIAL_REVIEWS;
      this.bookings = INITIAL_BOOKINGS;
      this.users = INITIAL_USERS;
    }
  }

  public save(): void {
    // Simple file lock to prevent concurrent writes from corrupting the store
    const lockPath = `${STORE_PATH}.lock`;
    const maxRetries = 50;
    const retryDelayMs = 20;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Try to create lock file exclusively (fails if exists)
        fs.openSync(lockPath, 'wx');
        break; // Lock acquired
      } catch (e: any) {
        if (e.code !== 'EEXIST') throw e;
        if (attempt === maxRetries - 1) throw new Error('Could not acquire store lock');
        // Wait and retry
        const start = Date.now();
        while (Date.now() - start < retryDelayMs) { /* busy wait for short delay */ }
      }
    }
    
    try {
      const data = {
        salons: this.salons,
        bookings: this.bookings,
        reviews: this.reviews,
        users: this.users
      };
      // Replace the file atomically so a process or filesystem interruption
      // cannot leave a truncated JSON store that loses the whole catalog.
      fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
      const tempPath = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
      fs.renameSync(tempPath, STORE_PATH);
      // Existing stores may have been created with broader permissions.
      // Password hashes are still sensitive, so tighten them on every save.
      fs.chmodSync(STORE_PATH, 0o600);
    } finally {
      // Release lock
      try { fs.unlinkSync(lockPath); } catch {}
    }
  }

  // --- Salons ---
  public getSalons(): Salon[] {
    return this.salons;
  }

  public getSalon(id: string): Salon | undefined {
    return this.salons.find(s => s.id === id);
  }

  public updateSalon(id: string, updates: Partial<Salon>): Salon {
    const idx = this.salons.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Makeup Studio not found');
    this.salons[idx] = { ...this.salons[idx], ...updates };
    this.save();
    return this.salons[idx];
  }

  // --- Bookings ---
  public getBookings(): Booking[] {
    return this.bookings;
  }

  public getBooking(id: string): Booking | undefined {
    return this.bookings.find(b => b.id === id);
  }

  public createBooking(booking: Booking): Booking {
    this.bookings.unshift(booking);
    this.save();
    return booking;
  }

  public updateBookingStatus(id: string, status: Booking['status']): Booking {
    const idx = this.bookings.findIndex(b => b.id === id);
    if (idx === -1) throw new Error('Booking not found');
    this.bookings[idx].status = status;
    this.save();
    return this.bookings[idx];
  }

  // --- Reviews ---
  public getSalonReviews(salonId: string): Review[] {
    return this.reviews.filter(r => r.salonId === salonId);
  }

  public createReview(review: Review): Review {
    if (review.reviewerId && review.bookingId && this.reviews.some(existing =>
      existing.reviewerId === review.reviewerId && existing.bookingId === review.bookingId
    )) {
      throw new Error('Review already exists for this booking and reviewer');
    }
    this.reviews.unshift(review);
    // Recalculate average studio rating
    const studioReviews = this.getSalonReviews(review.salonId);
    const avg = studioReviews.reduce((sum, r) => sum + r.rating, 0) / studioReviews.length;
    const studio = this.getSalon(review.salonId);
    if (studio) {
      studio.rating = Number(avg.toFixed(1));
      studio.reviewCount = studioReviews.length;
    }
    this.save();
    return review;
  }

  // --- Users & Authentication ---
  public getUsers(): StoredUser[] {
    return this.users;
  }

  public getUserById(id: string): StoredUser | undefined {
    return this.users.find(u => u.id === id);
  }

  public getUserByEmail(email: string): StoredUser | undefined {
    const normalized = email.trim().toLowerCase();
    return this.users.find(u => u.email.toLowerCase() === normalized);
  }

  public createUser(user: StoredUser): StoredUser {
    user.password = bcrypt.hashSync(user.password, 10);
    this.users.unshift(user);
    this.save();
    return user;
  }

  public updateUser(id: string, updates: Partial<StoredUser>): StoredUser {
    const idx = this.users.findIndex(u => u.id === id);
    if (idx === -1) throw new Error('User not found');
    if (updates.password) {
      updates.password = bcrypt.hashSync(updates.password, 10);
    }
    this.users[idx] = { ...this.users[idx], ...updates };
    this.save();
    return this.users[idx];
  }
}

const backend = getStoreBackend();
export const store: DataStore = backend === 'firestore' ? new FirestoreStore() : new JsonDataStore();
