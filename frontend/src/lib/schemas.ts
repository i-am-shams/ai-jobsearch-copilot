import { z } from 'zod';

/**
 * Zod schemas are the single source of truth for both API shapes and form
 * validation. The TypeScript types are inferred from them rather than declared
 * separately, so a schema and its type cannot drift apart.
 *
 * Responses are parsed at runtime, not just typed. A hand-written interface is
 * a compile-time promise about data the compiler has never seen: `completedAt`
 * could vanish from the API tomorrow and every build would still pass while the
 * UI quietly rendered nothing. Parsing turns that into a loud, immediate error -
 * the same failure mode this project has now been bitten by twice.
 */

export const matchStatusSchema = z.enum(['Pending', 'Processing', 'Completed', 'Failed']);
export type MatchStatus = z.infer<typeof matchStatusSchema>;

export const applicationResponseSchema = z.object({
  id: z.string(),
  jobTitle: z.string(),
  companyName: z.string(),
  createdAt: z.string(),
  matchStatus: matchStatusSchema,
  matchScore: z.number().nullable(),
  gapAnalysis: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type ApplicationResponse = z.infer<typeof applicationResponseSchema>;

export const applicationListSchema = z.array(applicationResponseSchema);

// Minimums are deliberately more than 0. The API happily accepts a one-character
// resume and spends a real, metered Gemini call telling you it does not match -
// catching that here costs nothing and saves a round trip through the whole
// async pipeline to reach an obvious answer.
export const createApplicationSchema = z.object({
  jobTitle: z.string().trim().min(1, 'Job title is required.').max(200, 'Job title is too long.'),
  companyName: z.string().trim().min(1, 'Company name is required.').max(200, 'Company name is too long.'),
  resumeText: z
    .string()
    .trim()
    .min(50, 'Paste at least 50 characters of your resume so the match has something to work with.'),
  jobDescriptionText: z
    .string()
    .trim()
    .min(50, 'Paste at least 50 characters of the job description.'),
});
export type CreateApplicationRequest = z.infer<typeof createApplicationSchema>;

// Mirrors what the API actually enforces. The password minimum matches the
// register endpoint, so a user is told before submitting rather than after.
export const credentialsSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export const authResponseSchema = z.object({
  token: z.string(),
  email: z.string(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
