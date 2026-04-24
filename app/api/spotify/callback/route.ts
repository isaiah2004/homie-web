import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// Spotify OAuth redirect landing.
//
// The `state` cookie set by /api/spotify/connect is the CSRF guard: if the
// query-param `state` doesn't match the cookie, someone tried to forge the
// callback and we reject. On success we forward the `code` to Convex which
// does the actual token exchange and stores the per-user connection.

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true";
const STATE_COOKIE = "spotify_oauth_state";
const DEV_USER_COOKIE = "spotify_oauth_dev_user";

function getConvex(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set.");
  }
  return new ConvexHttpClient(url);
}

function redirectWith(
  req: NextRequest,
  params: Record<string, string>,
): NextResponse {
  const dest = new URL("/dashboard/integrations", req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) {
    dest.searchParams.set(k, v);
  }
  const res = NextResponse.redirect(dest);
  // Always clear the one-shot cookies, whether the outcome was success or
  // failure — they are no longer valid for any subsequent request.
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(DEV_USER_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return redirectWith(req, { error });
  }
  if (!code || !state) {
    return redirectWith(req, { error: "missing_params" });
  }

  const stateCookie = req.cookies.get(STATE_COOKIE)?.value;
  if (!stateCookie || stateCookie !== state) {
    return redirectWith(req, { error: "state_mismatch" });
  }

  const devUserCookie = req.cookies.get(DEV_USER_COOKIE)?.value;
  let devUserId: Id<"users"> | undefined;

  const convex = getConvex();
  if (isDevMode) {
    if (!devUserCookie) {
      return redirectWith(req, { error: "dev_user_missing" });
    }
    devUserId = devUserCookie as Id<"users">;
  } else {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId, getToken } = await auth();
    if (!userId) {
      return redirectWith(req, { error: "unauthorized" });
    }
    const token = await getToken({ template: "convex" });
    if (!token) {
      return redirectWith(req, { error: "token_fetch_failed" });
    }
    convex.setAuth(token);
  }

  try {
    await convex.action(api.spotifyOAuth.persistConnection, {
      code,
      devUserId,
    });
  } catch (e) {
    console.error("Spotify persistConnection failed", e);
    return redirectWith(req, { error: "exchange_failed" });
  }

  return redirectWith(req, { connected: "1" });
}
