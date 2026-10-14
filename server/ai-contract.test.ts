import fs from 'node:fs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import type { DataStore } from './data-store.ts';
import type { Review, Salon } from '../src/types.ts';

const TEST_DB = `/tmp/omnirush/leish-ai-contract-${process.pid}-${Date.now()}.json`;
const previousEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  LEISH_DB_PATH: process.env.LEISH_DB_PATH,
  STORE_BACKEND: process.env.STORE_BACKEND,
  LEISH_DISABLE_RATE_LIMIT: process.env.LEISH_DISABLE_RATE_LIMIT,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
};

process.env.NODE_ENV = 'test';
process.env.LEISH_DB_PATH = TEST_DB;
process.env.STORE_BACKEND = 'json';
process.env.LEISH_DISABLE_RATE_LIMIT = '1';
process.env.GEMINI_API_KEY = 'configured-test-key';

const salon: Salon = {
  id: 'salon-ai-test',
  name: 'AI Contract Salon',
  tagline: 'Test artistry',
  description: 'Test salon for deterministic AI route checks.',
  rating: 4.8,
  reviewCount: 1,
  location: 'Kuala Lumpur',
  address: 'Test Street',
  image: '',
  gallery: [],
  category: 'soft-glam',
  services: [{
    id: 'service-ai-test',
    name: 'Test Soft Glam',
    price: 150,
    duration: 60,
    description: 'A bounded test service.',
    category: 'soft-glam',
  }],
  staff: [],
  featured: false,
  workingHours: {},
};

const reviews: Review[] = [{
  id: 'review-ai-test',
  salonId: salon.id,
  clientName: 'Test Client',
  rating: 5,
  text: 'A calm, precise experience.',
  date: '2026-10-01',
}];

const dataStore = {
  getSalons: async () => [salon],
  getSalon: async (id: string) => id === salon.id ? salon : undefined,
  getSalonReviews: async (salonId: string) => salonId === salon.id ? reviews : [],
} as unknown as DataStore;

let createApp: typeof import('../server.ts').createApp;
const generateContent = vi.fn();
const fakeAi = {
  models: { generateContent },
} as unknown as GoogleGenAI;

let app: any;

beforeAll(async () => {
  ({ createApp } = await import('../server.ts'));
});

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'configured-test-key';
  generateContent.mockReset();
  app = createApp({ store: dataStore, ai: fakeAi, aiTimeoutMs: 25 });
});

afterAll(() => {
  fs.rmSync(TEST_DB, { force: true });
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const adviceBody = {
  goals: 'A natural wedding look',
  skinHairType: 'Neutral undertone with a dry complexion',
  occasion: 'wedding',
  preferredCategory: 'soft-glam',
};

describe('advisor AI contract', () => {
  it('returns a labeled fallback when a configured model rejects', async () => {
    generateContent.mockRejectedValue(new Error('provider quota failure'));

    const response = await request(app).post('/api/gemini/advice').send(adviceBody);

    expect(response.status).toBe(200);
    expect(response.body.source).toBe('fallback');
    expect(response.body.recommendationText).toContain('natural wedding look');
    expect(response.body.suggestedServices[0].salonId).toBe(salon.id);
  });

  it('falls back for malformed model JSON instead of returning a 500', async () => {
    generateContent.mockResolvedValue({ text: 'not valid JSON' });

    const response = await request(app).post('/api/gemini/advice').send(adviceBody);

    expect(response.status).toBe(200);
    expect(response.body.source).toBe('fallback');
  });

  it('bounds advisor input before any model call', async () => {
    const response = await request(app).post('/api/gemini/advice').send({
      ...adviceBody,
      goals: 'x'.repeat(1001),
    });

    expect(response.status).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('keeps keyless advisor responses deterministic', async () => {
    process.env.GEMINI_API_KEY = '';

    const first = await request(app).post('/api/gemini/advice').send(adviceBody);
    const second = await request(app).post('/api/gemini/advice').send(adviceBody);

    expect(first.status).toBe(200);
    expect(first.body.source).toBe('fallback');
    expect(second.body).toEqual(first.body);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('times out a hanging model and returns the deterministic fallback', async () => {
    generateContent.mockImplementation(() => new Promise(() => {}));

    const response = await request(app).post('/api/gemini/advice').send(adviceBody);

    expect(response.status).toBe(200);
    expect(response.body.source).toBe('fallback');
  });

  it('labels validated model output without changing the existing flat fields', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        recommendationText: 'A precise model recommendation.',
        suggestedServices: [{
          serviceName: 'Test Soft Glam',
          category: 'soft-glam',
          salonName: 'AI Contract Salon',
          salonId: salon.id,
          estimatedPrice: 150,
          reason: 'The service matches the requested look.',
        }],
      }),
    });

    const response = await request(app).post('/api/gemini/advice').send(adviceBody);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      source: 'model',
      recommendationText: 'A precise model recommendation.',
    });
  });
});

describe('review-summary AI contract', () => {
  it('returns a labeled fallback when a configured summarizer fails', async () => {
    generateContent.mockRejectedValue(new Error('provider unavailable'));

    const response = await request(app)
      .post('/api/gemini/summarize-reviews')
      .send({ salonId: salon.id });

    expect(response.status).toBe(200);
    expect(response.body.source).toBe('fallback');
    expect(response.body.vibe).toEqual(expect.any(String));
  });

  it('bounds summary input and handles keyless requests deterministically', async () => {
    const invalid = await request(app)
      .post('/api/gemini/summarize-reviews')
      .send({ salonId: 'x'.repeat(121) });
    expect(invalid.status).toBe(400);

    process.env.GEMINI_API_KEY = '';
    const first = await request(app)
      .post('/api/gemini/summarize-reviews')
      .send({ salonId: salon.id });
    const second = await request(app)
      .post('/api/gemini/summarize-reviews')
      .send({ salonId: salon.id });

    expect(first.status).toBe(200);
    expect(first.body.source).toBe('fallback');
    expect(second.body).toEqual(first.body);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rejects malformed summarizer JSON with the same fallback contract', async () => {
    generateContent.mockResolvedValue({ text: '{"vibe":"missing fields"}' });

    const response = await request(app)
      .post('/api/gemini/summarize-reviews')
      .send({ salonId: salon.id });

    expect(response.status).toBe(200);
    expect(response.body.source).toBe('fallback');
    expect(response.body.bestFor).toEqual(expect.any(String));
  });
});
