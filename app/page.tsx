"use client"

import Link from "next/link"
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs"

import { Background } from "./ppt/_components/Background"
import { Reveal, RevealWords } from "./ppt/_components/Reveal"
import { BondNetwork } from "./_components/BondNetwork"

const HERO_PALETTE: [string, string, string] = ["#7c3aed", "#ec4899", "#f59e0b"]

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#0a0910] text-white">
      {/* grainy moving gradients */}
      <Background palette={HERO_PALETTE} />

      {/* top nav */}
      <nav className="relative z-30 flex items-center justify-between px-6 py-6 sm:px-12">
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.3em] text-white/60 uppercase">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
          homie
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/ppt"
            className="hidden rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-[11px] tracking-[0.2em] text-white/70 uppercase backdrop-blur transition hover:border-white/30 hover:bg-white/10 sm:inline-block"
          >
            the pitch
          </Link>
          <Show when="signed-out">
            <SignInButton>
              <button className="cursor-pointer rounded-full px-3 py-2 text-sm text-white/75 transition hover:text-white">
                sign in
              </button>
            </SignInButton>
            <SignUpButton>
              <button className="cursor-pointer rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90">
                sign up
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </nav>

      {/* hero */}
      <section className="relative flex min-h-[88vh] items-center justify-center px-6">
        {/* breathing bond network behind copy */}
        <div className="pointer-events-none absolute inset-0 z-0 opacity-80">
          <BondNetwork />
        </div>

        {/* hero copy */}
        <div className="relative z-10 flex max-w-5xl flex-col items-center gap-8 text-center">
          <Reveal
            delay={0.1}
            className="font-mono text-[11px] tracking-[0.4em] text-white/60 uppercase"
          >
            the people you know — known better
          </Reveal>
          <h1 className="text-[min(22vw,220px)] leading-[0.85] font-black tracking-[-0.04em]">
            <RevealWords text="homie." delay={0.25} stagger={0.1} />
          </h1>
          <div
            className="pointer-events-none absolute inset-x-0 top-1/2 -z-10 h-[40vh] -translate-y-1/2 blur-3xl"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(236,72,153,0.28), transparent 60%)",
            }}
          />
          <div className="max-w-2xl text-lg text-white/80 sm:text-xl md:text-2xl">
            <RevealWords
              text="strengthen the bonds you already have."
              delay={0.9}
              stagger={0.07}
            />
          </div>
          <Reveal
            delay={1.6}
            className="max-w-xl text-sm text-white/55 sm:text-base"
          >
            a re-bonding layer for the people already in your life — built on the music,
            films, books and games you actually love.
          </Reveal>
          <Reveal delay={2.0} className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Show when="signed-out">
              <SignUpButton>
                <button className="group cursor-pointer rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-white/90">
                  get your homie
                  <span className="ml-2 inline-block transition group-hover:translate-x-0.5">
                    →
                  </span>
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link
                href="/dashboard"
                className="group cursor-pointer rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-white/90"
              >
                open your dashboard
                <span className="ml-2 inline-block transition group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
            </Show>
            <Link
              href="/ppt"
              className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm text-white/80 backdrop-blur transition hover:border-white/30 hover:bg-white/10"
            >
              watch the pitch
            </Link>
          </Reveal>
          <Reveal delay={2.5} className="mt-6 text-[11px] text-white/40">
            press <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">↓</kbd>{" "}
            to scroll
          </Reveal>
        </div>
      </section>

      {/* idea */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-32 sm:py-40">
        <Reveal className="font-mono text-[11px] tracking-[0.3em] text-white/60 uppercase">
          the idea
        </Reveal>
        <h2 className="mt-6 text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl md:text-7xl">
          <RevealWords
            text="real bonds aren't built on hello."
            delay={0.1}
            className="block text-white"
          />
          <RevealWords
            text="they're built on what you both love."
            delay={0.5}
            className="block text-amber-200/90"
          />
        </h2>
        <Reveal delay={1.2} className="mt-8 max-w-2xl text-lg text-white/75 sm:text-xl">
          The album you both wore out. The book that rewired you. The game you grew up on.
          Homie turns your tastes into a language your friends can read — and quietly
          shows where your worlds overlap.
        </Reveal>
      </section>

      {/* pillars */}
      <section className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 gap-5 px-6 pb-32 sm:grid-cols-3">
        <Pillar
          delay={0.05}
          kicker="01"
          title="depth over reach"
          body="Optimize for one more meaningful hour with your best friend — not a thousand new followers."
        />
        <Pillar
          delay={0.2}
          kicker="02"
          title="taste, not metadata"
          body="Your playlist history is a personality. We let the people who matter read it."
        />
        <Pillar
          delay={0.35}
          kicker="03"
          title="real overlap"
          body="Provider-backed ids — the same Spotify song, the same book isbn — so 'we both love this' is a fact."
        />
      </section>

      {/* how */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-32">
        <Reveal className="font-mono text-[11px] tracking-[0.3em] text-white/60 uppercase">
          how it clicks
        </Reveal>
        <h2 className="mt-6 text-3xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
          <RevealWords text="build a profile out of the things you actually love." delay={0.1} />
        </h2>
        <Reveal delay={0.9} className="mt-8 flex flex-wrap gap-2">
          {[
            ["Spotify", "music"],
            ["OMDb", "films"],
            ["Open Library", "books"],
            ["FreeToGame", "games"],
            ["Jikan", "anime"],
          ].map(([name, kind]) => (
            <span
              key={name}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 backdrop-blur"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-br from-pink-400 to-amber-300" />
              <span className="font-medium">{name}</span>
              <span className="text-white/40">·</span>
              <span className="text-white/55">{kind}</span>
            </span>
          ))}
        </Reveal>
      </section>

      {/* closing CTA */}
      <section className="relative z-10 flex flex-col items-center justify-center px-6 py-40 text-center">
        <Reveal className="font-mono text-[11px] tracking-[0.3em] text-white/60 uppercase">
          bring them home
        </Reveal>
        <h2 className="mt-8 text-[min(16vw,160px)] leading-[1.2] font-black tracking-[-0.03em]">
          <RevealWords text="make friends" delay={0.1} className="block text-white" />
          <RevealWords
            text="again."
            delay={0.55}
            className="block text-amber-200/90"
          />
        </h2>
        <Reveal delay={1.2} className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Show when="signed-out">
            <SignUpButton>
              <button className="group cursor-pointer rounded-full bg-white px-7 py-3.5 text-base font-medium text-black transition hover:bg-white/90">
                start your homie
                <span className="ml-2 inline-block transition group-hover:translate-x-0.5">
                  →
                </span>
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="group cursor-pointer rounded-full bg-white px-7 py-3.5 text-base font-medium text-black transition hover:bg-white/90"
            >
              continue to dashboard
              <span className="ml-2 inline-block transition group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </Show>
        </Reveal>
      </section>

      <footer className="relative z-10 flex flex-col items-center justify-between gap-4 border-t border-white/10 px-6 py-10 text-[11px] text-white/40 sm:flex-row sm:px-12">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-br from-pink-400 to-violet-500" />
          <span className="font-mono tracking-[0.3em] uppercase">homie</span>
        </div>
        <div className="font-mono tracking-[0.2em] uppercase">
          a weekend build that wants to stick around
        </div>
      </footer>
    </main>
  )
}

function Pillar({
  delay,
  kicker,
  title,
  body,
}: {
  delay: number
  kicker: string
  title: string
  body: string
}) {
  return (
    <Reveal
      delay={delay}
      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm"
    >
      <div className="font-mono text-xs text-white/40">{kicker}</div>
      <div className="text-xl font-semibold text-white">{title}</div>
      <div className="text-sm text-white/65">{body}</div>
    </Reveal>
  )
}
