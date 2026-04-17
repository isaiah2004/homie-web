import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const VALID_TOOLS = new Set([
  "findFriendPlaces",
  "findFriendMedia",
  "findFriendProjects",
  "findFriendInterests",
]);

export async function POST(req: NextRequest) {
  // Verify Vapi Bearer token
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== process.env.VAPI_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const messageType = body.message?.type;

  // Acknowledge non-tool-call events (status-update, end-of-call-report, etc.)
  if (messageType !== "tool-calls") {
    return NextResponse.json({});
  }

  // Extract userId from call metadata (set via assistantOverrides when starting the call)
  const userId: string | undefined =
    body.message?.call?.assistantOverrides?.metadata?.userId ??
    body.message?.call?.metadata?.userId;

  // Normalize tool call list — Vapi sends either `toolCallList` or `toolWithToolCallList`
  const rawCalls: any[] =
    body.message?.toolCallList ??
    body.message?.toolWithToolCallList?.map((t: any) => ({
      id: t.toolCall?.id ?? t.id,
      name: t.function?.name ?? t.name ?? t.toolCall?.function?.name,
      arguments:
        t.function?.arguments ??
        t.arguments ??
        t.toolCall?.function?.arguments ??
        t.toolCall?.parameters ??
        {},
    })) ??
    [];

  if (!userId) {
    return NextResponse.json({
      results: rawCalls.map((tc) => ({
        toolCallId: tc.id,
        result: "Error: no userId in call metadata. Cannot search friends.",
      })),
    });
  }

  const results = await Promise.all(
    rawCalls.map(async (tc) => {
      const toolName = tc.function?.name ?? tc.name;
      const rawArgs = tc.function?.arguments ?? tc.arguments ?? {};
      const args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;

      if (!VALID_TOOLS.has(toolName)) {
        return { toolCallId: tc.id, result: `Unknown tool: ${toolName}` };
      }

      try {
        const hits = await convex.action(
          api.vapiHandler.handleToolCall,
          {
            userId: userId as Id<"users">,
            toolName,
            query: args.query ?? "",
            closeOnly: args.closeOnly,
            limit: args.limit,
            placeType: args.placeType,
            mediaType: args.mediaType,
          },
        );

        return {
          toolCallId: tc.id,
          result: JSON.stringify(hits),
        };
      } catch (err: any) {
        console.error(`Vapi tool ${toolName} failed:`, err);
        return {
          toolCallId: tc.id,
          result: `Search failed: ${err.message}`,
        };
      }
    }),
  );

  return NextResponse.json({ results });
}
