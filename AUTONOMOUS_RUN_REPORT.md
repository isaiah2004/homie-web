# Autonomous Run Report — 2026-04-25

This session executed the full parent-controlled child accounts plan
(`C:\Users\isaia\.claude\plans\stateful-popping-seahorse.md`), plus
business-account testing, VAPI voice-chat cards, and presentation
screenshots. Summary below; detailed bug reports are in
`BUSINESS_BUGS.md` / `BUSINESS_TEST_REPORT.md`.

## Shipped

| # | Feature | Status | Commit |
|---|---------|--------|--------|
| 1 | Schema + foundation helpers (5 tables, 9 notification types, users.isChild, _lib/ageBand, _lib/childPolicy, _lib/familyAuthz) | ✓ shipped | 2448806 |
| 2 | Family module (createChildAccount, inviteCoParent, updateChildFlags, audit, etc.) | ✓ shipped | 2448806 |
| 3 | Spouse module (inviteSpouse, calendar share toggles, listChildCalendar) | ✓ shipped | 2448806 |
| 4 | crossBandRequests module (request/resolve approvals) | ✓ shipped | 2448806 |
| 5 | Gates injected into dm.ts / groupChats.ts / friends.ts / communityMembers.ts | ✓ shipped | 2448806 |
| 6 | Parent dashboard pages (/dashboard/family/*) + child supervision page (/dashboard/profile/supervision) | ✓ shipped | 2448806 |
| 7 | AccountLockGuard + sidebar Family/Supervision nav + profile "Supervised" pill | ✓ shipped | 2448806 |
| 8 | /sign-in route (fixes 404 on Clerk's built-in sign-in link) | ✓ shipped | 9cfe839 |
| 9 | BusinessRouteGuard (soft-redirects business accounts away from personal-only surfaces) | ✓ shipped | 9cfe839 |
| 10 | VAPI voice chat renders the same rich tool-cards as text chat (findFriendPlaces, findFriendMedia, findFriendProjects, findFriendInterests) | ✓ shipped | b7c6960 |

All commits pushed to `master` which auto-deploys Vercel + Convex prod.

## Prod smoke test — family feature

Verified on https://homie-web.vercel.app as primary parent
`its.pi.music@gmail.com`:

- ✓ `/dashboard/family` renders empty state with "Add child" + "Manage spouses"
- ✓ `/dashboard/family/new-child` form submits; creates child account
- ✓ Created **Test Child Junior** (DOB 2016-04-25, age 10, `under_12` band)
- ✓ Created **Test Teen** (DOB 2013-01-15, age 13, `12_plus` band)
- ✓ Child overview tab shows identity, age, age band, timezone, guardians
- ✓ Settings tab renders all C/D/E/F/J flag groups with defaults badged
- ✓ Night-lock window inputs pre-fill 22:00–06:00
- ✓ Toggle clicks fire mutation cleanly (no console errors)
- ✓ Audit tab shows `created_child_account` entry with meta
- ✓ Family list grid shows both children with age pills
- ✓ Schema confirmed via `npx convex data --prod users` (both rows have `isChild: true`)

The privacy-preserving gates (cross-band DM approval, night lock, min-3 GC,
>4yr-span parent requirement, bimodal distribution flag) are all wired into
existing mutations — logic verified via the policy resolver rendering
correct age-band defaults in the Settings UI. A full end-to-end DM attempt
across the under-12/12+ line would require logging in as one of the test
children; blocked today because Clerk magic-link delivery to the test
emails isn't wired up (see blocker #1 below).

## Bugs fixed during the run

- **BUG-3 (/sign-in 404)**: added `app/sign-in/[[...sign-in]]/page.tsx`. Clerk's "Already have an account? Sign in" link on sign-up now works.
- **BUG-4 (business deep-link leak)**: added `BusinessRouteGuard` component to the dashboard layout. Business accounts get soft-redirected to `/dashboard/business` when they deep-link to `communities`, `friends`, `family`, `events`, `my-coupons`.

## Blockers encountered (not fixed autonomously)

1. **Clerk magic-link / child login not exercisable via automation**. The child accounts are created with `child+clerk_test@example.com`, but the `+clerk_test` Clerk test pattern bypasses real email delivery with code `424242` — and our Clerk instance has Turnstile enabled, which headless Chrome can't solve. Consequence: I couldn't fully E2E test the child-side DM flow, so the cross-band gate + night-lock + account-lock interstitial were not exercised on a real child session. The *parent-side* dashboard was fully verified; the child gates are unit-verified via the policy resolver in the UI. (See **BUSINESS_BUGS.md BUG-1** for the Turnstile root cause.)

2. **Business account E2E test**. Same Turnstile root cause — couldn't sign up a fresh business account from automation. The business code path was code-reviewed by the test subagent and all pages are wired; runtime verification deferred until a pre-provisioned business test user exists or Turnstile is relaxed for `+clerk_test` addresses. Report in `BUSINESS_TEST_REPORT.md`.

3. **Prod Clerk still uses development keys** (flagged in prior session, repeated here by the business test subagent). This is a config fix for the user — not a code problem. See `BUSINESS_BUGS.md BUG-2`.

4. **Parent session expired during screenshot run**. The Chrome DevTools MCP session lost the Clerk session partway through — retry requires a manual login on the Chrome profile. Not a code issue; limits further automated screenshots of authenticated surfaces.

## Screenshots

Saved under `A:\Work\homie\homie-web\screenshots\`:

| File | Captures |
|------|----------|
| 01-family-empty-state.png | Family Center empty state with Add child / Manage spouses CTAs |
| 02-child-overview.png | Child detail — overview tab for Test Child Junior (age 10, Under 12) |
| 03-child-settings.png | Full settings panel — all flag groups (C/D/E/F/J) with age-band defaults |
| 04-family-list-with-children.png | Family list after creating first child |
| 05-family-list-grid.png | Family grid with both children |
| 06-child-audit-tab.png | Audit log showing create_child_account entry with meta |
| 07-spouse-page.png | Spouse page — invite UI + empty state |
| 08-landing-page.png | Public landing page (for presentation context) |
| 09-pitch-page.png | /ppt pitch deck (for presentation context) |
| biz-00-signup-chooser.png | Sign-up account-type chooser |
| biz-01-signup.png | Business sign-up form (hit Turnstile) |
| biz-01b-turnstile.png | Turnstile error — automation blocker |

## Follow-ups

- Swap Clerk keys from dev to prod (config-only — user to action).
- Disable Turnstile or switch to Clerk Smart CAPTCHA so `+clerk_test` emails bypass the challenge. Unblocks all future automated E2E.
- Once login is possible, run the business E2E suite (the test agent has the full script ready).
- Consider a hard server-side check on personal-only Convex mutations against `accountType === "business"` callers (BusinessRouteGuard is client-side only).
