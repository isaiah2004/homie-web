// Creates Clerk test users without triggering Cloudflare Turnstile.
//
// Two strategies, picked via `--via`:
//
//   --via=backend (default)
//     Calls the Clerk Backend API (`POST /v1/users`) directly, authenticated
//     with `CLERK_SECRET_KEY`. The admin endpoint does NOT use Turnstile —
//     it's how Clerk's own Dashboard creates users. Cleanest path for E2E
//     test setup. Sets `unsafe_metadata.accountType` so our Convex bootstrap
//     mirrors the right account type.
//
//   --via=signup
//     Mints a Clerk Testing Token (`POST /v1/testing_tokens`), then drives
//     the public sign-up flow with the token attached as
//     `__clerk_testing_token=<token>`. This exercises the same code path as
//     a real user signing up, just bypassing Turnstile — useful when you
//     want to verify the sign-up flow itself rather than just having a
//     usable user. Tokens are short-lived (≈1 hour).
//
// Reads `CLERK_SECRET_KEY` and `CLERK_FRONTEND_API_URL` from `.env.local`.
//
// Usage:
//   node scripts/clerk-create-test-user.mjs --email biz1+clerk_test@example.com \
//       --password TestPass!234 --type business
//   node scripts/clerk-create-test-user.mjs --email child1+clerk_test@example.com \
//       --password TestPass!234 --type personal --is-child
//   node scripts/clerk-create-test-user.mjs --email biz2+clerk_test@example.com \
//       --password TestPass!234 --type business --via signup
//
// On success prints a JSON line with { id, email, password, accountType }.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "..", ".env.local");

