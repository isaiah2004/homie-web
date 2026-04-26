import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "edge-runtime",
    env: {
      // Enable dev-mode identity injection for tests so seeded users can be
      // referenced via `devUserId` without a Clerk JWT.
      CONVEX_DEV_MODE: "true",
    },
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
  },
})
