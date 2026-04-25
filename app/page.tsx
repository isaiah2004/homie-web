"use client"

import Link from "next/link"
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs"

import { SocialLattice } from "./ppt/page"

const P = {
  bg: "#F4EADB",
  elevated: "#FFFFFF",
  primary: "#C8501F",
  secondary: "#8B5E3C",
  text: "#2B1D10",
  muted: "#93826E",
  success: "#4A7043",
} as const

const SERIF = "'Instrument Serif', 'Times New Roman', Georgia, serif"

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"

function DevNavAuth() {
  return (
    <Link
      href="/dashboard"
      className="rounded-full px-4 py-2 text-sm font-medium transition"
      style={{ backgroundColor: P.primary, color: P.bg }}
    >
      open dashboard
    </Link>
  )
}

function DevHeroCta() {
  return (
    <Link
      href="/dashboard"
      className="group rounded-full px-6 py-3 text-sm font-medium transition"
      style={{ backgroundColor: P.primary, color: P.bg }}
    >
      open your dashboard
      <span className="ml-2 inline-block transition group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  )
}

function DevBottomCta() {
  return (
    <Link
      href="/dashboard"
      className="group rounded-full px-7 py-3.5 text-base font-medium transition"
      style={{ backgroundColor: P.primary, color: P.bg }}
    >
      continue to dashboard
      <span className="ml-2 inline-block transition group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  )
}

export default function LandingPage() {
  return (
    <main
      className="relative min-h-screen overflow-x-hidden"
      style={{ backgroundColor: P.bg, color: P.text }}
    >
      <Grain />
      <AmbientGlows />

      {/* top nav */}
      <nav className="relative z-30 flex items-center justify-between px-6 py-6 sm:px-12">
        <div
          className="flex items-center gap-2 font-mono text-[11px] tracking-[0.3em] uppercase"
          style={{ color: P.muted }}
        >
          <span
            className="inline-block h-2 w-2 animate-pulse rounded-full"
            style={{ backgroundColor: P.primary }}
          />
          homie
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/ppt"
            className="hidden rounded-full border px-4 py-2 font-mono text-[11px] tracking-[0.2em] uppercase transition sm:inline-block"
            style={{
              borderColor: `${P.muted}55`,
              color: P.text,
              backgroundColor: `${P.elevated}cc`,
            }}
          >
            the pitch
          </Link>
          {isDevMode ? (
            <DevNavAuth />
          ) : (
            <>
              <Show when="signed-out">
                <SignInButton>
                  <button
                    className="rounded-full px-3 py-2 text-sm transition"
                    style={{ color: P.text }}
                  >
                    sign in
                  </button>
                </SignInButton>
                <SignUpButton>
                  <button
                    className="rounded-full px-4 py-2 text-sm font-medium transition"
                    style={{ backgroundColor: P.primary, color: P.bg }}
                  >
                    sign up
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </>
          )}
        </div>
      </nav>

      {/* hero — text on left, lattice on right */}
      <section className="relative mx-auto grid w-full max-w-7xl items-center gap-8 px-6 py-16 md:min-h-[88vh] md:grid-cols-[1.1fr_1fr] md:gap-12 md:px-12 md:py-0">
        {/* hero copy (left) */}
        <div className="flex flex-col gap-6 text-left">
          <div
            className="font-mono text-[11px] tracking-[0.4em] uppercase"
            style={{ color: P.muted, animation: "fade-up 0.8s 0.1s both" }}
          >
            the people you know — known better
          </div>
          <h1
            style={{
              fontFamily: SERIF,
              fontSize: "clamp(96px, 16vw, 220px)",
              lineHeight: 0.85,
              letterSpacing: "-0.04em",
              color: P.text,
              animation: "fade-up 1s 0.25s both",
            }}
          >
            homie<span style={{ color: P.primary }}>.</span>
          </h1>
          <div
            className="max-w-xl text-lg sm:text-xl md:text-2xl"
            style={{
              color: P.text,
              opacity: 0.85,
              animation: "fade-up 0.8s 0.9s both",
            }}
          >
            strengthen the bonds you{" "}
            <span style={{ color: P.secondary }}>already have.</span>
          </div>
          <div
            className="max-w-md text-sm sm:text-base"
            style={{
              color: P.muted,
              animation: "fade-up 0.8s 1.6s both",
            }}
          >
            a re-bonding layer for the people already in your life — built on the music,
            films, books and games you actually love.
          </div>
          <div
            className="mt-2 flex flex-wrap items-center gap-3"
            style={{ animation: "fade-up 0.8s 2s both" }}
          >
            {isDevMode ? (
              <DevHeroCta />
            ) : (
              <>
                <Show when="signed-out">
                  <SignUpButton>
                    <button
                      className="group rounded-full px-6 py-3 text-sm font-medium transition"
                      style={{ backgroundColor: P.primary, color: P.bg }}
                    >
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
                    className="group rounded-full px-6 py-3 text-sm font-medium transition"
                    style={{ backgroundColor: P.primary, color: P.bg }}
                  >
                    open your dashboard
                    <span className="ml-2 inline-block transition group-hover:translate-x-0.5">
                      →
                    </span>
                  </Link>
                </Show>
              </>
            )}
            <Link
              href="/ppt"
              className="rounded-full border px-6 py-3 text-sm transition"
              style={{
                borderColor: `${P.muted}55`,
                color: P.text,
                backgroundColor: `${P.elevated}cc`,
              }}
            >
              watch the pitch
            </Link>
          </div>
          <div
            className="mt-2 text-[11px]"
            style={{
              color: P.muted,
              animation: "fade-up 0.8s 2.5s both",
            }}
          >
            press{" "}
            <kbd
              className="rounded px-1.5 py-0.5 font-mono"
              style={{ backgroundColor: `${P.muted}22` }}
            >
              ↓
            </kbd>{" "}
            to scroll
          </div>
        </div>

        {/* lattice (right) */}
        <div
          className="relative h-[420px] w-full md:h-[600px]"
          style={{ animation: "fade-up 1.2s 0.4s both" }}
        >
          <SocialLattice mode="stable" />
        </div>
      </section>

      {/* idea */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-32 sm:py-40">
        <div
          className="font-mono text-[11px] tracking-[0.3em] uppercase"
          style={{ color: P.muted }}
        >
          the idea
        </div>
        <h2
          className="mt-6"
          style={{
            fontFamily: SERIF,
            fontSize: "clamp(40px, 7vw, 96px)",
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            color: P.text,
          }}
        >
          <span className="block">Real bonds aren&rsquo;t built on hello.</span>
          <span
            className="block"
            style={{ color: P.primary, fontStyle: "italic" }}
          >
            They&rsquo;re built on what you both love.
          </span>
        </h2>
        <p
          className="mt-8 max-w-2xl text-lg sm:text-xl"
          style={{ color: P.text, opacity: 0.78 }}
        >
          The album you both wore out. The book that rewired you. The game you grew up on.
          Homie turns your tastes into a language your friends can read — and quietly
          shows where your worlds overlap.
        </p>
      </section>

      {/* pillars */}
      <section className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 gap-5 px-6 pb-32 sm:grid-cols-3">
        <Pillar
          kicker="01"
          title="depth over reach"
          body="Optimize for one more meaningful hour with your best friend — not a thousand new followers."
        />
        <Pillar
          kicker="02"
          title="taste, not metadata"
          body="Your playlist history is a personality. We let the people who matter read it."
        />
        <Pillar
          kicker="03"
          title="real overlap"
          body="Provider-backed ids — the same Spotify song, the same book isbn — so 'we both love this' is a fact."
        />
      </section>

      {/* how */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-32">
        <div
          className="font-mono text-[11px] tracking-[0.3em] uppercase"
          style={{ color: P.muted }}
        >
          how it clicks
        </div>
        <h2
          className="mt-6"
          style={{
            fontFamily: SERIF,
            fontSize: "clamp(36px, 5.5vw, 80px)",
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            color: P.text,
          }}
        >
          Build a profile out of the things you{" "}
          <span style={{ color: P.primary, fontStyle: "italic" }}>actually love.</span>
        </h2>
        <div className="mt-8 flex flex-wrap gap-2">
          {[
            ["Spotify", "music"],
            ["OMDb", "films"],
            ["Open Library", "books"],
            ["FreeToGame", "games"],
            ["Jikan", "anime"],
          ].map(([name, kind]) => (
            <span
              key={name}
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm"
              style={{
                borderColor: `${P.muted}44`,
                color: P.text,
                backgroundColor: `${P.elevated}cc`,
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: P.primary }}
              />
              <span className="font-medium">{name}</span>
              <span style={{ color: P.muted }}>·</span>
              <span style={{ color: P.muted }}>{kind}</span>
            </span>
          ))}
        </div>
      </section>

      {/* closing CTA */}
      <section className="relative z-10 flex flex-col items-center justify-center px-6 py-40 text-center">
        <div
          className="font-mono text-[11px] tracking-[0.3em] uppercase"
          style={{ color: P.muted }}
        >
          bring them home
        </div>
        <h2
          className="mt-8"
          style={{
            fontFamily: SERIF,
            fontSize: "clamp(80px, 14vw, 220px)",
            lineHeight: 0.88,
            letterSpacing: "-0.03em",
            color: P.text,
          }}
        >
          <span className="block">Make friends</span>
          <span
            className="block"
            style={{ color: P.primary, fontStyle: "italic" }}
          >
            again.
          </span>
        </h2>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {isDevMode ? (
            <DevBottomCta />
          ) : (
            <>
              <Show when="signed-out">
                <SignUpButton>
                  <button
                    className="group rounded-full px-7 py-3.5 text-base font-medium transition"
                    style={{ backgroundColor: P.primary, color: P.bg }}
                  >
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
                  className="group rounded-full px-7 py-3.5 text-base font-medium transition"
                  style={{ backgroundColor: P.primary, color: P.bg }}
                >
                  continue to dashboard
                  <span className="ml-2 inline-block transition group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </Show>
            </>
          )}
        </div>
      </section>

      <footer
        className="relative z-10 flex flex-col items-center justify-between gap-4 border-t px-6 py-10 text-[11px] sm:flex-row sm:px-12"
        style={{
          borderColor: `${P.muted}33`,
          color: P.muted,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: P.primary }}
          />
          <span className="font-mono tracking-[0.3em] uppercase">homie</span>
        </div>
        <div className="font-mono tracking-[0.2em] uppercase">
          built for the meeting, not the scrolling
        </div>
      </footer>

      <style>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  )
}

function Pillar({
  kicker,
  title,
  body,
}: {
  kicker: string
  title: string
  body: string
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border p-6"
      style={{
        borderColor: `${P.muted}44`,
        backgroundColor: P.elevated,
      }}
    >
      <div
        className="font-mono text-xs"
        style={{ color: P.primary }}
      >
        {kicker}
      </div>
      <div
        className="text-xl font-semibold"
        style={{ color: P.text, fontFamily: SERIF }}
      >
        {title}
      </div>
      <div className="text-sm" style={{ color: P.text, opacity: 0.7 }}>
        {body}
      </div>
    </div>
  )
}

function AmbientGlows() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 z-0 h-[600px] w-[600px] rounded-full opacity-30 blur-3xl"
        style={{ background: P.primary }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-40 z-0 h-[640px] w-[640px] rounded-full opacity-20 blur-3xl"
        style={{ background: P.secondary }}
      />
    </>
  )
}

function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 mix-blend-multiply"
      style={{
        opacity: 0.18,
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='linear' slope='0.9'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        backgroundSize: "200px 200px",
      }}
    />
  )
}
