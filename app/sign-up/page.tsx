"use client"

import Link from "next/link"
import { Building2Icon, UserRoundIcon } from "lucide-react"

// /sign-up — account-type chooser. Clerk-hosted sign-up lives at the two
// variant routes (/sign-up/personal and /sign-up/business); this page just
// branches the user into one of them. Both variants differ only in
// `afterSignUpUrl` and the `unsafeMetadata.accountType` Clerk stores on the
// new user — see each variant's page.tsx for the exact props.
//
// Rendered on the public side (no ClerkProvider dependency) — safe to serve
// pre-auth. Uses plain Links rather than Clerk's <SignUpButton> because the
// two paths need distinct metadata attached.
export default function Page() {
  return (
    <main className="relative min-h-screen bg-[#0a0910] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-10 px-6 py-16">
        <div className="text-center">
          <div className="font-mono text-[11px] tracking-[0.3em] text-white/60 uppercase">
            welcome
          </div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            How will you use Homie?
          </h1>
          <p className="mt-4 max-w-xl text-sm text-white/70 sm:text-base">
            Pick the track that fits you. You can always join businesses or
            communities later regardless of which you choose today.
          </p>
        </div>

        <div className="grid w-full gap-4 sm:grid-cols-2">
          <AccountCard
            href="/sign-up/personal"
            icon={<UserRoundIcon className="size-6" />}
            title="I'm an individual"
            blurb="Chat with friends, discover communities, share what you love, and get recommendations from your people."
            cta="Create a personal account"
            accent="from-fuchsia-500 via-violet-500 to-indigo-500"
          />
          <AccountCard
            href="/sign-up/business"
            icon={<Building2Icon className="size-6" />}
            title="I run a business"
            blurb="Reach local customers, run ads, coordinate your team, and get growth advice tailored to your category."
            cta="Create a business account"
            accent="from-amber-500 via-orange-500 to-rose-500"
          />
        </div>

        <p className="text-xs text-white/50">
          Already have an account?{" "}
          <Link href="/" className="text-white underline">
            Go back home
          </Link>
        </p>
      </div>
    </main>
  )
}

function AccountCard({
  href,
  icon,
  title,
  blurb,
  cta,
  accent,
}: {
  href: string
  icon: React.ReactNode
  title: string
  blurb: string
  cta: string
  accent: string
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm transition hover:border-white/25 hover:bg-white/[0.08]"
    >
      <div
        className={`inline-flex size-12 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white`}
      >
        {icon}
      </div>
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-white/70">{blurb}</p>
      </div>
      <div className="mt-auto inline-flex items-center gap-2 text-sm font-medium text-white">
        {cta}
        <span className="inline-block transition group-hover:translate-x-0.5">
          →
        </span>
      </div>
    </Link>
  )
}
