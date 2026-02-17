import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8888),

  LLM_PROVIDER: z.enum(['groq', 'anthropic', 'openai']).default('groq'),
  LLM_MODEL: z.string().optional(),

  GROQ_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  CORS_ORIGINS: z.string().optional(), // comma-separated list
  ADMIN_API_KEY: z.string().optional(),
  OPERATOR_API_KEY: z.string().optional(),
  VIEWER_API_KEY: z.string().optional(),
  SESSION_TOKEN_SECRET: z.string().optional(),
});

export type AppEnv = z.infer<typeof EnvSchema> & {
  corsOrigins: string[];
};

export function validateEnv(): AppEnv {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`[Env] Invalid environment configuration: ${issues}`);
  }

  const env = parsed.data;

  if (env.NODE_ENV === 'production') {
    const hasProviderKey =
      (env.LLM_PROVIDER === 'groq' && !!env.GROQ_API_KEY) ||
      (env.LLM_PROVIDER === 'anthropic' && !!env.ANTHROPIC_API_KEY) ||
      (env.LLM_PROVIDER === 'openai' && !!env.OPENAI_API_KEY);

    if (!hasProviderKey) {
      throw new Error(
        `[Env] Missing API key for LLM_PROVIDER=${env.LLM_PROVIDER} in production.`
      );
    }

    if (!env.ADMIN_API_KEY) {
      throw new Error('[Env] Missing ADMIN_API_KEY in production.');
    }
    if (!env.SESSION_TOKEN_SECRET) {
      throw new Error('[Env] Missing SESSION_TOKEN_SECRET in production.');
    }
  }

  const corsOrigins = (env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  return {
    ...env,
    corsOrigins,
  };
}
