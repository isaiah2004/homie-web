# Business Flow – Bugs Found

## BUG-1 (Blocker): Cloudflare Turnstile on Clerk sign-up is unsolvable in automated browsers

**Severity:** High (blocks E2E automation; also a concern for real users behind strict browsers / privacy extensions)

**Where:** `/sign-up/business` and `/sign-up/personal` – rendered via Clerk's hosted `<SignUp>` component. Clerk instance `blessed-skink-11.clerk.accounts.dev` (development keys) enforces Cloudflare Turnstile **on every sign-up submission**, including for `+clerk_test@example.com` emails.

**Observed:** Submitting the form triggers Cloudflare Turnstile error `600010` in headless Chrome. The captcha frame loads but renders `The CAPTCHA failed to load. This may be due to an unsupported browser or a browser extension.` Retrying flips it back into a "Verify you are human" checkbox that also never resolves. The Clerk `/v1/client/sign_ups` endpoint rejects calls with `code: captcha_missing_token`. Setting `captchaToken: ""` / `captchaWidgetType: null` on `Clerk.client.signUp.create(...)` also fails.

**Impact:**
- Cannot sign up a new business account in automated tests.
- Likely blocks any headless E2E or synthetic monitoring for the auth flow.
- Real users on stricter browsers / privacy plugins will also be blocked.

**Suggested fix (one of):**
1. In the Clerk Dashboard → User & Authentication → Attack protection → Bot protection, **disable Turnstile for the development instance**, or switch to Invisible mode, or allowlist `+clerk_test@example.com`.
2. Move to Clerk **Smart CAPTCHA**, which bypasses the challenge for `+clerk_test@example.com` test emails per Clerk docs.
3. Configure `captcha_bypass=true` for test keys via Clerk Testing Tokens.

## BUG-2 (Related config smell): Production deployment uses Clerk **development** keys

**Severity:** Medium – already surfaced in the console: `Clerk: Clerk has been loaded with development keys. Development instances have strict usage limits and should not be used when deploying your application to production.`

**Where:** `homie-web.vercel.app` loads `clerk.browser.js` from `blessed-skink-11.clerk.accounts.dev` and the sign-in page's subtitle says `Development mode`.

**Impact:** 100-user + 7-day session cap, lower rate limits, sessions may be pruned. Production users will hit silent breakage over time.

**Fix:** Swap the prod Vercel env `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to the production instance keys, and re-deploy.

## BUG-3: `/sign-in` returns 404 on the app domain

**Severity:** Medium

**Where:** `https://homie-web.vercel.app/sign-in` → Next.js 404. Users who manually type the URL, have a bookmark, or come from the footer "Sign in" link fall off a cliff.

**Evidence:** `app/sign-up/` exists but there is no `app/sign-in/` directory. Clerk's `<SignUp>` points to `signInUrl="/sign-in"` — so the "Already have an account? Sign in" link in the sign-up embed also 404s on `/sign-up/business` and `/sign-up/personal`.

**Fix:** Add `app/sign-in/[[...sign-in]]/page.tsx` rendering `<SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />`, or point `signInUrl` to the external `accounts.dev` host.

## BUG-4 (Soft): Business accounts can still directly navigate to personal surfaces

**Severity:** Low – UX polish

**Where:** `app/dashboard/communities/page.tsx`, `app/dashboard/friends/page.tsx`, `app/dashboard/family/*`.

**Observed (via static review):** The sidebar correctly hides these entries for `accountType === "business"` (see `components/app-sidebar.tsx:171-189`), but the pages themselves do **not** check `accountType`. A business account landing there via deep-link / bookmark / notification will see the full personal UI (Friends table, Communities discovery, Family tree) which is off-brand and potentially confusing.

**Fix:** Match the `/dashboard/business` soft-guard pattern — a client-side `useEffect` that `router.replace("/dashboard/business")` when `accountType === "business"`, or render an `"unavailable for business accounts"` empty state.

---

## Coverage note

All of the test plan's active steps (onboard business, profile edits, org chat, ads, members invite, hidden-surface verification) require an authenticated business account. BUG-1 prevents creating one in an automated browser. No existing business-account test user is registered on the dev Clerk instance (I probed `bizowner+clerk_test@example.com` → "Couldn't find your account."). The only signed-in account available was `its.pi.music@gmail.com` (personal, password not supplied), and the `"Use another method" → Email code` path requires access to that real inbox.
