"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateText, generateObject, stepCountIs, type LanguageModel } from "ai";
import { z } from "zod";
import type { Id } from "./_generated/dataModel";
import { buildAgentTools } from "./agentTools";
import { resolveLlm } from "./_lib/llmProvider";

type SkillName = "findHangout" | "pickMovie" | "scheduleEvent" | "general";

type MemberProfile = {
  userId: Id<"users">;
  name: string;
  location: string | null;
  interests: string[];
  places: Array<{
    name: string;
    type: string;
    address: string | null;
    tags: string[];
  }>;
  media: Array<{ title: string; type: string; subtitle: string | null }>;
  isSelf: boolean;
};

type ExtractedEvent = {
  hasEnoughInfo: boolean;
  date?: string;
  time?: string;
  place?: string;
  title?: string;
  description?: string;
  missing: string[];
};

// Try to combine a `date` (YYYY-MM-DD or similar) and `time` (HH:MM or
// 7pm/19:30) into an epoch-ms. Returns null if either is missing or we
// can't parse a real Date out of the pair.
function tryParseStartsAt(
  date: string | undefined,
  time: string | undefined,
): number | null {
  if (!date || !time) return null;
  // Normalize common time formats: "7pm" -> "19:00", "7:30 pm" -> "19:30".
  const trimmed = time.trim().toLowerCase();
  let hh = 0;
  let mm = 0;
  let hasMeridian = false;
  let pm = false;
  const meridian = /(am|pm)$/.exec(trimmed);
  if (meridian) {
    hasMeridian = true;
    pm = meridian[1] === "pm";
  }
  const stripped = trimmed.replace(/\s*(am|pm)$/, "").trim();
  const colonMatch = /^(\d{1,2}):(\d{2})$/.exec(stripped);
  const hourOnly = /^(\d{1,2})$/.exec(stripped);
  if (colonMatch) {
    hh = parseInt(colonMatch[1], 10);
    mm = parseInt(colonMatch[2], 10);
  } else if (hourOnly) {
    hh = parseInt(hourOnly[1], 10);
    mm = 0;
  } else {
    return null;
  }
  if (hasMeridian) {
    if (pm && hh < 12) hh += 12;
    if (!pm && hh === 12) hh = 0;
  }
  const iso = `${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(
    2,
    "0",
  )}:00`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime();
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill handlers
// ─────────────────────────────────────────────────────────────────────────────

async function runFindHangout(
  members: MemberProfile[],
  query: string,
  model: LanguageModel,
): Promise<{ content: string }> {
  const memberSnippets = members
    .map((m) => {
      const places = m.places
        .slice(0, 8)
        .map(
          (p) =>
            `${p.name} (${p.type}${p.address ? ` — ${p.address}` : ""})`,
        )
        .join(", ");
      const interests = m.interests.slice(0, 8).join(", ");
      return [
        `• ${m.name}${m.isSelf ? " (asker)" : ""}`,
        m.location ? `  Location: ${m.location}` : null,
        interests ? `  Interests: ${interests}` : null,
        places ? `  Saved places: ${places}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const system = [
    "You are Homie, a hangout planner for a group chat.",
    "You are given each member's location, interests, and saved places.",
    "Suggest EXACTLY 3 places that would work for the whole group, and for each one explain why it fits (cite names and interests).",
    "Prefer places that appear in multiple members' saved lists, or match multiple interests, or are centrally located.",
    "Format the response as markdown with a short intro and a numbered list. Each item should have the place name bolded and a 1–2 sentence per-person fit summary.",
    "If a critical data point is missing (e.g. nobody has saved places), say so briefly and suggest that members add places to their profiles.",
  ].join("\n");

  const prompt = [
    `Group request: ${query || "Where should we hang out?"}`,
    "",
    "Members:",
    memberSnippets || "(no members — unusual)",
  ].join("\n");

  const { text } = await generateText({
    model,
    system,
    prompt,
    temperature: 0.7,
  });
  return { content: text };
}

async function runPickMovie(
  members: MemberProfile[],
  query: string,
  model: LanguageModel,
): Promise<{ content: string }> {
  const memberSnippets = members
    .map((m) => {
      const watchable = m.media
        .filter(
          (md) =>
            md.type === "movie" ||
            md.type === "series" ||
            md.type === "anime",
        )
        .slice(0, 12)
        .map((md) => `${md.title} (${md.type})`)
        .join(", ");
      const interests = m.interests.slice(0, 8).join(", ");
      return [
        `• ${m.name}${m.isSelf ? " (asker)" : ""}`,
        interests ? `  Interests: ${interests}` : null,
        watchable ? `  Watch list: ${watchable}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const system = [
    "You are Homie, a movie-night curator for a group chat.",
    "Suggest 3 to 5 titles (movies, series, or anime) this group will enjoy together.",
    "Bias toward overlap between members' watch lists and interests. Explain per-person fit in 1 sentence each.",
    "Format as markdown: a short intro and a numbered list. Bold each title. Include the type (movie/series/anime) parenthetically.",
    "If the group's watch lists are empty, hedge and suggest broadly-loved titles that match their interests instead.",
  ].join("\n");

  const prompt = [
    `Group request: ${query || "What should we watch?"}`,
    "",
    "Members:",
    memberSnippets || "(no members)",
  ].join("\n");

  const { text } = await generateText({
    model,
    system,
    prompt,
    temperature: 0.7,
  });
  return { content: text };
}

async function runScheduleEvent(
  ctx: ActionCtx,
  groupChatId: Id<"groupChats">,
  askerId: Id<"users">,
  query: string,
  model: LanguageModel,
): Promise<{ content: string; toolResults?: string }> {
  const recent: Array<{
    fromName: string;
    plainText: string;
    sentAt: number;
  }> = await ctx.runQuery(
    internal.groupChatMessages.lastMessagesInternal,
    { groupChatId, limit: 5 },
  );

  const transcript = recent
    .map(
      (m) => `${m.fromName}: ${m.plainText.trim().slice(0, 400)}`,
    )
    .join("\n");

  const extractionSchema = z.object({
    hasEnoughInfo: z.boolean(),
    date: z.string().optional(),
    time: z.string().optional(),
    place: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    missing: z.array(z.string()),
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const { object: extracted } = await generateObject({
    model,
    schema: extractionSchema,
    system: [
      "You are an event-extraction assistant. Given a short chat transcript and an optional user prompt, determine if there is enough info to schedule an event.",
      "Required fields: date, time, place, and a title. If any are missing, set hasEnoughInfo = false and list the missing fields in `missing`.",
      `Today's date is ${todayStr}. Resolve relative dates like "tomorrow" or "this Saturday" to YYYY-MM-DD.`,
      "Time should be 24h HH:MM when possible, else keep the phrase the user wrote (e.g. '7pm').",
      "Do not invent specifics — if the transcript only hints at a plan, prefer hasEnoughInfo = false.",
    ].join("\n"),
    prompt: [
      query ? `User prompt: ${query}` : "(no explicit prompt)",
      "",
      "Recent messages:",
      transcript || "(no recent messages)",
    ].join("\n"),
    temperature: 0.3,
  });

  const parsed = extracted as ExtractedEvent;
  const toolResults = JSON.stringify(parsed);

  const startsAt = parsed.hasEnoughInfo
    ? tryParseStartsAt(parsed.date, parsed.time)
    : null;

  if (parsed.hasEnoughInfo && startsAt !== null) {
    const eventName = (parsed.title || "Group hangout").slice(0, 120);
    const description = parsed.description;
    const locationName = parsed.place;
    const eventId: Id<"events"> = await ctx.runMutation(
      internal.events.createEventInternal,
      {
        creatorId: askerId,
        name: eventName,
        description,
        startsAt,
        locationName,
        visibility: "invitees",
        groupChatRef: groupChatId,
      },
    );
    const memberIds: Id<"users">[] = await ctx.runQuery(
      internal.groupChats.listMemberIdsInternal,
      { groupChatId },
    );
    await ctx.runMutation(internal.eventInvites.inviteInternal, {
      eventId,
      inviterId: askerId,
      userIds: memberIds.filter((id) => id !== askerId),
    });

    const content = [
      `Scheduled **${eventName}** for ${parsed.date} at ${parsed.time}${
        locationName ? ` @ ${locationName}` : ""
      }.`,
      "",
      `Everyone in the group has been invited. Tap the card below to RSVP.`,
      "",
      `homie://event/${eventId}`,
    ].join("\n");

    return {
      content,
      toolResults: JSON.stringify({
        ...parsed,
        eventId,
        startsAt,
      }),
    };
  }

  // Not enough info → produce a helpful follow-up question.
  const missingList =
    parsed.missing && parsed.missing.length > 0
      ? parsed.missing.join(", ")
      : "date, time, place";
  const content = [
    "I don't have enough to lock in a plan yet.",
    "",
    `Still missing: **${missingList}**.`,
    "",
    "Reply with those details (e.g. *Friday 7pm at The Commons*) and tag me again to schedule.",
  ].join("\n");
  return { content, toolResults };
}

async function runGeneral(
  ctx: ActionCtx,
  askerId: Id<"users">,
  query: string,
  model: LanguageModel,
): Promise<{ content: string }> {
  const system = [
    "You are Homie — a helpful assistant inside a group chat.",
    "Answer the asker concisely. If they're asking about something related to their friends (places, media, projects, interests), call the appropriate tool.",
    "If you don't have enough info, say so plainly. Keep answers under 200 words unless asked for a list.",
  ].join("\n");

  const { text } = await generateText({
    model,
    system,
    prompt: query,
    tools: buildAgentTools(ctx, askerId),
    stopWhen: stepCountIs(5),
    temperature: 0.7,
  });
  return { content: text };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export const handleGroupAgentRequest = internalAction({
  args: {
    responseId: v.id("groupChatAgentResponses"),
    groupChatId: v.id("groupChats"),
    askerId: v.id("users"),
    query: v.string(),
    replyMode: v.union(v.literal("private"), v.literal("group")),
    llmProvider: v.optional(
      v.union(v.literal("gemini"), v.literal("minimax")),
    ),
    llmApiKey: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { responseId, groupChatId, askerId, query, llmProvider, llmApiKey },
  ): Promise<void> => {
    try {
      const { model } = resolveLlm({
        provider: llmProvider,
        apiKey: llmApiKey,
      });

      // 1. Router: pick a skill using a small structured-output call.
      const routerSchema = z.object({
        skill: z.enum([
          "findHangout",
          "pickMovie",
          "scheduleEvent",
          "general",
        ]),
        rationale: z.string(),
      });
      const { object: routed } = await generateObject({
        model,
        schema: routerSchema,
        system: [
          "You route queries inside a group chat to one of four Homie skills:",
          "- findHangout: recommend real-world places for the group to meet.",
          "- pickMovie: suggest movies/series/anime for the group.",
          "- scheduleEvent: lock in a concrete event from recent chat + user prompt.",
          "- general: any other question or conversational reply.",
          "Answer with the single best fit. Prefer scheduleEvent when the user mentions a specific day, date, or time.",
        ].join("\n"),
        prompt: `Query: ${query}`,
        temperature: 0,
      });

      const skill = routed.skill as SkillName;

      // 2. Dispatch.
      let result: { content: string; toolResults?: string };
      if (skill === "findHangout") {
        const members = (await ctx.runQuery(
          internal.groupChats.getMemberProfilesInternal,
          { groupChatId, askerId },
        )) as MemberProfile[];
        result = await runFindHangout(members, query, model);
      } else if (skill === "pickMovie") {
        const members = (await ctx.runQuery(
          internal.groupChats.getMemberProfilesInternal,
          { groupChatId, askerId },
        )) as MemberProfile[];
        result = await runPickMovie(members, query, model);
      } else if (skill === "scheduleEvent") {
        result = await runScheduleEvent(
          ctx,
          groupChatId,
          askerId,
          query,
          model,
        );
      } else {
        result = await runGeneral(ctx, askerId, query, model);
      }

      await ctx.runMutation(
        internal.groupChatMessages.finalizeGroupAgentResponse,
        {
          responseId,
          status: "ready",
          content: result.content,
          skillUsed: skill,
          toolResults: result.toolResults,
        },
      );
    } catch (err) {
      await ctx.runMutation(
        internal.groupChatMessages.finalizeGroupAgentResponse,
        {
          responseId,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        },
      );
    }
  },
});
