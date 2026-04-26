"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { generateText, stepCountIs } from "ai";
import type { Doc, Id } from "./_generated/dataModel";
import { buildChatTools } from "./agentTools";
import { resolveLlm } from "./_lib/llmProvider";

// Part shape we persist on `conversationMessages.parts`. Mirrors the AI SDK
// UIMessage shape closely enough that the client-side renderer can switch
// on `type` / `toolName` without an extra translation layer. Using a flat
// object (rather than a union) because every field ends up optional on the
// wire anyway — the schema validator is what enforces it.
type PersistedPart = {
  type: string; // "text" | `tool-${name}`
  text?: string;
  toolName?: string;
  toolCallId?: string;
  input?: string;
  output?: string;
  state?: "input-available" | "output-available" | "output-error";
  errorText?: string;
};

// NOTE: Per project rules, this file is the ONLY convex module modified for
// the business-variant AI work. Business-specific prompt enrichment (business
// name / category / tagline / address) is therefore sourced from the asker's
// users row plus whatever already-public query we can call without adding a
// new internal function. Currently we only read the `users` row (via the
// existing `internal.users.getUserById` helper) and fall back to generic
// placeholders when no business-specific signal is available.

// System prompt for personal-account users. This is the classic Homie voice —
// a friendly, opinionated guide to the asker's friend graph AND provider-
// backed discovery surface. See convex/agentTools.ts → buildChatTools() for
// the tool catalog this prompt refers to.
const PERSONAL_SYSTEM_PROMPT = [
  "You are Homie — a friendly, concise assistant the user chats with about their friends, their communities, their events, and things they might enjoy.",
  "",
  "CRITICAL RENDERING RULE: the chat UI renders rich cards for every tool you call. When a tool is the right way to answer, ALWAYS call the tool and let the UI render the card. DO NOT describe places, songs, movies, events, friends, communities, or announcements in prose when a tool can return them — keep your own text to a 1-2 sentence framing line at most.",
  "",
  "Tool catalog:",
  "  Friend-graph search (embedding):",
  "    • findFriendPlaces — restaurants, cafes, bars, parks, gyms — when the user asks 'where should I go' / 'what do my friends like' scoped to places.",
  "    • findFriendMedia  — movies, games, books, anime, music — scoped search.",
  "    • findFriendProjects — what friends are building.",
  "    • findFriendInterests — free-text interest tags.",
  "  Social analytics:",
  "    • findFriendsWithSharedMedia — EXACT overlap between the asker's PROFILE-saved items and each friend's PROFILE-saved items (movies, books, games, anime, series). Use for non-music domains ('which friends share my taste in anime/movies/games'). For MUSIC or SPOTIFY listening questions call findFriendsListeningTo instead.",
  "    • findFriendsInCommunity — which of the asker's friends are also members of a given community. Call `findCommunityByName` first if you only have a name.",
  "  Communities:",
  "    • listMyCommunities — enumerate the asker's communities.",
  "    • findCommunityByName — resolve a natural-language name → id.",
  "    • listRecentAnnouncements — recent announcements from the asker's communities. Default when asked 'what's happening in my communities'.",
  "  Events:",
  "    • getEventRsvpSummary — 'how many people have confirmed X', 'who's coming to Y'.",
  "    • listMyUpcomingEvents — the asker's schedule.",
  "  Inbox:",
  "    • summarizeUnreads — 'what unreads do I have' / 'summarise my messages'.",
  "  Spotify (real-time listening data, from connected accounts):",
  "    • findFriendsListeningTo — the asker's and friends' ACTUAL Spotify top/recent/liked tracks. Prefer this over findFriendMedia / findFriendsWithSharedMedia whenever the question is about real listening habits ('what are my friends listening to', 'who listens to the same music as me', 'find people playing rock right now'). Only users who have connected Spotify at /dashboard/integrations appear.",
  "  Discovery (provider-backed cards):",
  "    • searchPlaces, searchSongs, searchMovies, searchBooks, searchGames, searchAnime — call the right one whenever the user asks for recommendations NOT scoped to their friends.",
  "",
  "Behaviour:",
  "  • If a tool returns an empty list, say so briefly and suggest the next step (add more friends, add items to profile, widen the query).",
  "  • When the user mentions a specific friend, community, or event by NAME, you MUST first call the appropriate list/find tool to resolve that name to an id, then call the detail tool with the resolved id in the SAME turn. NEVER ask the user for an id — they don't know ids, and it's your job to look them up. Example: user asks 'who is going to the Saturday cafe meetup?' → call listMyUpcomingEvents, pick the event whose title matches 'Saturday cafe meetup', then call getEventRsvpSummary with that event's _id. Same pattern for communities (findCommunityByName → findFriendsInCommunity / listRecentAnnouncements) and any other tool that takes an opaque id.",
  "  • Never fabricate ids — if the resolver tool returns nothing matching, tell the user you couldn't find that name and ask them to try a different phrasing.",
  "  • Keep reply text under 120 words. The cards carry the detail.",
].join("\n");

