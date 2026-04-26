// Builds an AI SDK `LanguageModel` from a per-call provider + key. The keys
// themselves are stored in `localStorage` on the user's browser (see
// `hooks/use-local-ai-keys.ts`) and forwarded as plain action args. They
// pass through Convex transiently to reach the upstream model and are NEVER
// written to the database.
//
// Resolution order:
//   1. The {provider, apiKey} args supplied by the caller.
//   2. Env-var fallback (`GOOGLE_GENERATIVE_AI_API_KEY` / `MINIMAX_API_KEY`)
//      when `process.env.VERCEL_ENV !== "production"` — keeps preview + local
//      dev usable without forcing every dev to paste a key.
//
// Missing-key on prod throws `BYOKRequiredError` whose message starts with
// the sentinel `[BYOK_REQUIRED:<provider>]`. The chat client matches on that
// prefix to swap the generic toast for a "set your key" CTA pointing at
// /dashboard/integrations.

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export type LlmProvider = "gemini" | "minimax";

export type ResolvedLlm = {
  model: LanguageModel;
  provider: LlmProvider;
  modelId: string;
};

export type LlmCredentials = {
  provider?: LlmProvider;
  apiKey?: string;
};

const GEMINI_MODEL_ID = "gemini-2.5-flash";
// MiniMax exposes an OpenAI-compatible chat endpoint at /v1; model ids are
// case-sensitive and follow MiniMax's own naming.
const MINIMAX_BASE_URL = "https://api.minimaxi.chat/v1";
const MINIMAX_MODEL_ID = "MiniMax-Text-01";

export class BYOKRequiredError extends Error {
  readonly provider: LlmProvider;
  constructor(provider: LlmProvider) {
    super(
      `[BYOK_REQUIRED:${provider}] No ${provider} API key provided. ` +
        `Open Settings → Integrations and add your ${provider} key.`,
    );
    this.name = "BYOKRequiredError";
    this.provider = provider;
  }
}

function envFallback(name: string): string | undefined {
  // Hard cutover on prod: BYOK or nothing. Preview + local still get the
  // env-var safety net so dev work isn't blocked by missing user keys.
  if (process.env.VERCEL_ENV === "production") return undefined;
  return process.env[name];
}

export function resolveLlm(creds: LlmCredentials): ResolvedLlm {
  // Default to Gemini when caller didn't specify — matches the app's
  // pre-BYOK behavior so legacy callers (none today) wouldn't break.
  const provider: LlmProvider = creds.provider ?? "gemini";

  if (provider === "minimax") {
    const key = creds.apiKey ?? envFallback("MINIMAX_API_KEY");
    if (!key) throw new BYOKRequiredError("minimax");
    const minimax = createOpenAICompatible({
      name: "minimax",
      baseURL: MINIMAX_BASE_URL,
      apiKey: key,
    });
    return {
      model: minimax(MINIMAX_MODEL_ID),
      provider: "minimax",
      modelId: MINIMAX_MODEL_ID,
    };
  }

  const key = creds.apiKey ?? envFallback("GOOGLE_GENERATIVE_AI_API_KEY");
  if (!key) throw new BYOKRequiredError("gemini");
  const google = createGoogleGenerativeAI({ apiKey: key });
  return {
    model: google(GEMINI_MODEL_ID),
    provider: "gemini",
    modelId: GEMINI_MODEL_ID,
  };
}

