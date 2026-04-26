"use node";

// Verify-a-key action. Lives in its own file because it imports the AI SDK
// providers, which only run in Node. The mutations/queries in
// `convex/userAiKeys.ts` stay on the default Convex runtime so they don't
// pay the cold-start cost.
//
// We call the upstream provider with a 1-token chat completion using the
// supplied key — without storing it. A 200 response means the key works;
// any throw bubbles up as a structured failure for the UI to render.

import { v } from "convex/values";
import { action } from "./_generated/server";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

const MINIMAX_BASE_URL = "https://api.minimaxi.chat/v1";
const MINIMAX_MODEL_ID = "MiniMax-Text-01";
const GEMINI_MODEL_ID = "gemini-2.5-flash";

export const testKey = action({
  args: {
    provider: v.union(v.literal("gemini"), v.literal("minimax")),
    key: v.string(),
  },
  handler: async (
    _ctx,
    { provider, key },
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    const trimmed = key.trim();
    if (!trimmed) return { ok: false, error: "Key is empty" };

    try {
      if (provider === "gemini") {
        const google = createGoogleGenerativeAI({ apiKey: trimmed });
        await generateText({
          model: google(GEMINI_MODEL_ID),
          prompt: "ping",
          // Keep it cheap — we only care that auth + model resolution worked.
          maxOutputTokens: 1,
        });
      } else {
        const minimax = createOpenAICompatible({
          name: "minimax",
          baseURL: MINIMAX_BASE_URL,
          apiKey: trimmed,
        });
        await generateText({
          model: minimax(MINIMAX_MODEL_ID),
          prompt: "ping",
          maxOutputTokens: 1,
        });
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  },
});
