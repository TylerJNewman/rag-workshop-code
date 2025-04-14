import { z } from 'zod';

/**
 * Common type definitions
 */
export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type Response<T> = SuccessResponse<T> | ErrorResponse;

export type AsyncFunction<T = void> = () => Promise<T>;
export type Callback<T = void> = (error?: Error | null, result?: T) => void;

/**
 * Environment configuration schema
 */
const EnvSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // OpenAI configuration
  OPENAI_MODEL: z.string().min(1),

  // Gemini configuration
  GEMINI_MODEL: z.string().min(1),

  // Google Generative AI configuration
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
});

/**
 * Environment configuration type
 */
export type EnvConfig = z.infer<typeof EnvSchema>;

/**
 * Load and validate environment configuration
 */
export const loadConfig = (): EnvConfig => {
  const config = {
    NODE_ENV: process.env.NODE_ENV,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  };

  try {
    return EnvSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues
        .filter((issue) => issue.code === 'invalid_type' && issue.received === 'undefined')
        .map((issue) => issue.path.join('.'));

      if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
      }
    }
    throw error;
  }
};

// Export the loaded configuration
export const env = loadConfig();