// System prompt for business accounts. Shifts the tone from "friend finder"
// to "growth partner": the AI is the business owner's in-house strategist,
// covering outreach, community discovery, growth tactics, and team ops.
// The `{{businessName}}` / `{{businessCategory}}` / `{{businessTagline}}` /
// `{{businessLocation}}` placeholders are filled in per-request from the
// caller's primary owned business (if any) so the AI can speak to specifics.
const BUSINESS_SYSTEM_PROMPT = [
  "You are Homie for Business — a concise, pragmatic growth partner for small-business owners using Homie.",
  "",
  "Business context (fill-in):",
  "  • Name: {{businessName}}",
  "  • Category: {{businessCategory}}",
  "  • Tagline: {{businessTagline}}",
  "  • Location: {{businessLocation}}",
  "",
  "Focus areas:",
  "  1. Outreach — help the owner find and engage local customers and nearby communities. Suggest concrete channels, copy, and hooks that match their category and location.",
  "  2. Community discovery — recommend which Homie Communities (neighborhoods, interest groups, affinity circles) are a good fit for their business. Reason from category + location. If they haven't joined any, suggest a concrete shortlist with a one-line rationale each.",
  "  3. Growth & marketing tactics — draft ad copy, coupon ideas, event concepts, and partnership angles with complementary local businesses. Always propose 2–3 variants so the owner can pick.",
  "  4. Team management — explain how to use org channels, invite managers/employees, delegate ads, and track who's doing what.",
  "",
  "Style rules:",
  "  • Be concrete and actionable — output checklists, step-by-steps, or short drafts rather than generic advice.",
  "  • Keep replies under 250 words unless the owner explicitly asks for a long draft.",
  "  • When you propose ad copy, event titles, or announcement text, format them as clearly labeled variants (e.g. 'Variant A:', 'Variant B:').",
  "  • If the question is ambiguous (e.g. 'help me grow'), ask ONE clarifying question focused on the business's current biggest bottleneck (awareness, foot traffic, repeat visits, team coordination), then proceed.",
  "  • Never invent Homie features that don't exist. You know about: communities, community announcements, community polls, community events, ads (submit → approve → run), coupons attached to ads, org channels, and team members with owner/admin/manager/employee roles.",
  "  • You do NOT have access to the friend-graph search tools on this variant — avoid referring to 'your friends' or personal recommendations. Speak to the business as an operator.",
].join("\n");

function fillBusinessPrompt(params: {
  businessName: string;
  businessCategory: string;
  businessTagline: string;
  businessLocation: string;
}): string {
  return BUSINESS_SYSTEM_PROMPT.replace("{{businessName}}", params.businessName)
    .replace("{{businessCategory}}", params.businessCategory)
    .replace("{{businessTagline}}", params.businessTagline)
    .replace("{{businessLocation}}", params.businessLocation);
}

