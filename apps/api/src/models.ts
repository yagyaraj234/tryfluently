import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createProviderRegistry, type LanguageModel } from 'ai';

// One model per AI job: fast for Step generation, strong for everything that judges or plans.
export const jobs = ['step', 'brief', 'roadmap', 'judge', 'report'] as const;
export type Models = Record<(typeof jobs)[number], LanguageModel>;

// Settings look like MODEL_BRIEF=google:gemini-2.5-pro, so switching provider is a config change.
export function modelsFromSettings(env: Record<string, string | undefined>): Models {
  const registry = createProviderRegistry({
    openai: createOpenAI({ apiKey: env.OPENAI_API_KEY }),
    google: createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY }),
  });
  return Object.fromEntries(
    jobs.map((job) => {
      const key = `MODEL_${job.toUpperCase()}`;
      const id = env[key];
      if (!id) throw new Error(`Missing env var ${key}`);
      return [job, registry.languageModel(id as `openai:${string}`)];
    }),
  ) as Models;
}
