"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import gsap from "gsap"

import { Background } from "./_components/Background"
import { Constellation } from "./_components/Constellation"
import { InterestGraph } from "./_components/InterestGraph"
import { Reveal, RevealWords } from "./_components/Reveal"
import { SolutionOrb } from "./_components/SolutionOrb"

type Palette = [string, string, string]

type Slide = {
  id: string
  palette: Palette
  render: (key: number) => React.ReactNode
}

const SLIDES: Slide[] = [
  {
    id: "cover",
    palette: ["#7c3aed", "#ec4899", "#f59e0b"],
    render: (k) => <CoverSlide slideKey={k} />,
  },
  {
    id: "problem",
    palette: ["#1e3a8a", "#4c1d95", "#0f172a"],
    render: (k) => <ProblemSlide slideKey={k} />,
  },
  {
    id: "insight",
    palette: ["#ec4899", "#f59e0b", "#7c3aed"],
    render: (k) => <InsightSlide slideKey={k} />,
  },
  {
    id: "solution",
    palette: ["#7c3aed", "#22d3ee", "#ec4899"],
    render: (k) => <SolutionSlide slideKey={k} />,
  },
  {
    id: "how",
    palette: ["#9333ea", "#f472b6", "#fbbf24"],
    render: (k) => <HowSlide slideKey={k} />,
  },
  {
    id: "why",
    palette: ["#0ea5e9", "#7c3aed", "#f472b6"],
    render: (k) => <WhySlide slideKey={k} />,
  },
  {
    id: "close",
    palette: ["#f59e0b", "#ec4899", "#7c3aed"],
    render: (k) => <CloseSlide slideKey={k} />,
  },
]

export default function PptPage() {
  const [idx, setIdx] = useState(0)
  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), [])
  const next = useCallback(() => setIdx((i) => Math.min(SLIDES.length - 1, i + 1)), [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault()
        next()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        prev()
      } else if (/^[1-7]$/.test(e.key)) {
        setIdx(parseInt(e.key, 10) - 1)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [next, prev])

  const slide = SLIDES[idx]

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#0a0910] text-white">
      <Background palette={slide.palette} key={`bg-${idx}`} />

      <SlideStage idx={idx}>{slide.render(idx)}</SlideStage>

      <Chrome idx={idx} total={SLIDES.length} onPrev={prev} onNext={next} onJump={setIdx} />
    </main>
  )
}

function SlideStage({ idx, children }: { idx: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ref.current,
        { opacity: 0, scale: 0.98 },
        { opacity: 1, scale: 1, duration: 0.7, ease: "power3.out" },
      )
    })
    return () => ctx.revert()
  }, [idx])
  return (
    <div
      ref={ref}
      key={idx}
      className="relative z-10 flex h-full w-full items-center justify-center px-6 sm:px-12 md:px-20"
    >
      {children}
    </div>
  )
}

