import { z } from 'zod';

const numericField = (label: string, predicate: (value: number) => boolean, message: string) =>
  z.string()
    .trim()
    .min(1, `Enter a ${label}.`)
    .refine(value => {
      const number = Number(value);
      return Number.isFinite(number) && predicate(number);
    }, message)
    .transform(Number);

/** Browser form contract shared by add and edit service flows. */
export const serviceFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter a service name.').max(120, 'Use 120 characters or fewer for the service name.'),
  price: numericField('price', value => value >= 0, 'Enter a non-negative price.'),
  duration: numericField('duration', value => value > 0, 'Enter a positive duration.'),
  description: z.string().trim().max(1000, 'Use 1,000 characters or fewer for the description.'),
  category: z.string().trim().min(1, 'Choose a service category.').max(100, 'Use 100 characters or fewer for the category.'),
});

export type ServiceFormData = z.output<typeof serviceFormSchema>;
