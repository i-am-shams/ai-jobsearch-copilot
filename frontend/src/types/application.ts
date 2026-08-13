/**
 * These types used to be hand-written interfaces. They are now inferred from the
 * zod schemas in lib/schemas.ts so that the validation and the type can never
 * disagree. This file stays as the import path the components already use.
 */
export type {
  ApplicationResponse,
  CreateApplicationRequest,
  MatchStatus,
} from '../lib/schemas';
