import { describe, expect, it } from 'vitest';
import { serviceFormSchema } from './service-form';

const validService = {
  name: '  Signature Soft Glam  ',
  price: '150',
  duration: '60',
  description: 'A polished soft-glam finish.',
  category: 'soft-glam',
};

describe('provider service form validation', () => {
  it('normalizes a valid edit payload for the API', () => {
    expect(serviceFormSchema.parse(validService)).toEqual({
      name: 'Signature Soft Glam',
      price: 150,
      duration: 60,
      description: 'A polished soft-glam finish.',
      category: 'soft-glam',
    });
  });

  it('rejects blank, negative, and non-positive service values', () => {
    const result = serviceFormSchema.safeParse({
      ...validService,
      name: ' ',
      price: '-1',
      duration: '0',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(issue => issue.path[0])).toEqual(
        expect.arrayContaining(['name', 'price', 'duration']),
      );
    }
  });
});
