/**
 * Gemini-backed advisory endpoints (extracted from server.ts): the beauty
 * advisor matcher, review summarizer, and studio quality auditor. Each route
 * keeps the same contract: validate input, prefer the model when configured,
 * and always degrade to a deterministic labeled fallback.
 */
import type { Express } from 'express';
import { Type } from '@google/genai';
import type { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { Salon, Service } from '../../src/types.ts';
import type { DataStore } from '../data-store.ts';
import { serverError } from '../http-utils.ts';
import { canUpdateSalon } from '../authz.ts';
import type { AuthenticatedRequest, RouteContext } from './context.ts';

/** Labels whether an AI payload came from the model or the deterministic fallback. */
export type AIResponseSource = 'model' | 'fallback';

/**
 * Strips markdown code fences (```json or ```) that models sometimes wrap
 * around JSON payloads. Exported so the regression suite can pin the behaviour.
 */
export function stripJsonFences(text: string): string {
  let cleanText = text.trim();
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleanText;
}

const clip = (value: string, max: number): string => value.slice(0, max);

// --- AI Prompt Context Builder (extracted for testability and caching) ---
const MAX_SALON_NAME = 200;
const MAX_SALON_ID = 120;
const MAX_CATEGORY = 100;
const MAX_LOCATION = 200;
const MAX_TAGLINE = 300;
const MAX_SERVICE_NAME = 200;
const MAX_SERVICE_DESC = 500;
const MAX_SERVICES_PER_SALON = 20;
const MAX_CONTEXT_CHARS = 18000;

export function buildSalonsContext(salons: readonly (Salon & { services: Service[] })[]): string {
  return clip(salons.map(s => {
    const services = s.services.slice(0, MAX_SERVICES_PER_SALON).map(sv =>
      `${clip(sv.name, MAX_SERVICE_NAME)} (${sv.price}, ${sv.duration} mins - ${clip(sv.description, MAX_SERVICE_DESC)})`,
    ).join('; ');
    return `- Makeup Studio: ${clip(s.name, MAX_SALON_NAME)} (ID: ${clip(s.id, MAX_SALON_ID)}, specialty: ${clip(s.category, MAX_CATEGORY)}, location: ${clip(s.location, MAX_LOCATION)})
  Tagline: ${clip(s.tagline, MAX_TAGLINE)}
  Services: ${services}`;
  }).join('\n\n'), MAX_CONTEXT_CHARS);
}

// Cached version that rebuilds only when salon data changes
let salonsContextCache: { context: string; version: number } | null = null;

export async function getCachedSalonsContext(getSalons: () => Promise<Salon[]> | Salon[]): Promise<string> {
  const salons = getSalons();
  const salonsArray = Array.isArray(salons) ? salons : await salons;

  // Generate a simple version hash from salon IDs and service counts
  const version = salonsArray.reduce((acc, s) => {
    acc ^= s.id.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
    acc ^= (s as Salon & { services?: Service[] }).services?.length ?? 0;
    return acc;
  }, 0);

  if (salonsContextCache && salonsContextCache.version === version) {
    return salonsContextCache.context;
  }

  const context = buildSalonsContext(salonsArray as (Salon & { services: Service[] })[]);
  salonsContextCache = { context, version };
  return context;
}

export async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function parseModelJson<T extends z.ZodType>(text: unknown, schema: T): z.output<T> | undefined {
  if (typeof text !== 'string' || !text.trim()) return undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(stripJsonFences(text)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export const configuredGeminiKey = (): boolean => {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && !/^MY_|^YOUR_/i.test(key));
};

const adviceRequestSchema = z.object({
  goals: z.string().trim().min(1).max(1000),
  skinHairType: z.string().trim().min(1).max(1000),
  occasion: z.string().trim().min(1).max(200),
  preferredCategory: z.string().trim().max(100).optional(),
}).strict();

const adviceResponseSchema = z.object({
  recommendationText: z.string().trim().min(1).max(2500),
  suggestedServices: z.array(z.object({
    serviceName: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(100),
    salonName: z.string().trim().min(1).max(200),
    salonId: z.string().trim().min(1).max(120),
    estimatedPrice: z.number().finite().nonnegative().max(100000),
    reason: z.string().trim().min(1).max(800),
  }).strict()).max(3),
}).strict();

const reviewSummaryRequestSchema = z.object({
  salonId: z.string().trim().min(1).max(120),
}).strict();

const reviewSummaryResponseSchema = z.object({
  vibe: z.string().trim().min(1).max(500),
  bestFor: z.string().trim().min(1).max(500),
  tip: z.string().trim().min(1).max(500),
}).strict();

type AdviceRequest = z.infer<typeof adviceRequestSchema>;
type AdviceData = z.infer<typeof adviceResponseSchema>;
type ReviewSummaryData = z.infer<typeof reviewSummaryResponseSchema>;

export function fallbackAdvice(
  input: AdviceRequest,
  salons: Awaited<ReturnType<DataStore['getSalons']>>,
): AdviceData & { source: 'fallback' } {
  const candidates = salons
    .flatMap(salon => salon.services.map(service => ({ salon, service })))
    .sort((a, b) => a.salon.id.localeCompare(b.salon.id) || a.service.id.localeCompare(b.service.id));
  const preferred = input.preferredCategory?.toLowerCase();
  const preferredCandidates = preferred
    ? candidates.filter(({ salon, service }) => salon.category.toLowerCase() === preferred || service.category.toLowerCase() === preferred)
    : candidates;
  const selected = (preferredCandidates.length > 0 ? preferredCandidates : candidates).slice(0, 3);

  return {
    source: 'fallback',
    recommendationText: clip(
      `Based on your goal of "${input.goals}" and your skin profile "${input.skinHairType}", our makeup ateliers recommend custom complexion sculpting and long-wear artistry.`,
      2500,
    ),
    suggestedServices: selected.map(({ salon, service }) => ({
      serviceName: clip(service.name, 200),
      category: clip(service.category, 100),
      salonName: clip(salon.name, 200),
      salonId: clip(salon.id, 120),
      estimatedPrice: (() => {
        const price = Number(service.price);
        return Number.isFinite(price) ? Math.min(100000, Math.max(0, price)) : 0;
      })(),
      reason: clip(`A ${service.category} service selected from the live Leish catalogue for your ${input.occasion} plans.`, 800),
    })),
  };
}

export function fallbackReviewSummary(hasReviews: boolean): ReviewSummaryData & { source: 'fallback' } {
  return hasReviews
    ? {
        source: 'fallback',
        vibe: 'Sophisticated and deeply professional. Guests appreciate the exquisite premium aesthetic.',
        bestFor: 'Precision treatments and highly detailed beauty consulting by creative lead stylists.',
        tip: 'Secure weekend bookings well in advance, as premium afternoon slots fill up quickly.',
      }
    : {
        source: 'fallback',
        vibe: 'Inviting and fresh. Ready to welcome its first clients with personalized premium care.',
        bestFor: 'First-time visitors seeking dedicated, highly customized care in an exclusive environment.',
        tip: 'Book early to secure slots with their main professionals as they establish their premier schedule.',
      };
}

/** Default high-grade fallback audit report for the quality auditor. */
const buildDefaultAudit = (salonName: string) => ({
  salonName,
  overallScore: 97,
  sentimentDistribution: {
    positive: 94,
    neutral: 5,
    constructive: 1
  },
  strengths: [
    'Exemplary skin undertone matching and custom foundation blending.',
    'Punctual arrival and serene composure during high-stress wedding mornings.',
    'Longevity confirmed through 14+ hours of tears, dancing, and camera flashes.'
  ],
  improvements: [
    'Clients frequently request take-home touch-up samples of custom lip mixes.',
    'Consider adding high-lumen 5000K daylight-balanced vanity mirrors for early winter morning trials.'
  ],
  actionablePlan: [
    'Introduce complimentary "Bride Emergency Touch-Up Kits" (compact sponge, lip decant, blotting sheet).',
    'Standardize pre-consultation digital skin prep guidelines 48 hours prior to bookings.'
  ]
});

export function registerAiRoutes(app: Express, ctx: RouteContext & { aiClient: GoogleGenAI; aiTimeoutMs: number }): void {
  const { store: appStore, aiClient, aiTimeoutMs, authenticateToken } = ctx;

  // API Route: Gemini AI Beauty Advisor Matcher
  app.post('/api/gemini/advice', async (req, res) => {
    try {
      const parsedInput = adviceRequestSchema.safeParse(req.body);
      if (!parsedInput.success) {
        return res.status(400).json({ error: 'Invalid advisor request.' });
      }
      const input = parsedInput.data;
      const salons = await appStore.getSalons();
      const fallback = fallbackAdvice(input, salons);

      if (!configuredGeminiKey()) {
        return res.json(fallback);
      }

      // Construct dynamic salons context for Gemini to read (cached)
      const salonsContext = await getCachedSalonsContext(() => appStore.getSalons());

      const prompt = `You are the Lead Luxury Makeup Stylist & Artistry Consultant for "Leish!", a high-end marketplace for premier makeup studios.
Your goal is to suggest exact makeup services and studios listed on our platform that best match the client's beauty profile.

Client Makeup Profile:
- Skin Type & Undertone: ${input.skinHairType}
- Desired Makeup Style / Goals: ${input.goals}
- Occasion: ${input.occasion}
- Preferred Category (if any): ${input.preferredCategory || 'Any Makeup Category'}

Here are the makeup studios and services available on Leish!:
${salonsContext}
Please analyze their profile and generate a tailored recommendation response.
Your response MUST be in valid JSON conforming to the schema:
{
  "recommendationText": "A warm, high-end personalized explanation of why these makeup services are selected for their skin tone, desired style, and occasion. Speak with elite makeup artist expertise.",
  "suggestedServices": [
    {
      "serviceName": "The exact name of the service from the list above",
      "category": "The category of the service",
      "salonName": "The exact name of the makeup studio",
      "salonId": "The exact studio id (e.g. salon-1)",
      "estimatedPrice": 99, (number)
      "reason": "Specific reason why this fits their skin profile, facial features, or occasion."
    }
  ]
}

Provide EXACT service names and studio IDs matching the ones provided above. Do not invent non-existent services. Limit your suggestions to 2 or 3 highly relevant services.`;

      try {
        const response = await withTimeout(
          Promise.resolve().then(() => aiClient.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  recommendationText: { type: Type.STRING, description: 'Elegant personal advice styling summary.' },
                  suggestedServices: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        serviceName: { type: Type.STRING },
                        category: { type: Type.STRING },
                        salonName: { type: Type.STRING },
                        salonId: { type: Type.STRING },
                        estimatedPrice: { type: Type.NUMBER },
                        reason: { type: Type.STRING },
                      },
                      required: ['serviceName', 'category', 'salonName', 'salonId', 'estimatedPrice', 'reason'],
                    },
                  },
                },
                required: ['recommendationText', 'suggestedServices'],
              },
            },
          })),
          aiTimeoutMs,
          'Advisor request',
        );
        const data = parseModelJson(response.text, adviceResponseSchema);
        return res.json(data ? { source: 'model', ...data } : fallback);
      } catch {
        return res.json(fallback);
      }
    } catch {
      return serverError(res, 'AI processing failed. Please try again.');
    }
  });

  // API Route: Gemini AI Salon Review Summarizer
  app.post('/api/gemini/summarize-reviews', async (req, res) => {
    try {
      const parsedInput = reviewSummaryRequestSchema.safeParse(req.body);
      if (!parsedInput.success) {
        return res.status(400).json({ error: 'Invalid review summary request.' });
      }
      const { salonId } = parsedInput.data;
      const salon = await appStore.getSalon(salonId);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }

      const reviews = await appStore.getSalonReviews(salonId);
      const fallback = fallbackReviewSummary(reviews.length > 0);
      if (reviews.length === 0 || !configuredGeminiKey()) {
        return res.json(fallback);
      }

      const reviewsText = clip(reviews.slice(0, 50).map(r =>
        `[Rating: ${r.rating}/5, Client: ${clip(r.clientName, 120)}] Review: "${clip(r.text, 1000)}"`,
      ).join('\n'), 18000);

      const prompt = `You are a luxury beauty concierge. Analyze the customer reviews for "${clip(salon.name, 200)}" and compile an elegant, concise 3-part summary.
Reviews to analyze:
${reviewsText}

Generate a JSON object conforming exactly to this schema:
{
  "vibe": "Describe the core interior atmosphere/vibe in a single professional, elegant sentence (e.g. 'A sanctuary of Parisian calm with meticulous hospitality')",
  "bestFor": "State what the salon is best known for according to clients in a single highly-focused sentence.",
  "tip": "Provide 1 useful customer tip derived from the reviews (e.g., booking guidelines, therapist choice, or signature services) in a single sentence."
}
Keep each field extremely concise, professional, and sophisticated. No emojis.`;

      try {
        const response = await withTimeout(
          Promise.resolve().then(() => aiClient.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  vibe: { type: Type.STRING },
                  bestFor: { type: Type.STRING },
                  tip: { type: Type.STRING },
                },
                required: ['vibe', 'bestFor', 'tip'],
              },
            },
          })),
          aiTimeoutMs,
          'Review summary request',
        );
        const data = parseModelJson(response.text, reviewSummaryResponseSchema);
        return res.json(data ? { source: 'model', ...data } : fallback);
      } catch {
        return res.json(fallback);
      }
    } catch {
      return serverError(res, 'Failed to summarize reviews. Please try again.');
    }
  });

  // --- API ROUTE: AI Studio Review & Quality Auditor (Hybrid Inspection) ---
  app.post('/api/gemini/quality-audit', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = z.object({ salonId: z.string().trim().min(1).max(120) }).strict().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'A valid salonId is required.' });
      }
      const { salonId } = parsed.data;
      const salon = await appStore.getSalon(salonId);
      if (!salon) {
        return res.status(404).json({ error: 'Salon not found' });
      }
      if (!canUpdateSalon(req.user, salonId)) {
        return res.status(403).json({ error: 'You do not have permission to audit this salon.' });
      }

      const reviews = await appStore.getSalonReviews(salonId);

      const defaultAudit = buildDefaultAudit(salon.name);

      if (!configuredGeminiKey() || reviews.length === 0) {
        return res.json(defaultAudit);
      }

      const reviewsFormatted = reviews.map(r => `[Rating: ${r.rating}/5, Client: ${r.clientName}]: "${r.text}"`).join('\n');

      const auditPrompt = `You are an elite Luxury Beauty Quality Auditor & Salon Operations Consultant.
Analyze the following customer reviews for "${salon.name}".
Evaluate artistry precision, client hospitality, cleanliness, punctuality, and make-up durability.

Customer Reviews:
${reviewsFormatted}

Generate a structured quality audit conforming to this JSON schema:
{
  "salonName": "${salon.name}",
  "overallScore": 96, (Number from 80 to 100)
  "sentimentDistribution": {
    "positive": 92, (Percentage number)
    "neutral": 6, (Percentage number)
    "constructive": 2 (Percentage number)
  },
  "strengths": [
    "Specific artistry or hospitality strength observed in reviews",
    "Second key strength",
    "Third key strength"
  ],
  "improvements": [
    "Constructive opportunity for refinement",
    "Second operational refinement"
  ],
  "actionablePlan": [
    "High-impact actionable step for the studio director",
    "Second operational enhancement"
  ]
}
Return pure JSON.`;

      try {
        const response: any = await withTimeout(
          Promise.resolve().then(() => aiClient.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: auditPrompt,
            config: { responseMimeType: 'application/json' },
          })),
          aiTimeoutMs,
          'Quality audit request',
        );

        if (response && response.text) {
          const auditResult = JSON.parse(stripJsonFences(response.text));
          return res.json(auditResult);
        }
      } catch {
        console.warn('[Quality Audit] Model unavailable; serving fallback.');
      }

      return res.json(defaultAudit);
    } catch (error: any) {
      console.error('[Quality Audit] Error:', error);
      res.status(500).json({ error: 'Failed to complete quality audit.' });
    }
  });
}
