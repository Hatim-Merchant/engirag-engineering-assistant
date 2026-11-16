import { z } from 'zod';

/**
 * Treats empty strings in `.env` files as unset so Zod defaults apply cleanly,
 * while still rejecting genuinely invalid non-numeric values.
 */
const optionalNumericEnv = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: optionalNumericEnv(z.coerce.number().int().min(1).max(65535).default(3000)),
  CORS_ORIGIN: z.string().trim().min(1).default('http://localhost:5173'),

  POSTGRES_HOST: z.string().trim().min(1).default('localhost'),
  POSTGRES_PORT: optionalNumericEnv(z.coerce.number().int().min(1).max(65535).default(5432)),
  POSTGRES_USER: z.string().trim().min(1).default('engirag'),
  POSTGRES_PASSWORD: z.string().min(1).default('engirag_dev_password'),
  POSTGRES_DB: z.string().trim().min(1).default('engirag'),
  DATABASE_URL: z
    .string()
    .trim()
    .refine(
      (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
      'DATABASE_URL must start with postgres:// or postgresql://',
    )
    .refine((value) => {
      try {
        const parsed = new URL(value);
        return Boolean(parsed.hostname && parsed.pathname && parsed.pathname !== '/');
      } catch {
        return false;
      }
    }, 'DATABASE_URL must be a well-formed URL with host and database name'),

  EMBEDDING_MODEL: z.string().trim().min(1).default('Xenova/all-MiniLM-L6-v2'),
  EMBEDDING_DIMENSIONS: optionalNumericEnv(z.coerce.number().int().positive().default(384)),

  LLM_PROVIDER: z.enum(['groq', 'gemini']).default('groq'),
  GROQ_API_KEY: z.string().optional().default(''),
  GROQ_BASE_URL: z.string().trim().url().default('https://api.groq.com/openai/v1'),
  GROQ_MODEL: z.string().trim().min(1).default('openai/gpt-oss-20b'),

  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-2.5-flash'),

  CHUNK_SIZE_TOKENS: optionalNumericEnv(z.coerce.number().int().min(50).max(4000).default(500)),
  CHUNK_OVERLAP_TOKENS: optionalNumericEnv(z.coerce.number().int().min(0).max(1000).default(75)),
  RETRIEVAL_TOP_K: optionalNumericEnv(z.coerce.number().int().min(1).max(50).default(5)),
  RETRIEVAL_MIN_SCORE: optionalNumericEnv(z.coerce.number().min(0).max(1).default(0.35)),
});

export type AppEnv = z.infer<typeof envSchema>;

/**
 * Validates raw process environment variables at application startup.
 * Error output includes only field names and reasons so secrets are never leaked.
 */
export function validateEnv(rawEnv: NodeJS.ProcessEnv): AppEnv {
  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  if (parsed.data.CHUNK_OVERLAP_TOKENS >= parsed.data.CHUNK_SIZE_TOKENS) {
    throw new Error(
      'Invalid environment configuration: CHUNK_OVERLAP_TOKENS must be smaller than CHUNK_SIZE_TOKENS',
    );
  }

  return parsed.data;
}
