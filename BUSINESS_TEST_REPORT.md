# Business Account E2E Test Report

**Target:** https://homie-web.vercel.app (prod)
**Date:** 2026-04-25
**Browser:** Chrome DevTools MCP (headless)
**Attempted test user:** `homiebiztest+clerk_test@example.com` (and several variants)

## Summary

**Run halted at step 1 (Sign-up).** The Clerk development instance at `blessed-skink-11.clerk.accounts.dev` enforces a **mandatory Cloudflare Turnstile** challenge on every sign-up attempt, and headless Chrome fails the challenge with error `600010`. Direct Frontend API calls (`Clerk.client.signUp.create` and `POST /v1/client/sign_ups`) are rejected with `captcha_missing_token`. Clerk test emails (`+clerk_test@example.com`) do **not** bypass this instance's Turnstile setting.

Since no existing business test account was provisioned on the Clerk instance (probed `bizowner+clerk_test@example.com` → "Couldn't find your account"), and the only available signed-in account is `its.pi.music@gmail.com` (personal; password unknown, email-code requires real inbox access), I could not authenticate as a business user.

Two additional bugs were discovered while investigating, plus one code-review finding on personal-surface gating — see `BUSINESS_BUGS.md`.

## Feature-by-feature result

| Step | Feature                            | Status | Notes |
|------|-------------------------------------|:------:|-------|
| 1    | Sign up as Business (`/sign-up/business`) | ✗ | Blocked by Cloudflare Turnstile 600010 (BUG-1). Form renders; submission hangs. |
| 2    | Onboard business (`/dashboard/businesses/new`) | – | Not reached. Code review: form exists, fields (name, category, description, website, location, logo, cover) match spec. |
| 3    | Profile `/dashboard/profile` (bio + services + branch) | – | Not reached. |
| 4    | Org chat `/dashboard/businesses/[id]/chat` | – | Not reached. Code path verified: `listChannels` / `listMembers` gated on `getBusinessForViewer.myRole`. |
| 5    | Ads (`/dashboard/businesses/[id]/ads` + `/new`) | – | Not reached. Zod form schema verified (title, subtitle, caption, CTA, budget, coupon). |
| 6    | Invite member (`homiestaff+clerk_test@example.com`) | – | Not reached. |
| 7    | Hidden personal surfaces for business account | ⚠ | Static-only: sidebar hides them (`app-sidebar.tsx:171-189`) but the routes themselves do not redirect — see BUG-4. |
| Bonus | `/sign-in` 404 | ✗ | Route missing on app domain (BUG-3). |
| Bonus | Prod on Clerk **development** keys | ✗ | Clerk warns in console; 100-user / 7-day limits apply (BUG-2). |

## Screenshots captured

- `screenshots/biz-00-signup-chooser.png` — `/sign-up` (Individual vs Business chooser)
- `screenshots/biz-01-signup.png` — `/sign-up/business` initial Clerk form
- `screenshots/biz-01b-turnstile.png` — Turnstile blocker after form submit

No later-step screenshots produced — the flow halted at sign-up.

## Bugs (see BUSINESS_BUGS.md for details)

- **BUG-1 (High):** Turnstile on Clerk sign-up unsolvable in automated browsers; blocks E2E and likely some real users.
- **BUG-2 (Medium):** Production deployment uses Clerk dev keys.
- **BUG-3 (Medium):** `/sign-in` 404 on `homie-web.vercel.app` — Clerk SignUp's "Sign in" link is broken.
- **BUG-4 (Low):** Business accounts can deep-link into `/dashboard/communities`, `/dashboard/friends`, `/dashboard/family` even though the sidebar hides them.

## Recommendations to unblock this test

1. Turn off Turnstile for the Clerk dev instance in Clerk Dashboard → Attack protection → Bot protection, OR
2. Pre-provision a business test user (and a manager/employee) in the dev Clerk instance, share the password, and add them to the test plan so automation can sign **in** (which does not require CAPTCHA).

Once authenticated, the remaining steps should proceed — the underlying UI and Convex functions look well-structured per static review.