function Chrome({
  idx,
  total,
  onPrev,
  onNext,
  onJump,
}: {
  idx: number
  total: number
  onPrev: () => void
  onNext: () => void
  onJump: (i: number) => void
}) {
  return (
    <>
      {/* top-left brand */}
      <div className="absolute top-6 left-6 z-20 flex items-center gap-2 text-[11px] tracking-[0.3em] text-white/60 uppercase">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
        homie · pitch
      </div>
      {/* top-right counter */}
      <div className="absolute top-6 right-6 z-20 font-mono text-[11px] tracking-[0.2em] text-white/50">
        {String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </div>

      {/* dots */}
      <div className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            onClick={() => onJump(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              i === idx ? "w-8 bg-white" : "w-1.5 bg-white/30 hover:bg-white/60"
            }`}
          />
        ))}
      </div>

      {/* nav arrows */}
      <button
        onClick={onPrev}
        disabled={idx === 0}
        aria-label="Previous slide"
        className="absolute bottom-7 left-6 z-20 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium tracking-wider text-white/80 backdrop-blur transition hover:border-white/30 hover:bg-white/10 disabled:pointer-events-none disabled:opacity-30"
      >
        ← prev
      </button>
      <button
        onClick={onNext}
        disabled={idx === total - 1}
        aria-label="Next slide"
        className="absolute right-6 bottom-7 z-20 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium tracking-wider text-white/80 backdrop-blur transition hover:border-white/30 hover:bg-white/10 disabled:pointer-events-none disabled:opacity-30"
      >
        next →
      </button>
    </>
  )
}

/* ------------------------------ slides ------------------------------ */

function CoverSlide({ slideKey }: { slideKey: number }) {
  const logoRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!logoRef.current) return
    const ctx = gsap.context(() => {
      gsap.to(logoRef.current, {
        scale: 1.015,
        duration: 3,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      })
    })
    return () => ctx.revert()
  }, [])
  return (
    <div className="flex max-w-5xl flex-col items-center gap-8 text-center">
      <Reveal slideKey={slideKey} delay={0.1} className="font-mono text-xs tracking-[0.4em] text-white/60 uppercase">
        a hackathon pitch
      </Reveal>
      <div ref={logoRef} className="relative">
        <h1 className="text-[min(22vw,240px)] leading-[0.85] font-black tracking-[-0.04em]">
          <RevealWords text="homie." slideKey={slideKey} delay={0.2} stagger={0.1} />
        </h1>
        <div
          className="pointer-events-none absolute inset-0 -z-10 blur-3xl"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(236,72,153,0.35), transparent 60%)",
          }}
        />
      </div>
      <Reveal
        slideKey={slideKey}
        delay={0.8}
        className="max-w-2xl text-lg text-white/80 sm:text-xl md:text-2xl"
      >
        <RevealWords
          text="the people you know — known better."
          slideKey={slideKey}
          delay={0.8}
          stagger={0.07}
        />
      </Reveal>
      <Reveal slideKey={slideKey} delay={1.6} className="mt-4 text-xs text-white/40">
        press → or space to advance
      </Reveal>
    </div>
  )
}

function ProblemSlide({ slideKey }: { slideKey: number }) {
  return (
    <div className="relative grid w-full max-w-6xl grid-cols-1 items-center gap-12 md:grid-cols-2">
      <div className="relative h-[320px] w-full md:h-[460px]">
        <Constellation />
      </div>
      <div className="flex flex-col gap-8">
        <Reveal
          slideKey={slideKey}
          className="font-mono text-xs tracking-[0.3em] text-white/60 uppercase"
          delay={0.1}
        >
          the problem
        </Reveal>
        <h2 className="text-5xl leading-[1.05] font-semibold tracking-tight sm:text-6xl md:text-7xl">
          <RevealWords
            text="500 friends."
            slideKey={slideKey}
            delay={0.2}
            className="block"
            wordClassName="text-white"
          />
          <RevealWords
            text="nobody to call."
            slideKey={slideKey}
            delay={0.55}
            className="block"
            wordClassName="bg-gradient-to-r from-pink-400 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent"
          />
        </h2>
        <Reveal slideKey={slideKey} delay={1.0} className="max-w-md text-base text-white/70 sm:text-lg">
          Digital closeness replaced depth. We post, we like, we ghost — and then,
          quietly, we drift.
        </Reveal>
        <Reveal slideKey={slideKey} delay={1.3} className="grid max-w-md grid-cols-3 gap-4 pt-4">
          <Stat big="1 in 3" small="young adults feel lonely weekly" />
          <Stat big="−70%" small="time spent with close friends since 2003" />
          <Stat big="24%" small="of US adults report no close friends" />
        </Reveal>
      </div>
    </div>
  )
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-sm">
      <div className="text-lg font-bold text-white sm:text-xl">{big}</div>
      <div className="mt-1 text-[10px] leading-snug text-white/55">{small}</div>
    </div>
  )
}

function InsightSlide({ slideKey }: { slideKey: number }) {
  return (
    <div className="flex max-w-5xl flex-col items-center gap-10 text-center">
      <Reveal
        slideKey={slideKey}
        className="font-mono text-xs tracking-[0.3em] text-white/60 uppercase"
        delay={0.1}
      >
        the insight
      </Reveal>
      <h2 className="text-4xl leading-[1.1] font-semibold tracking-tight sm:text-6xl md:text-7xl">
        <RevealWords
          text="real bonds aren't built on hello."
          slideKey={slideKey}
          delay={0.2}
          className="block"
        />
      </h2>
      <div className="max-w-3xl space-y-3 text-xl sm:text-2xl md:text-3xl">
        <RevealWords
          text="they're built on the album you both wore out,"
          slideKey={slideKey}
          delay={0.9}
          className="block"
          wordClassName="text-white/90"
        />
        <RevealWords
          text="the book that rewired you,"
          slideKey={slideKey}
          delay={1.35}
          className="block"
          wordClassName="text-white/70"
        />
        <RevealWords
          text="the game you grew up on."
          slideKey={slideKey}
          delay={1.75}
          className="block"
          wordClassName="bg-gradient-to-r from-amber-300 via-pink-400 to-violet-400 bg-clip-text text-transparent"
        />
      </div>
      <Reveal slideKey={slideKey} delay={2.4} className="mt-6 text-sm text-white/50">
        shared taste is a shortcut to intimacy.
      </Reveal>
    </div>
  )
}

function SolutionSlide({ slideKey }: { slideKey: number }) {
  return (
    <div className="grid w-full max-w-6xl grid-cols-1 items-center gap-10 md:grid-cols-2">
      <div className="flex flex-col gap-6">
        <Reveal
          slideKey={slideKey}
          className="font-mono text-xs tracking-[0.3em] text-white/60 uppercase"
          delay={0.1}
        >
          the solution
        </Reveal>
        <h2 className="text-5xl leading-[1] font-semibold tracking-tight sm:text-6xl">
          <RevealWords
            text="homie turns your tastes into a language."
            slideKey={slideKey}
            delay={0.2}
          />
        </h2>
        <Reveal slideKey={slideKey} delay={1.0} className="max-w-md text-base text-white/75 sm:text-lg">
          A social layer for the friendships you already have. Build a profile out
          of the things you actually love — music, films, books, games, anime —
          and watch where your worlds quietly overlap.
        </Reveal>
        <Reveal slideKey={slideKey} delay={1.4} className="flex flex-wrap gap-2 pt-2">
          {["Spotify", "OMDb", "Open Library", "FreeToGame", "Jikan"].map((t) => (
            <span
              key={t}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/75 backdrop-blur"
            >
              {t}
            </span>
          ))}
        </Reveal>
      </div>
      <div className="h-[380px] w-full sm:h-[480px]">
        <SolutionOrb />
      </div>
    </div>
  )
}

function HowSlide({ slideKey }: { slideKey: number }) {
  return (
    <div className="flex w-full max-w-6xl flex-col items-center gap-8 text-center">
      <Reveal
        slideKey={slideKey}
        className="font-mono text-xs tracking-[0.3em] text-white/60 uppercase"
        delay={0.1}
      >
        how it works
      </Reveal>
      <h2 className="text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl">
        <RevealWords
          text="real identities. real matches."
          slideKey={slideKey}
          delay={0.2}
          className="block"
        />
      </h2>
      <Reveal
        slideKey={slideKey}
        delay={0.7}
        className="max-w-2xl text-sm text-white/65 sm:text-base"
      >
        Every item on your profile is a <span className="text-amber-300">provider-backed entity</span> — the same Spotify id, the same book isbn, the same anime mal-id. Two people who both love “Kid A” match on the <em>same</em> thing, not two lookalike strings.
      </Reveal>
      <Reveal slideKey={slideKey} delay={1.0} className="h-[420px] w-full sm:h-[480px]">
        <InterestGraph />
      </Reveal>
    </div>
  )
}

function WhySlide({ slideKey }: { slideKey: number }) {
  return (
    <div className="grid w-full max-w-6xl grid-cols-1 items-start gap-10 md:grid-cols-2">
      <div className="flex flex-col gap-6">
        <Reveal
          slideKey={slideKey}
          className="font-mono text-xs tracking-[0.3em] text-white/60 uppercase"
          delay={0.1}
        >
          why now
        </Reveal>
        <h2 className="text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl md:text-6xl">
          <RevealWords
            text="loneliness is a public-health crisis."
            slideKey={slideKey}
            delay={0.2}
          />
        </h2>
        <Reveal slideKey={slideKey} delay={1.0} className="max-w-md text-base text-white/75 sm:text-lg">
          We&rsquo;re not building another dating app. We&rsquo;re not chasing
          strangers. Homie is a <span className="text-pink-300">re-bonding layer</span>
          {" "}for the people already in your life.
        </Reveal>
      </div>
      <div className="flex flex-col gap-3">
        <Pillar
          slideKey={slideKey}
          delay={0.5}
          kicker="01"
          title="depth over reach"
          body="Optimize for one more meaningful hour with your best friend — not 1,000 new followers."
        />
        <Pillar
          slideKey={slideKey}
          delay={0.8}
          kicker="02"
          title="taste, not metadata"
          body="Your playlist history is a personality. We let your friends read it."
        />
        <Pillar
          slideKey={slideKey}
          delay={1.1}
          kicker="03"
          title="real entities, real overlap"
          body="Provider-backed ids mean 'we both love X' is a fact, not a coincidence of spelling."
        />
      </div>
    </div>
  )
}

function Pillar({
  slideKey,
  delay,
  kicker,
  title,
  body,
}: {
  slideKey: number
  delay: number
  kicker: string
  title: string
  body: string
}) {
  return (
    <Reveal
      slideKey={slideKey}
      delay={delay}
      className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm"
    >
      <div className="font-mono text-xs text-white/40">{kicker}</div>
      <div className="flex flex-col gap-1">
        <div className="text-lg font-semibold text-white">{title}</div>
        <div className="text-sm text-white/65">{body}</div>
      </div>
    </Reveal>
  )
}

function CloseSlide({ slideKey }: { slideKey: number }) {
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!wrap.current) return
    const ctx = gsap.context(() => {
      gsap.to(wrap.current, {
        scale: 1.02,
        duration: 4,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      })
    })
    return () => ctx.revert()
  }, [])
  return (
    <div ref={wrap} className="flex max-w-5xl flex-col items-center gap-10 text-center">
      <Reveal
        slideKey={slideKey}
        className="font-mono text-xs tracking-[0.3em] text-white/60 uppercase"
        delay={0.1}
      >
        bring them home
      </Reveal>
      <h2 className="text-[min(14vw,150px)] leading-[0.9] font-black tracking-[-0.03em]">
        <RevealWords
          text="make friends"
          slideKey={slideKey}
          delay={0.2}
          className="block"
          wordClassName="text-white"
        />
        <RevealWords
          text="again."
          slideKey={slideKey}
          delay={0.7}
          className="block"
          wordClassName="bg-gradient-to-r from-amber-300 via-pink-400 to-violet-400 bg-clip-text text-transparent"
        />
      </h2>
      <Reveal slideKey={slideKey} delay={1.4} className="max-w-2xl text-lg text-white/75 sm:text-xl">
        homie — a weekend build that wants to stick around.
      </Reveal>
      <Reveal slideKey={slideKey} delay={1.9} className="flex items-center gap-3 pt-6">
        <span className="inline-block h-2 w-2 rounded-full bg-gradient-to-br from-pink-400 to-violet-500" />
        <span className="font-mono text-xs tracking-[0.3em] text-white/50 uppercase">
          thank you.
        </span>
        <span className="inline-block h-2 w-2 rounded-full bg-gradient-to-br from-amber-300 to-pink-400" />
      </Reveal>
    </div>
  )
}
