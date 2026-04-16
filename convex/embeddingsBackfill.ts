"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

// One-shot seeding: re-embed every user. Run with:
//   npx convex run embeddingsBackfill:backfillAll
//
// Safe to re-run; reindexUser deletes the user's points first. Sequential
// to keep OpenAI rate-limit pressure low; bump concurrency if needed.
export const backfillAll = action({
  args: {},
  handler: async (ctx): Promise<{ users: number; totalItems: number }> => {
    const users: Doc<"users">[] = await ctx.runQuery(api.users.getUsers, {});
    let totalItems = 0;
    for (const user of users) {
      const { count }: { count: number } = await ctx.runAction(
        internal.embeddings.reindexUser,
        { userId: user._id },
      );
      totalItems += count;
    }
    return { users: users.length, totalItems };
  },
});
