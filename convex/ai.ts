"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs } from "ai";
import type { Doc } from "./_generated/dataModel";
import { buildAgentTools } from "./agentTools";

const CHAT_MODEL = "gemini-3.1-flash-lite";

const SYSTEM_PROMPT = [
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

    const messages = await ctx.runQuery(api.conversationMessages.getMessages, {
      conversationId: args.conversationId,
    });

    const chatHistory = messages.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content || "",
    }));
    chatHistory.push({ role: "user", content: args.userMessage });

    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    const { text } = await generateText({
      model: google(CHAT_MODEL),
      system: SYSTEM_PROMPT,
      messages: chatHistory,
      tools: buildAgentTools(ctx, askerId),
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
