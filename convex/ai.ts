"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs } from "ai";
import type { Doc, Id } from "./_generated/dataModel";
import { buildAgentTools } from "./agentTools";

// NOTE: Per project rules, this file is the ONLY convex module modified for
// the business-variant AI work. Business-specific prompt enrichment (business
// name / category / tagline / address) is therefore sourced from the asker's
// users row plus whatever already-public query we can call without adding a
// new internal function. Currently we only read the `users` row (via the
// existing `internal.users.getUserById` helper) and fall back to generic
// placeholders when no business-specific signal is available.

const CHAT_MODEL = "gemini-2.5-flash";

// System prompt for personal-account users. This is the classic Homie voice —
// a friendly, opinionated guide to the asker's friend graph. The friend-graph
// tools (findFriendPlaces, etc.) are wired via `buildAgentTools(ctx, askerId)`.
const PERSONAL_SYSTEM_PROMPT = [
  "You are Homie — a friendly, concise assistant the user chats with about their friends, what they like, and where they go.",
  "You have four tools that search the asker's friend graph by embedding similarity:",
  "  • findFriendPlaces — restaurants, cafes, bars, parks, gyms, etc.",
  "  • findFriendMedia  — movies, games, books, anime, music, etc.",
  "  • findFriendProjects — what friends are building.",
  "  • findFriendInterests — free-text interest tags.",
  "When the user asks for a recommendation, opinion, or 'what do my friends like / where do they go', ALWAYS call the matching tool first — never make up names. If they mention a location or address, pass it verbatim into the tool's `query`.",
  "After calling tools, summarize results naturally. Mention who recommended each item (use the `recommendedBy` / `ownerName` field). If the tool returns an empty list, say so plainly and suggest the asker add more friends or that their friends add the relevant items to their profile.",
  "Keep replies under 200 words unless the asker asked for a long list.",
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
    apiKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const googleKey = args.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!googleKey) {
      throw new Error(
        "GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set and no apiKey argument provided",
      );
    }

    const conversation: Doc<"conversations"> | null = await ctx.runQuery(
      api.conversations.getConversation,
      { conversationId: args.conversationId },
    );
    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`);
    }
    const askerId = conversation.userId;

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

    const google = createGoogleGenerativeAI({ apiKey: googleKey });

    // Personal accounts get the friend-graph search tools. Business accounts
    // don't — there's no business-side "friends" concept, and the personal
    // tools would surface data the business owner isn't entitled to see via
    // this channel. Business replies are pure text strategy for now.
    const tools =
      accountType === "business"
        ? undefined
        : buildAgentTools(ctx, askerId);

    const { text } = await generateText({
      model: google(CHAT_MODEL),
      system: systemPrompt,
      messages: chatHistory,
      tools,
      stopWhen: stepCountIs(5),
      temperature: 0.7,
    });

    await ctx.runMutation(api.conversationMessages.createMessage, {
      conversationId: args.conversationId,
      role: "assistant",
      content: text,
    });

    return text;
  },
});