function parseEnv(path) {
  if (!existsSync(path)) {
    throw new Error(`No env file at ${path}`);
  }
  const raw = readFileSync(path, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let value = m[2];
    if (!/^["']/.test(value)) {
      const hashAt = value.search(/\s+#/);
      if (hashAt !== -1) value = value.slice(0, hashAt);
    }
    if (/^"[\s\S]*"$/.test(value) || /^'[\s\S]*'$/.test(value)) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value.trim();
  }
  return out;
}

function parseArgs(argv) {
  const out = { type: "personal", via: "backend", isChild: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email") out.email = argv[++i];
    else if (a === "--password") out.password = argv[++i];
    else if (a === "--name") out.name = argv[++i];
    else if (a === "--username") out.username = argv[++i];
    else if (a === "--type") out.type = argv[++i];
    else if (a === "--via") out.via = argv[++i];
    else if (a === "--is-child") out.isChild = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  return out;
}

function help() {
  console.log(`Usage:
  node scripts/clerk-create-test-user.mjs [flags]

Flags:
  --email     Email address (use a +clerk_test@example.com pattern for test mode)
  --password  Password (min 8 chars, must include letter + number + symbol)
  --name      Display name (defaults derived from email local part)
  --username  Optional username
  --type      personal | business (default: personal)
  --via       backend | signup (default: backend)
  --is-child  Set unsafeMetadata.isChild = true (informational only — Convex
              isChild is set via family.createChildAccount, not Clerk metadata)

Examples:
  node scripts/clerk-create-test-user.mjs --email biz1+clerk_test@example.com \\
       --password TestPass!234 --type business
  node scripts/clerk-create-test-user.mjs --email biz2+clerk_test@example.com \\
       --password TestPass!234 --type business --via signup
`);
}

const env = parseEnv(ENV_PATH);
const args = parseArgs(process.argv);
if (args.help) {
  help();
  process.exit(0);
}
if (!args.email) {
  console.error("Missing --email");
  help();
  process.exit(1);
}
if (!args.password) {
  console.error("Missing --password");
  process.exit(1);
}
if (args.type !== "personal" && args.type !== "business") {
  console.error(`Invalid --type: ${args.type} (must be personal | business)`);
  process.exit(1);
}
if (args.via !== "backend" && args.via !== "signup") {
  console.error(`Invalid --via: ${args.via} (must be backend | signup)`);
  process.exit(1);
}

const SECRET = env.CLERK_SECRET_KEY;
const FRONTEND = (env.CLERK_FRONTEND_API_URL ?? "").replace(/\/+$/, "");
if (!SECRET) {
  console.error("CLERK_SECRET_KEY missing from .env.local");
  process.exit(1);
}
if (args.via === "signup" && !FRONTEND) {
  console.error("CLERK_FRONTEND_API_URL missing from .env.local — required for --via=signup");
  process.exit(1);
}

const BACKEND_BASE = "https://api.clerk.com/v1";

async function backendRequest(method, path, body) {
  const res = await fetch(`${BACKEND_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const detail = json?.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") ?? text;
    throw new Error(`Clerk ${method} ${path} -> ${res.status}: ${detail}`);
  }
  return json;
}

async function frontendRequest(method, path, body, params) {
  const url = new URL(`${FRONTEND}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const detail = json?.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") ?? text;
    throw new Error(`Clerk Frontend ${method} ${path} -> ${res.status}: ${detail}`);
  }
  return json;
}

async function mintTestingToken() {
  // Per https://clerk.com/docs/testing/overview — Backend API endpoint that
  // returns a short-lived testing token.
  const out = await backendRequest("POST", "/testing_tokens", {});
  return out.token;
}

async function createViaBackend() {
  const localPart = args.email.split("@")[0].replace(/\+.*$/, "");
  const name = args.name || localPart;
  const [first, ...rest] = name.split(/\s+/);
  const last = rest.join(" ") || "Test";
  // Many Clerk instances require username — default it from the email local
  // part when not supplied. Strip non-alphanumerics that Clerk usually
  // rejects.
  const username =
    args.username ?? `${localPart.replace(/[^a-z0-9]/gi, "")}${Math.floor(Math.random() * 1000)}`;
  const body = {
    email_address: [args.email],
    password: args.password,
    first_name: first,
    last_name: last,
    username,
    skip_password_checks: false,
    skip_password_requirement: false,
    unsafe_metadata: {
      accountType: args.type,
      ...(args.isChild ? { isChild: true } : {}),
    },
  };
  return await backendRequest("POST", "/users", body);
}

async function createViaSignup() {
  const token = await mintTestingToken();
  const body = {
    email_address: args.email,
    password: args.password,
    unsafe_metadata: {
      accountType: args.type,
      ...(args.isChild ? { isChild: true } : {}),
    },
    ...(args.username ? { username: args.username } : {}),
  };
  // Step 1: create the sign-up
  const signUp = await frontendRequest("POST", "/v1/client/sign_ups", body, {
    __clerk_testing_token: token,
  });
  const signUpId = signUp.response?.id ?? signUp.id;
  if (!signUpId) {
    throw new Error(`No sign_up id in response: ${JSON.stringify(signUp)}`);
  }
  // Step 2: prepare email verification
  await frontendRequest(
    "POST",
    `/v1/client/sign_ups/${signUpId}/prepare_verification`,
    { strategy: "email_code" },
    { __clerk_testing_token: token },
  );
  // Step 3: attempt verification with the universal +clerk_test code
  const verified = await frontendRequest(
    "POST",
    `/v1/client/sign_ups/${signUpId}/attempt_verification`,
    { strategy: "email_code", code: "424242" },
    { __clerk_testing_token: token },
  );
  return verified;
}

(async () => {
  try {
    let user;
    if (args.via === "backend") {
      user = await createViaBackend();
    } else {
      user = await createViaSignup();
    }
    const id = user.id ?? user.response?.id ?? user.created_user_id;
    console.log(JSON.stringify({
      ok: true,
      id,
      email: args.email,
      password: args.password,
      accountType: args.type,
      via: args.via,
      isChild: args.isChild,
    }, null, 2));
  } catch (err) {
    console.error("Failed to create user:", err.message);
    process.exit(1);
  }
})();
