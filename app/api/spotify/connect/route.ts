import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// Entry point for "Connect Spotify" clicks.
//
// Flow:
//   1. Verify caller is signed in (Clerk in prod; devUserId query param in dev).
//   2. Generate a random `state` token, set it in an HttpOnly cookie so the
//      callback can verify the Spotify response wasn't forged.
//   3. Ask Convex for the Spotify authorize URL (Convex knows the client id
//      and redirect URI).
//   4. Redirect the browser to Spotify.
//
// We deliberately do NOT trust the URL query `devUserId` on the callback —
// we persist it in a second cookie at this step so it survives the round-
// trip without being observable/modifiable in the Spotify authorize URL.

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true";
const STATE_COOKIE = "spotify_oauth_state";
const DEV_USER_COOKIE = "spotify_oauth_dev_user";
const STATE_TTL_SECONDS = 10 * 60;

function generateState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getConvex(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set.");
  }
  return new ConvexHttpClient(url);
}

export async function GET(req: NextRequest) {
  let devUserId: Id<"users"> | undefined;
  const convex = getConvex();

  if (isDevMode) {
    const q = req.nextUrl.searchParams.get("devUserId");
    if (!q) {
      return NextResponse.json(
        { error: "devUserId query param required in dev mode" },
        { status: 400 },
      );
    }
    devUserId = q as Id<"users">;
  } else {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId, getToken } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = await getToken({ template: "convex" });
    if (!token) {
      return NextResponse.json(
        { error: "Failed to fetch Convex token" },
        { status: 500 },
      );
    }
    convex.setAuth(token);
  }

  const state = generateState();

  let authUrl: string;
  try {
    authUrl = await convex.action(api.spotifyOAuth.getAuthUrl, {
      state,
      devUserId,
    });
  } catch (e) {
    console.error("Failed to build Spotify auth URL", e);
    return NextResponse.json(
      { error: "Failed to start Spotify connect" },
      { status: 500 },
    );
  }

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: !isDevMode,
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });
  if (devUserId) {
    res.cookies.set(DEV_USER_COOKIE, devUserId, {
      httpOnly: true,
      sameSite: "lax",
      secure: !isDevMode,
      path: "/",
      maxAge: STATE_TTL_SECONDS,
    });
  }
  return res;
}