export const generateAIResponse = action({
  args: {
    conversationId: v.id("conversations"),
    userMessage: v.string(),
    // BYOK credentials forwarded from the browser. Both optional so
    // preview/local can still fall back to env vars; on prod a missing key
    // throws BYOKRequiredError which the client surfaces as a CTA.
    llmProvider: v.optional(
      v.union(v.literal("gemini"), v.literal("minimax")),
    ),
    llmApiKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const conversation: Doc<"conversations"> | null = await ctx.runQuery(
      api.conversations.getConversation,
      { conversationId: args.conversationId },
    );
    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`);
    }
    const askerId = conversation.userId;

    const { model } = resolveLlm({
      provider: args.llmProvider,
      apiKey: args.llmApiKey,
    });

    // Resolve which system prompt to use. We default to "personal" any time
    // the account type can't be positively confirmed as "business" — this
    // keeps the existing personal flow untouched for pre-existing users
    // whose row predates the accountType field.
    const asker: Doc<"users"> | null = await ctx.runQuery(
      internal.users.getUserById,
      { userId: askerId as Id<"users"> },
    );
    const accountType: "personal" | "business" =
      asker?.accountType === "business" ? "business" : "personal";

    let systemPrompt: string;
    if (accountType === "business") {
      // We'd love to stuff primary-business specifics (name, category,
      // tagline, address) into the prompt. The cleanest way would be a
      // dedicated internal query on `convex/businesses.ts`, but project
      // rules pin this PR to `convex/ai.ts` only. So we fall back to the
      // owner's user-row fields (name → business name, location → address)
      // and leave the rest as generic placeholders. The prompt is written
      // defensively so the AI still gives useful advice without them.
      const businessName =
        asker?.name && asker.name.trim() ? asker.name.trim() : "your business";
      const businessLocation =
        asker?.location && asker.location.trim()
          ? asker.location.trim()
          : "(unspecified)";
      systemPrompt = fillBusinessPrompt({
        businessName,
        businessCategory: "(unspecified — ask the owner if needed)",
        businessTagline: "(none set)",
        businessLocation,
      });
    } else {
      systemPrompt = PERSONAL_SYSTEM_PROMPT;
    }

    const messages = await ctx.runQuery(api.conversationMessages.getMessages, {
      conversationId: args.conversationId,
    });

    const chatHistory = messages.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content || "",
    }));
    chatHistory.push({ role: "user", content: args.userMessage });

    // Personal accounts get the friend-graph search + provider discovery
    // tools. Business accounts don't — there's no business-side "friends"
    // concept, and the personal tools would surface data the business
    // owner isn't entitled to see via this channel. Business replies are
    // pure text strategy for now.
    const tools =
      accountType === "business"
        ? undefined
        : buildChatTools(ctx, askerId);

    // Collect structured parts (text + tool calls/results) across every step
    // so we can persist them for rich-UI rendering. `onStepFinish` fires
    // once per model step; we append that step's content to the part list.
    const parts: PersistedPart[] = [];
    const pendingToolInputs = new Map<string, { name: string; input: string }>();

    const result = await generateText({
      model,
      system: systemPrompt,
      messages: chatHistory,
      tools,
      stopWhen: stepCountIs(5),
      temperature: 0.7,
      onStepFinish: (step) => {
        // Text deltas from this step.
        if (step.text && step.text.length > 0) {
          parts.push({ type: "text", text: step.text });
        }
        // Tool calls issued during this step. Record input so the matching
        // tool-result can be marked output-available later.
        const stepToolCalls = (step.toolCalls ?? []) as Array<{
          toolCallId: string;
          toolName: string;
          input?: unknown;
          args?: unknown;
        }>;
        for (const call of stepToolCalls) {
          const input = call.input ?? call.args;
          const inputStr = safeStringify(input);
          pendingToolInputs.set(call.toolCallId, {
            name: call.toolName,
            input: inputStr,
          });
          parts.push({
            type: `tool-${call.toolName}`,
            toolName: call.toolName,
            toolCallId: call.toolCallId,
            input: inputStr,
            state: "input-available",
          });
        }
        // Tool results for the calls issued this step (or earlier steps).
        const stepToolResults = (step.toolResults ?? []) as Array<{
          toolCallId: string;
          toolName: string;
          output?: unknown;
          result?: unknown;
        }>;
        for (const tr of stepToolResults) {
          const meta = pendingToolInputs.get(tr.toolCallId);
          const output = tr.output ?? tr.result;
          const outputStr = safeStringify(output);
          // Replace the placeholder input-available part (if any) with the
          // completed one so the UI doesn't render two cards per call.
          const idx = parts.findIndex(
            (p) =>
              p.type !== "text" &&
              "toolCallId" in p &&
              p.toolCallId === tr.toolCallId,
          );
          const completedPart: PersistedPart = {
            type: `tool-${tr.toolName}`,
            toolName: tr.toolName,
            toolCallId: tr.toolCallId,
            input: meta?.input,
            output: outputStr,
            state: "output-available",
          };
          if (idx >= 0) {
            parts[idx] = completedPart;
          } else {
            parts.push(completedPart);
          }
        }
      },
    });

    // If `onStepFinish` never fired (shouldn't happen with generateText but
    // stays safe), fall back to the aggregate text on the result.
    if (parts.length === 0 && result.text) {
      parts.push({ type: "text", text: result.text });
    }

    await ctx.runMutation(api.conversationMessages.createMessage, {
      conversationId: args.conversationId,
      role: "assistant",
      content: result.text,
      parts,
    });

    return result.text;
  },
});

// JSON.stringify with a graceful fallback for values that don't round-trip
// (cycles, BigInt). Keeps the persisted `input`/`output` columns human-
// readable without blowing up the whole chat turn on edge cases.
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    try {
      return String(value);
    } catch {
      return "";
    }
  }
}
