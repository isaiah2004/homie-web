## profile / AddPlaceFromSearchDialog — infinite render loop on open

**Repro**
1. Sign in, go to `/dashboard/profile`.
2. Scroll to **Favorite Places**, expand the accordion.
3. Click **Search for a place**.

**Expected** (test plan §4 step 3)
Dialog opens with title "Find a Place" and focused input.

**Actual**
Dialog never becomes interactive. React throws
`Maximum update depth exceeded` and the page is replaced by the Next.js
runtime-error overlay ("Application error: a client-side exception has
occurred while loading localhost"). Screenshot:
`docs/bug-search-place-infinite-loop.png`.

**Root cause**
`hooks/use-identified.ts:20` — `useIdentifiedAction` returns a fresh arrow
function on every render (not wrapped in `useCallback`).

`components/app-ui/AddPlaceFromSearchDialog.tsx:88-132` — the debounced
effect lists `search` in its dependency array, so it re-runs every render.
Its empty-input branch calls `setState({ kind: "idle" })` with a brand-new
object literal, which fails React's `Object.is` bailout and forces a
re-render. Next render produces a new `search` ref → effect runs again →
setState again → loop until React aborts.

The guard `if (!open) return` keeps the loop dormant while the dialog is
closed; it kicks in the instant `open` flips to true.

**Suggested fix (preferred — fixes all future consumers too)**
Memoize the invoker inside `useIdentifiedAction` / `useIdentifiedMutation`:

```ts
// hooks/use-identified.ts
import { useCallback } from "react"
// ...
const run = useAction(ref)
const { devUserId, isDevMode } = useActiveUser()
return useCallback(
  (args: FunctionArgs<Ref>) => {
    const merged =
      isDevMode && devUserId
        ? ({ ...args, devUserId } as FunctionArgs<Ref>)
        : args
    return run(merged)
  },
  [run, devUserId, isDevMode],
)
```

`useAction` / `useMutation` already return stable references per Convex
React, so the inner memo will only change identity when dev-mode state
flips — which is what we want.

**Optional secondary hardening** in `AddPlaceFromSearchDialog.tsx:92`:

```ts
if (!trimmed) {
  setState((prev) => (prev.kind === "idle" ? prev : { kind: "idle" }))
  return
}
```

Not strictly necessary once `search` is stable, but makes the effect
idempotent if a future dep becomes unstable.

**Severity**
- [x] Blocker — page crash, blocks the entire new profile places-search flow (test plan §4 end-to-end).

**Env**
- Branch: `master` @ `35a4eb0` (merge of `vk/tool-calls-rich-ui`)
- Convex deployment: dev (local `npx convex dev`)
- User: test user (`its.pi.music@gmail.com`, `@isaiah2004`)
- Browser: Chrome (via chrome-devtools-mcp), Next.js 16.1.7 Turbopack
