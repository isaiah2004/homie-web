#!/usr/bin/env node

// Build entry point for Vercel.
//
// - If CONVEX_DEPLOY_KEY is set (recommended for production):
//     `npx convex deploy --cmd 'next build'` — pushes the latest Convex
//     functions + schema AND runs the Next.js build with the freshly-
//     regenerated types. Recommended long-term setup; requires a prod
//     deploy key from the Convex dashboard.
// - Otherwise:
//     `next build` alone, relying on the committed
//     `convex/_generated/` directory for types. Works out of the box
//     but the deployed Convex functions can drift from the Next.js
//     client if nobody runs `npx convex deploy` manually.
//
// Locally (`npm run build`) this just falls through to `next build`
// because CONVEX_DEPLOY_KEY is not set.

import { spawn } from "node:child_process"

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: true })
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)),
    )
    child.on("error", reject)
  })
}

const hasDeployKey = !!process.env.CONVEX_DEPLOY_KEY

if (hasDeployKey) {
  console.log(
    "[build] CONVEX_DEPLOY_KEY detected — running `convex deploy --cmd 'next build'`.",
  )
  await run("npx", ["convex", "deploy", "--cmd", "next build"])
} else {
  console.log(
    "[build] CONVEX_DEPLOY_KEY not set — running `next build` with committed convex/_generated types. " +
      "Set CONVEX_DEPLOY_KEY on Vercel to also auto-deploy Convex on every build.",
  )
  await run("npx", ["next", "build"])
}
