"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateText } from "ai";
import type { Doc } from "./_generated/dataModel";
import { resolveLlm } from "./_lib/llmProvider";

export const generateAgentResponse = internalAction({
  args: {
    responseId: v.id("agentChatResponses"),
    askerId: v.id("users"),
    query: v.string(),
    llmProvider: v.optional(
      v.union(v.literal("gemini"), v.literal("minimax")),
    ),
    llmApiKey: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { responseId, askerId, query, llmProvider, llmApiKey },
  ): Promise<void> => {
    try {
      const { model } = resolveLlm({
        provider: llmProvider,
        apiKey: llmApiKey,
      });

      const user: Doc<"users"> | null = await ctx.runQuery(
        internal.users.getUserById,
        { userId: askerId },
      );

      const contextLines: string[] = [];
      if (user) {
        if (user.name) contextLines.push(`Name: ${user.name}`);
        if (user.location) contextLines.push(`Location: ${user.location}`);
        if (user.interests && user.interests.length > 0) {
          contextLines.push(
            `Interests: ${user.interests.map((i) => i.value).join(", ")}`,
          );
        }
        if (user.places && user.places.length > 0) {
          contextLines.push(
            `Favorite places: ${user.places
              .map((p) => `${p.name} (${p.type})`)
              .slice(0, 10)
              .join(", ")}`,
          );
        }
      }
      const askerContext = contextLines.join("\n");

      const system = [
        "You are Homie — a friendly, concise assistant embedded inside a chat between the asker and one of their friends.",
        "The asker has privately tagged you with @agent. Your answer is for the asker only unless they choose to share it.",
        "Focus on suggestions for meetups, activity ideas, checking whether events or tickets are plausibly available, rough price/availability estimates, or answering practical questions about plans.",
        "Be explicit when a fact may be outdated — you cannot browse the web, so hedge on real-time facts (ticket inventory, current prices).",
        "Keep replies under 150 words unless the asker asked for a list.",
        askerContext ? `About the asker:\n${askerContext}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const { text } = await generateText({
        model,
        system,
        prompt: query,
        temperature: 0.7,
      });

      await ctx.runMutation(internal.dm.finalizeAgentResponse, {
        responseId,
        status: "ready",
        content: text,
      });
    } catch (err) {
      await ctx.runMutation(internal.dm.finalizeAgentResponse, {
        responseId,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});
