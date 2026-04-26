"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force"

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

type CardData = {
  big: string
  small: string
  chart: { year: number; value: number }[]
  yLabel: string
  yMax?: number
  caption: string
}

const WORLD_CARDS: CardData[] = [
  {
    big: "57%",
    small: "of Americans report being lonely",
    yLabel: "% lonely",
    yMax: 70,
    chart: [
      { year: 1990, value: 19 },
      { year: 2000, value: 24 },
      { year: 2010, value: 35 },
      { year: 2018, value: 48 },
      { year: 2023, value: 57 },
    ],
    caption: "Tripled in a generation. Cigna 2023, Roots of Loneliness 2025.",
  },
  {
    big: "80%",
    small: "of Gen Z globally feels socially isolated",
    yLabel: "% isolated",
    yMax: 100,
    chart: [
      { year: 2015, value: 50 },
      { year: 2018, value: 60 },
      { year: 2020, value: 70 },
      { year: 2022, value: 75 },
      { year: 2024, value: 80 },
    ],
    caption: "The first generation to grow up online is also the loneliest.",
  },
  {
    big: "−70%",
    small: "time spent in person with friends, ages 15–24",
    yLabel: "min / day with friends",
    yMax: 70,
    chart: [
      { year: 2003, value: 60 },
      { year: 2010, value: 45 },
      { year: 2015, value: 30 },
      { year: 2020, value: 20 },
    ],
    caption: "From 60 to 20 minutes a day in two decades. BLS, ATUS.",
  },
]

const INDIA_CARDS: CardData[] = [
  {
    big: "27%",
    small: "of young adults 19–29 are seriously lonely in India",
    yLabel: "% seriously lonely",
    yMax: 35,
    chart: [
      { year: 2018, value: 18 },
      { year: 2020, value: 22 },
      { year: 2023, value: 25 },
      { year: 2025, value: 27 },
    ],
    caption: "Aspen Institute · Discover Mental Health (2025).",
  },
  {
    big: "40%",
    small: "of urban Indians felt MORE isolated despite being online constantly",
    yLabel: "% feeling more isolated",
    yMax: 50,
    chart: [
      { year: 2018, value: 22 },
      { year: 2020, value: 32 },
      { year: 2022, value: 38 },
      { year: 2024, value: 40 },
    ],
    caption: "The connectivity paradox. Big Story Network, 2024.",
  },
  {
    big: "73%",
    small: "of young Indians say social media negatively affects them",
    yLabel: "% reporting harm",
    yMax: 100,
    chart: [
      { year: 2018, value: 48 },
      { year: 2020, value: 58 },
      { year: 2023, value: 67 },
      { year: 2025, value: 73 },
    ],
    caption: "61% report sleep disruption. 55% have tried social media detox.",
  },
]

const CHILD_CARDS: CardData[] = [
  {
    big: "8h 39m",
    small: "daily entertainment screen time for teens 13–18",
    yLabel: "hours / day",
    yMax: 10,
    chart: [
      { year: 2015, value: 6.0 },
      { year: 2018, value: 7.0 },
      { year: 2020, value: 7.75 },
      { year: 2023, value: 8.4 },
      { year: 2025, value: 8.65 },
    ],
    caption: "Common Sense Media, 2025. Tweens 8–12: 5h 33m.",
  },
  {
    big: "2×",
    small: "depression / anxiety risk for kids 3+ hours / day on social media",
    yLabel: "% reporting symptoms",
    yMax: 60,
    chart: [
      { year: 2011, value: 22 },
      { year: 2015, value: 28 },
      { year: 2019, value: 38 },
      { year: 2023, value: 50 },
    ],
    caption: "U.S. Surgeon General Advisory on Youth Mental Health, 2023.",
  },
  {
    big: "22%",
    small: "of US high schoolers seriously considered suicide in 2021",
    yLabel: "% who considered",
    yMax: 30,
    chart: [
      { year: 2011, value: 16 },
      { year: 2015, value: 18 },
      { year: 2019, value: 19 },
      { year: 2021, value: 22 },
    ],
    caption:
      "CDC YRBS, 2021. Up from 16% a decade earlier. The trajectory tracks smartphone adoption.",
  },
]

// new deck — Indian + global stats only ----------------------------

const LONELINESS_CARDS: CardData[] = [
  {
    big: "27%",
    small: "of young adults 19–29 are seriously lonely in India",
    yLabel: "% seriously lonely",
    yMax: 35,
    chart: [
      { year: 2018, value: 18 },
      { year: 2020, value: 22 },
      { year: 2023, value: 25 },
      { year: 2025, value: 27 },
    ],
    caption: "Aspen Institute · Discover Mental Health (2025).",
  },
  {
    big: "80%",
    small: "of Gen Z globally feels socially isolated",
    yLabel: "% isolated",
    yMax: 100,
    chart: [
      { year: 2015, value: 50 },
      { year: 2018, value: 60 },
      { year: 2020, value: 70 },
      { year: 2022, value: 75 },
      { year: 2024, value: 80 },
    ],
    caption: "The first generation to grow up online is also the loneliest.",
  },
]

const KIDS_CARDS: CardData[] = [
  {
    big: "8h 39m",
    small: "daily entertainment screen time for teens 13–18",
    yLabel: "hours / day",
    yMax: 10,
    chart: [
      { year: 2015, value: 6.0 },
      { year: 2018, value: 7.0 },
      { year: 2020, value: 7.75 },
      { year: 2023, value: 8.4 },
      { year: 2025, value: 8.65 },
    ],
    caption: "Common Sense Media, 2025. Tweens 8–12: 5h 33m.",
  },
  {
    big: "40%",
    small: "of urban Indians felt MORE isolated despite being online constantly",
    yLabel: "% feeling more isolated",
    yMax: 50,
    chart: [
      { year: 2018, value: 22 },
      { year: 2020, value: 32 },
      { year: 2022, value: 38 },
      { year: 2024, value: 40 },
    ],
    caption: "The connectivity paradox. Big Story Network, 2024.",
  },
]

type SlideRender = (props: { subIdx: number }) => React.ReactNode

const SLIDES: { id: string; render: SlideRender; subSteps: number }[] = [
  { id: "cover", render: CoverSlide, subSteps: 0 },
  { id: "loneliness", render: LonelinessSlide, subSteps: 2 },
  { id: "kids", render: KidsSlide, subSteps: 2 },
  { id: "problems", render: ProblemsSlide, subSteps: 0 },
  { id: "graph", render: ProblemGraphSlide, subSteps: 4 },
  { id: "consumer", render: ConsumerFeaturesSlide, subSteps: 0 },
  { id: "business", render: BusinessFeaturesSlide, subSteps: 0 },
  { id: "child-protection", render: ChildProtectionSlide, subSteps: 0 },
  { id: "use-cases", render: UseCasesSlide, subSteps: 4 },
  { id: "demo", render: DemoSlide, subSteps: 0 },
  { id: "close", render: CloseSlide, subSteps: 0 },
]

export default function PitchPage() {
  const [idx, setIdx] = useState(0)
  const [subIdx, setSubIdx] = useState(-1)
  const total = SLIDES.length

  const next = useCallback(() => {
    const slide = SLIDES[idx]
    if (subIdx < slide.subSteps - 1) {
      setSubIdx(subIdx + 1)
      return
    }
    setIdx(Math.min(total - 1, idx + 1))
    setSubIdx(-1)
  }, [idx, subIdx, total])

  const prev = useCallback(() => {
    if (subIdx >= 0) {
      setSubIdx(subIdx - 1)
      return
    }
    const newIdx = Math.max(0, idx - 1)
    setIdx(newIdx)
    const prevSlide = SLIDES[newIdx]
    setSubIdx(prevSlide.subSteps > 0 ? prevSlide.subSteps - 1 : -1)
  }, [idx, subIdx])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault()
        next()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        prev()
      } else if (/^[1-9]$/.test(e.key)) {
        const n = parseInt(e.key, 10)
        if (n <= total) {
          setIdx(n - 1)
          setSubIdx(-1)
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [next, prev, total])

  const Slide = SLIDES[idx].render

  return (
    <main
      className="relative h-[100dvh] w-full overflow-hidden"
      style={{ backgroundColor: P.bg, color: P.text }}
    >
      <Keyframes />
      <Grain />
      <AmbientGlows />

      {/* persistent lattice — stays mounted across slides 10-12, resizes/moves between them */}
      <PersistentLattice idx={idx} subIdx={subIdx} />

      <div
        key={idx}
        className="relative z-20 flex h-full w-full items-center justify-center px-12 py-16"
        style={{ animation: "ppt-slide-in 0.5s ease-out" }}
      >
        <Slide subIdx={subIdx} />
      </div>
      <Chrome
        idx={idx}
        total={total}
        next={next}
        prev={prev}
        jump={(i) => {
          setIdx(i)
          setSubIdx(-1)
        }}
      />
    </main>
  )
}

/* ----------------------------------------------------------------- */
/* slides                                                            */
/* ----------------------------------------------------------------- */

function CoverSlide() {
  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-10 text-center">
      <FadeUp delay={0.05}>
        <div
          className="font-mono text-xs tracking-[0.4em] uppercase"
          style={{ color: P.muted }}
        >
          a homie pitch
        </div>
      </FadeUp>
      <FadeUp delay={0.2}>
        <h1
          style={{
            fontFamily: SERIF,
            fontSize: "clamp(140px, 22vw, 280px)",
            lineHeight: 0.85,
            letterSpacing: "-0.04em",
            color: P.text,
          }}
        >
          homie<span style={{ color: P.primary }}>.</span>
        </h1>
      </FadeUp>
      <FadeUp delay={0.7}>
        <p
          className="max-w-3xl text-2xl md:text-3xl"
          style={{ color: P.text, opacity: 0.9 }}
        >
          the people you know &mdash;{" "}
          <span style={{ color: P.secondary }}>known better.</span>
        </p>
      </FadeUp>
      <FadeUp delay={1.3}>
        <div
          className="mt-8 font-mono text-xs tracking-[0.3em] uppercase"
          style={{ color: P.muted }}
        >
          press → or space to advance
        </div>
      </FadeUp>
    </div>
  )
}

function WorldSlide({ subIdx }: { subIdx: number }) {
  return (
    <InteractiveStatsSlide
      kicker="the world"
      headline={
        <>
          Loneliness is the world&rsquo;s{" "}
          <span style={{ color: P.primary, fontStyle: "italic" }}>
            quietest epidemic.
          </span>
        </>
      }
      body={
        <>
          The U.S. Surgeon General now compares its mortality risk to smoking{" "}
          <span style={{ color: P.primary }}>fifteen cigarettes a day</span>.
          One in four adults globally reports being seriously lonely.
        </>
      }
      attribution="— U.S. Surgeon General Advisory, 2023 · Premature death risk up ~30%."
      cards={WORLD_CARDS}
      subIdx={subIdx}
    />
  )
}

function IndiaSlide({ subIdx }: { subIdx: number }) {
  return (
    <InteractiveStatsSlide
      kicker="and at home"
      headline={
        <>
          India is the{" "}
          <span style={{ color: P.primary, fontStyle: "italic" }}>
            third loneliest
          </span>{" "}
          country on earth.
        </>
      }
      body={
        <>
          <span style={{ color: P.primary }}>43%</span> of Indians report being
          lonely. Only Brazil and Turkey are worse — and we have the youngest
          population of any major country.
        </>
      }
      attribution="One billion online · loneliest among the most-connected."
      cards={INDIA_CARDS}
      subIdx={subIdx}
    />
  )
}

function ChildrenSlide({ subIdx }: { subIdx: number }) {
  return (
    <InteractiveStatsSlide
      kicker="the most vulnerable"
      headline={
        <>
          Our children grow up{" "}
          <span style={{ color: P.primary, fontStyle: "italic" }}>
            on a screen.
          </span>
        </>
      }
      body={
        <>
          Today&rsquo;s teenager spends nearly{" "}
          <span style={{ color: P.primary }}>nine hours a day</span> on a screen
          for entertainment alone. In India,{" "}
          <span style={{ color: P.secondary }}>76%</span> of 14–16 year-olds
          used a phone for social media last week — versus{" "}
          <span style={{ color: P.secondary }}>57%</span> for school.
        </>
      }
      attribution="Common Sense Media · Storyboard18 · CDC YRBS."
      cards={CHILD_CARDS}
      subIdx={subIdx}
    />
  )
}

// new deck slides ---------------------------------------------------

function LonelinessSlide({ subIdx }: { subIdx: number }) {
  return (
    <InteractiveStatsSlide
      kicker="the quiet epidemic"
      headline={
        <>
          Loneliness is the{" "}
          <span style={{ color: P.primary, fontStyle: "italic" }}>
            quietest
          </span>{" "}
          epidemic of our time.
        </>
      }
      body={
        <>
          A generation that grew up{" "}
          <span style={{ color: P.primary }}>perfectly connected</span> is
          somehow the loneliest one yet — at home in India, and across the
          world.
        </>
      }
      attribution="Aspen Institute, 2025 · Cigna / global Gen Z surveys."
      cards={LONELINESS_CARDS}
      subIdx={subIdx}
    />
  )
}

function KidsSlide({ subIdx }: { subIdx: number }) {
  return (
    <InteractiveStatsSlide
      kicker="and the kids pay first"
      headline={
        <>
          The first generation raised by{" "}
          <span style={{ color: P.primary, fontStyle: "italic" }}>
            an algorithm.
          </span>
        </>
      }
      body={
        <>
          Today&rsquo;s teen spends{" "}
          <span style={{ color: P.primary }}>almost nine hours</span> a day on
          screens for entertainment — and reports feeling{" "}
          <span style={{ color: P.secondary }}>more isolated</span>, not less.
        </>
      }
      attribution="Common Sense Media, 2025 · Big Story Network, 2024."
      cards={KIDS_CARDS}
      subIdx={subIdx}
    />
  )
}

function GapSlide() {
  return (
    <div className="flex w-full max-w-6xl flex-col items-center gap-8 text-center">
      <FadeUp delay={0.05}>
        <Kicker>the gap</Kicker>
      </FadeUp>
      <FadeUp delay={0.2}>
        <h2
          style={{
            fontFamily: SERIF,
            fontSize: "clamp(48px, 6.4vw, 92px)",
            lineHeight: 1.0,
            letterSpacing: "-0.03em",
            color: P.text,
          }}
        >
          We need <span style={{ color: P.primary }}>twelve hours</span> a week
          with our people.
        </h2>
      </FadeUp>
      <div className="grid w-full grid-cols-3 items-end gap-6">
        <FadeUp delay={0.5}>
          <GapColumn
            big="12"
            unit="hrs / week"
            label="what we need"
            sub="To avoid loneliness"
            tone="primary"
          />
        </FadeUp>
        <FadeUp delay={0.7}>
          <GapColumn
            big="6"
            unit="hrs / week"
            label="what we have"
            sub="The actual average"
            tone="muted"
          />
        </FadeUp>
        <FadeUp delay={0.9}>
          <GapColumn
            big="22"
            unit="hrs / week"
            label="on a feed instead"
            sub="3.2 hrs / day in India"
            tone="secondary"
          />
        </FadeUp>
      </div>
      <FadeUp delay={1.2}>
        <div
          className="relative mt-2 max-w-4xl rounded-2xl border-l-4 px-8 py-6"
          style={{
            borderLeftColor: P.primary,
            backgroundColor: `${P.primary}10`,
          }}
        >
          <div
            className="mb-2 text-left font-mono text-xs tracking-[0.3em] uppercase"
            style={{ color: P.primary }}
          >
            try this
          </div>
          <p
            className="text-left text-xl md:text-2xl"
            style={{ color: P.text }}
          >
            <span style={{ fontFamily: SERIF, fontStyle: "italic" }}>
              &ldquo;Imagine if a single industry was responsible for our
              children eating eight hours of sugar a day.&rdquo;
            </span>{" "}
            <span style={{ color: P.text, opacity: 0.75 }}>
              We&rsquo;d call it a public-health emergency. We&rsquo;d
              regulate. We&rsquo;d sue.
            </span>{" "}
            <span style={{ color: P.primary, fontWeight: 600 }}>
              We are not doing that for the platforms eating our social diet.
            </span>
          </p>
        </div>
      </FadeUp>
    </div>
  )
}

function TrapSlide() {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <FadeUp delay={0.05}>
          <Kicker>the trap we already built</Kicker>
        </FadeUp>
        <FadeUp delay={0.2}>
          <h2
            style={{
              fontFamily: SERIF,
              color: P.text,
              fontSize: "clamp(48px, 7vw, 100px)",
              lineHeight: 1.0,
              letterSpacing: "-0.03em",
            }}
          >
            We&rsquo;re fixing loneliness{" "}
            <span style={{ color: P.primary }}>with the wrong tool.</span>
          </h2>
        </FadeUp>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <FadeUp delay={0.5}>
          <TrapCard
            big="2h 21m"
            headline="on a content machine, every day."
            sub="Gen Z averages 5h. We don&rsquo;t leave more connected — we leave more anxious."
            stats={[
              "33% of heavy users feel worse from social comparison",
              "32% of teen girls — Instagram hurts body image (Meta&rsquo;s own research)",
              "EU 2026: TikTok&rsquo;s addictive design ruled illegal",
            ]}
          />
        </FadeUp>
        <FadeUp delay={0.8}>
          <TrapCard
            big="79%"
            headline="and our data is the product."
            sub="The price of &ldquo;free&rdquo; social is a behavioral profile sold to the highest bidder."
            stats={[
              "84% feel they&rsquo;ve lost control of their data",
              "12 of 15 top platforms train AI on your content",
              "38% use social media less now because of privacy",
            ]}
          />
        </FadeUp>
      </div>
    </div>
  )
}

function ProfitsSlide() {
  const bars = [
    { name: "Meta", value: 243, color: P.primary },
    { name: "Google", value: 240, color: P.primary },
    { name: "TikTok", value: 33, color: P.secondary },
  ]
  const total = bars.reduce((a, b) => a + b.value, 0)
  const max = Math.max(...bars.map((b) => b.value))

  return (
    <div className="grid w-full max-w-7xl grid-cols-1 items-center gap-12 md:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col gap-5">
        <FadeUp delay={0.05}>
          <Kicker>follow the money</Kicker>
        </FadeUp>
        <FadeUp delay={0.2}>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: "clamp(56px, 7.2vw, 104px)",
              lineHeight: 0.96,
              letterSpacing: "-0.03em",
              color: P.text,
            }}
          >
            They earn{" "}
            <span style={{ color: P.primary }}>
              ${total === 516 ? total : Math.round(total)} billion
            </span>{" "}
            a year{" "}
            <span style={{ color: P.text, opacity: 0.7, fontStyle: "italic" }}>
              from our attention.
            </span>
          </h2>
        </FadeUp>
        <FadeUp delay={0.6}>
          <p
            className="max-w-md text-lg leading-relaxed md:text-xl"
            style={{ color: P.text, opacity: 0.85 }}
          >
            That&rsquo;s the 2025 ad revenue of three companies, combined. The
            entire <span style={{ color: P.secondary }}>economic engine</span>{" "}
            of &ldquo;social&rdquo; is built on{" "}
            <span style={{ color: P.primary }}>
              keeping you scrolling, not connecting
            </span>
            . They cannot fix this. The math won&rsquo;t let them.
          </p>
        </FadeUp>
        <FadeUp delay={0.9}>
          <div
            className="rounded-xl border-l-4 px-6 py-4"
            style={{
              borderLeftColor: P.success,
              backgroundColor: `${P.success}12`,
            }}
          >
            <div
              className="font-mono text-xs tracking-[0.3em] uppercase"
              style={{ color: P.success }}
            >
              homie
            </div>
            <div
              className="mt-1 text-lg md:text-xl"
              style={{ color: P.text }}
            >
              We charge a small subscription. That&rsquo;s it. No ads paying
              the bills, no incentive to keep you here.
            </div>
          </div>
        </FadeUp>
      </div>
      <div className="flex flex-col gap-5">
        {bars.map((b, i) => (
          <FadeUp key={b.name} delay={0.4 + i * 0.15}>
            <ProfitBar
              name={b.name}
              value={b.value}
              max={max}
              color={b.color}
            />
          </FadeUp>
        ))}
      </div>
    </div>
  )
}

function PivotSlide() {
  return (
    <div className="flex w-full max-w-6xl flex-col items-center gap-10 text-center">
      <FadeUp delay={0.05}>
        <Kicker>the homie thesis</Kicker>
      </FadeUp>
      <FadeUp delay={0.2}>
        <h2
          style={{
            fontFamily: SERIF,
            fontSize: "clamp(96px, 16vw, 240px)",
            lineHeight: 0.88,
            letterSpacing: "-0.05em",
            color: P.text,
          }}
        >
          Bonds<span style={{ color: P.primary }}>,</span>{" "}
          <span style={{ color: P.primary, fontStyle: "italic" }}>
            not feeds.
          </span>
        </h2>
      </FadeUp>
      <FadeUp delay={0.7}>
        <p
          className="max-w-3xl text-2xl md:text-3xl"
          style={{ color: P.text, opacity: 0.85 }}
        >
          A social layer for the people you{" "}
          <span style={{ color: P.secondary }}>already have</span>.
        </p>
      </FadeUp>
      <div className="grid w-full grid-cols-1 gap-5 pt-2 md:grid-cols-3">
        <FadeUp delay={1.0}>
          <Pillar
            n="01"
            title="Privacy-respecting ads"
            body="Contextual, not behavioral. No brokers, no selling profiles."
          />
        </FadeUp>
        <FadeUp delay={1.15}>
          <Pillar
            n="02"
            title="Encrypted by default"
            body="Your private data is yours. End-to-end, by design."
          />
        </FadeUp>
        <FadeUp delay={1.3}>
          <Pillar
            n="03"
            title="No algorithmic feed"
            body="No infinite scroll. No comparison machine. We push you to meet, not to scroll."
          />
        </FadeUp>
      </div>
    </div>
  )
}

type Feature = {
  id: string
  cat: string
  title: string
  body: string
}

const FEATURES: Feature[] = [
  {
    id: "music",
    cat: "discover",
    title: "Music your friends actually love.",
    body: "Pull songs your friends are listening to right now — surfaced from real Spotify ids, not vibes.",
  },
  {
    id: "foodie",
    cat: "discover",
    title: "Eat where your foodie friend swears by.",
    body: "Restaurant recs come from people you trust, with notes you can't fake on a review site.",
  },
  {
    id: "movie",
    cat: "plan",
    title: "Movie night, taste-blended.",
    body: "Four friends → one watchlist that reflects all of you, not the algorithm's pick of the week.",
  },
  {
    id: "run",
    cat: "build",
    title: "Start a run club in your colony.",
    body: "Local micro-communities around real activities — for adults and for kids' soccer alike.",
  },
  {
    id: "kids",
    cat: "protect",
    title: "Kid mode, with crazy customisation.",
    body: "Time limits, contact gates, content boundaries. Built for your kid, not for retention metrics.",
  },
]

// alias retained as UseCasesSlide so SLIDES[] reference resolves
function UseCasesSlide({ subIdx }: { subIdx: number }) {
  return <FeaturesSlide subIdx={subIdx} />
}

/* ----------------------------------------------------------------- */
/* problem-graph slide — five morphing states (one click per state)   */
/* ----------------------------------------------------------------- */

const PROBLEM_STATES: {
  problem: string
  solution: string
}[] = [
  {
    problem: "01 — they're content machines, dopamine-hacking you.",
    solution: "homie has no feed. no reels. no infinite scroll.",
  },
  {
    problem: "02 — they don't foster real friendships.",
    solution: "homie connects you to people via what you actually love.",
  },
  {
    problem: "03 — they don't build communities, just timelines.",
    solution: "homie organises your people into real communities.",
  },
  {
    problem: "04 — they sell your identity to advertisers.",
    solution: "on homie, businesses talk to communities — never to you.",
  },
  {
    problem: "05 — they keep you on the screen forever.",
    solution: "homie pushes you off the app, into real-life hangouts.",
  },
]

const PG_NOISE_URL = "/images/textures/stronger-background-textuer-noise.png"

const PG_VB_W = 1200
const PG_VB_H = 600
const PG_CX = PG_VB_W / 2
const PG_CY = PG_VB_H / 2

type PGPerson = {
  id: string
  label: string
  color: string
  vennCluster: 0 | 1 | 2  // 0 = gaming, 1 = sports, 2 = music
  irlZone: 0 | 1 | 2      // state 4 cluster: 0 cafe, 1 open mic, 2 run club
  spawnDelay: number      // seconds, for state 1 stagger
}

const PG_PEOPLE_2: PGPerson[] = [
  { id: "ma", label: "MA", color: "#A8C5B0", vennCluster: 0, irlZone: 0, spawnDelay: 0.0 },
  { id: "jo", label: "JO", color: "#E8B784", vennCluster: 1, irlZone: 1, spawnDelay: 0.3 },
  { id: "sa", label: "SA", color: "#A5B5D4", vennCluster: 1, irlZone: 1, spawnDelay: 0.6 },
  { id: "pr", label: "PR", color: "#D4A5A5", vennCluster: 0, irlZone: 0, spawnDelay: 0.9 },
  { id: "al", label: "AL", color: "#C5A5D4", vennCluster: 2, irlZone: 2, spawnDelay: 1.2 },
  { id: "ri", label: "RI", color: "#D4C5A5", vennCluster: 2, irlZone: 2, spawnDelay: 1.5 },
  { id: "ta", label: "TA", color: "#9FBFA1", vennCluster: 0, irlZone: 0, spawnDelay: 1.8 },
  { id: "lu", label: "LU", color: "#E0A892", vennCluster: 2, irlZone: 1, spawnDelay: 2.1 },
  { id: "ne", label: "NE", color: "#B5A5D4", vennCluster: 0, irlZone: 1, spawnDelay: 2.4 },
  { id: "em", label: "EM", color: "#D4B5A5", vennCluster: 1, irlZone: 0, spawnDelay: 2.7 },
  { id: "vi", label: "VI", color: "#A5D4C5", vennCluster: 2, irlZone: 2, spawnDelay: 3.0 },
  { id: "kr", label: "KR", color: "#E8A5C5", vennCluster: 0, irlZone: 0, spawnDelay: 3.3 },
  { id: "an", label: "AN", color: "#C5E8A5", vennCluster: 1, irlZone: 2, spawnDelay: 3.6 },
  { id: "di", label: "DI", color: "#A5C5E8", vennCluster: 2, irlZone: 1, spawnDelay: 3.9 },
]

type PGInterest = { id: string; mark: string; x: number; y: number; spawnDelay: number }

// Interest positions are anchors — the simulation pulls each interest back
// toward its spawn point, but lets it drift with the wobble + person springs.
const PG_INTERESTS_2: PGInterest[] = [
  { id: "music",  mark: "♫", x: 480, y: 75,  spawnDelay: 3.0 },
  { id: "film",   mark: "▶", x: 680, y: 75,  spawnDelay: 3.15 },
  { id: "book",   mark: "❡", x: 485, y: 235, spawnDelay: 3.3 },
  { id: "game",   mark: "✦", x: 725, y: 235, spawnDelay: 3.45 },
  { id: "anime",  mark: "✿", x: 490, y: 540, spawnDelay: 3.6 },
  { id: "sport",  mark: "⚽", x: 715, y: 540, spawnDelay: 3.75 },
  { id: "art",    mark: "✎", x: 250, y: 175, spawnDelay: 3.9 },
  { id: "food",   mark: "✦", x: 950, y: 175, spawnDelay: 4.05 },
  { id: "travel", mark: "✈", x: 250, y: 425, spawnDelay: 4.2 },
  { id: "tech",   mark: "⌬", x: 950, y: 425, spawnDelay: 4.35 },
]

// Each interest is shared by at least 2 people. Some people appear in
// multiple interests, mirroring the way taste actually clusters.
const PG_INTEREST_PEOPLE: Record<string, string[]> = {
  music:  ["ma", "jo"],
  film:   ["sa", "pr"],
  book:   ["al", "ri"],
  game:   ["ta", "lu"],
  anime:  ["ne", "em"],
  sport:  ["vi", "kr"],
  art:    ["an", "di", "ma"],
  food:   ["jo", "sa", "vi"],
  travel: ["pr", "al", "kr"],
  tech:   ["ri", "lu", "ta"],
}

// Flattened [personId, interestId] pairs — used both as sim links and as
// keys for line refs.
const PG_PERSON_INTEREST_PAIRS: Array<[string, string]> = (() => {
  const out: Array<[string, string]> = []
  for (const [iid, pids] of Object.entries(PG_INTEREST_PEOPLE)) {
    for (const pid of pids) out.push([pid, iid])
  }
  return out
})()

const PG_VENN_2 = [
  { x: 360, y: 280, r: 200, mark: "🎮", label: "gaming",  fill: "#C5A5D4" },
  { x: 840, y: 280, r: 200, mark: "🏐", label: "sports",  fill: "#A8C5B0" },
  { x: 600, y: 420, r: 170, mark: "🎵", label: "music",   fill: "#E8B784" },
]

const PG_EVENTS_2 = [
  { x: 280, y: 380, mark: "☕", label: "café meetup",   color: "#E8B784" },
  { x: 600, y: 380, mark: "🎤", label: "open mic",      color: "#C5A5D4" },
  { x: 920, y: 380, mark: "🏃", label: "run club",      color: "#A8C5B0" },
]

const PG_BUSINESSES_2 = [
  { x: 80,           y: 80,           label: "Adidas",      icon: "/images/icons/adidas.png",              target: PG_VENN_2[1] },
  { x: PG_VB_W - 80, y: 80,           label: "PlayStation", icon: "/images/icons/playstation-logotype.png", target: PG_VENN_2[0] },
  { x: PG_VB_W - 80, y: PG_VB_H - 60, label: "Spotify",     icon: "/images/icons/spotify.png",             target: PG_VENN_2[2] },
]

// Real social-media artifact screenshots — used as the "posts/reels/feeds"
// orbiting YOU in state 0, before being deleted. Phone-aspect ratios kept.
const PG_POSTS_2 = [
  { src: "/images/social-media-artifacts/Screenshot 2026-04-26 053637.png", angle: 0 },
  { src: "/images/social-media-artifacts/Screenshot 2026-04-26 053718.png", angle: 72 },
  { src: "/images/social-media-artifacts/Screenshot 2026-04-26 053753.png", angle: 144 },
  { src: "/images/social-media-artifacts/Screenshot 2026-04-26 053820.png", angle: 216 },
  { src: "/images/social-media-artifacts/Screenshot 2026-04-26 053905.png", angle: 288 },
]

/* d3-force types + helpers ---------------------------------------- */

type SimNode = SimulationNodeDatum & {
  id: string
  kind: "you" | "person" | "interest"
  isYou?: boolean
  label?: string
  color?: string
  mark?: string
  vennCluster?: 0 | 1 | 2
  irlZone?: 0 | 1 | 2
  spawnDelay?: number
}

type SimEdge = SimulationLinkDatum<SimNode>

// (Custom forces removed — we use d3's built-in forceX/forceY for cluster
// and anchor behavior, and the simulation's natural alphaTarget for the
// "always alive" feel. Simpler and far more performant than the previous
// custom drift force.)

function ProblemGraphSlide({ subIdx }: { subIdx: number }) {
  const state = Math.max(0, Math.min(PROBLEM_STATES.length - 1, subIdx + 1))
  const cur = PROBLEM_STATES[state]
  return (
    <div className="flex w-full max-w-7xl flex-col gap-3">
      <div className="flex items-baseline justify-between gap-6">
        <FadeUp delay={0.05}>
          <Kicker>problem → solution</Kicker>
        </FadeUp>
        <div
          className="font-mono text-xs tracking-[0.3em] uppercase"
          style={{ color: P.muted }}
        >
          {String(state + 1).padStart(2, "0")} / 05
        </div>
      </div>
      <div
        key={`p-${state}`}
        className="flex flex-col gap-1"
        style={{ animation: "ppt-fade-up 0.5s ease-out both" }}
      >
        <div
          className="text-sm md:text-base"
          style={{
            color: P.muted,
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
          }}
        >
          {cur.problem}
        </div>
        <div
          className="text-2xl leading-tight md:text-3xl"
          style={{ color: P.primary, fontFamily: SERIF, fontWeight: 600 }}
        >
          {cur.solution}
        </div>
      </div>

      {/* full-bleed graph: breaks out of the centered slide column */}
      <div
        className="relative mt-1"
        style={{
          height: 600,
          width: "100vw",
          marginLeft: "calc(50% - 50vw)",
          marginRight: "calc(50% - 50vw)",
        }}
      >
        {/* noise texture overlay */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${PG_NOISE_URL})`,
            backgroundSize: "320px 320px",
            backgroundRepeat: "repeat",
            mixBlendMode: "multiply",
            opacity: 0.22,
          }}
        />
        <ProblemGraph state={state} />
      </div>
    </div>
  )
}

function ProblemGraph({ state }: { state: number }) {
  const showPeople = state >= 1
  const showInterests = state >= 1 && state <= 3
  const interestsDim = state >= 2  // grey out in venn states
  const showVenn = state === 2 || state === 3
  const showBusinesses = state === 3
  const showEvents = state === 4
  const showCenterYou = state === 0
  const showPosts = state === 0

  /* d3-force simulation — imperative DOM updates via refs (no setState per
     tick), so the React tree only re-renders on state change. ------------ */

  const simRef = useRef<Simulation<SimNode, SimEdge> | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const edgesRef = useRef<SimEdge[]>([])
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ id: string } | null>(null)
  // Refs to the SVG elements that the tick handler updates imperatively.
  const nodeGroupRefs = useRef(new Map<string, SVGGElement>())
  const spineLineRefs = useRef(new Map<string, SVGLineElement>())
  // Thread lines keyed by `${personId}|${interestId}` since one person may
  // be linked to multiple interests.
  const threadLineRefs = useRef(new Map<string, SVGLineElement>())
  // Camera (auto-zoom) — wrapper <g> transform that lerps to fit nodes.
  const cameraGroupRef = useRef<SVGGElement>(null)
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 })

  // Initialize the simulation once. YO is pinned at viewBox centre via fx/fy.
  // The tick handler writes positions DIRECTLY to the SVG via refs — no React
  // re-render per frame, no jitter from React reconciliation.
  useEffect(() => {
    const yo: SimNode = {
      id: "yo",
      kind: "you",
      isYou: true,
      x: PG_CX,
      y: PG_CY,
      fx: PG_CX,
      fy: PG_CY,
    }
    const people: SimNode[] = PG_PEOPLE_2.map((p) => ({
      id: p.id,
      kind: "person",
      label: p.label,
      color: p.color,
      vennCluster: p.vennCluster,
      irlZone: p.irlZone,
      spawnDelay: p.spawnDelay,
      x: PG_CX + (Math.random() - 0.5) * 60,
      y: PG_CY + (Math.random() - 0.5) * 60,
    }))
    const interests: SimNode[] = PG_INTERESTS_2.map((it) => ({
      id: it.id,
      kind: "interest",
      mark: it.mark,
      x: it.x + (Math.random() - 0.5) * 30,
      y: it.y + (Math.random() - 0.5) * 30,
    }))
    nodesRef.current = [yo, ...people, ...interests]

    // Edges: each person → YO, plus the explicit person↔interest pairs
    // (each interest has ≥2 people).
    const personYoLinks: SimEdge[] = people.map((p) => ({
      source: p.id,
      target: "yo",
    }))
    const personInterestLinks: SimEdge[] = PG_PERSON_INTEREST_PAIRS.map(
      ([pid, iid]) => ({ source: pid, target: iid }),
    )
    edgesRef.current = [...personYoLinks, ...personInterestLinks]

    // Anchor each interest near its declared position (gentle pull). This
    // is much cheaper than the old custom force.
    const interestHomeX = (n: SimNode) =>
      n.kind === "interest"
        ? PG_INTERESTS_2.find((it) => it.id === n.id)?.x ?? PG_CX
        : PG_CX
    const interestHomeY = (n: SimNode) =>
      n.kind === "interest"
        ? PG_INTERESTS_2.find((it) => it.id === n.id)?.y ?? PG_CY
        : PG_CY

    const sim = forceSimulation<SimNode, SimEdge>(nodesRef.current)
      .force(
        "link",
        forceLink<SimNode, SimEdge>(edgesRef.current)
          .id((n) => (n as SimNode).id)
          .distance((l) => {
            const tgt = l.target as SimNode
            return tgt.id === "yo" ? 200 : 110
          })
          .strength(0.35),
      )
      .force(
        "charge",
        forceManyBody<SimNode>().strength((n) =>
          (n as SimNode).kind === "interest" ? -150 : -300,
        ),
      )
      .force(
        "collide",
        forceCollide<SimNode>((n) =>
          (n as SimNode).kind === "interest" ? 28 : 38,
        ),
      )
      .force(
        "interest-x",
        forceX<SimNode>(interestHomeX).strength((n) =>
          n.kind === "interest" ? 0.06 : 0,
        ),
      )
      .force(
        "interest-y",
        forceY<SimNode>(interestHomeY).strength((n) =>
          n.kind === "interest" ? 0.06 : 0,
        ),
      )
      // d3 defaults are good. alphaTarget = small constant keeps the sim
      // gently alive — every node still wobbles a touch from spring tension
      // never quite reaching equilibrium.
      .velocityDecay(0.42)
      .alphaDecay(0.02)
      .alphaMin(0.001)
      .alphaTarget(0.04)
      .on("tick", tickHandler)

    simRef.current = sim
    return () => {
      sim.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Imperative tick handler — runs every frame, writes transforms directly
  // to the captured SVG element refs. Bypasses React reconciliation.
  function tickHandler() {
    // Build a quick id→node lookup once per tick (faster than .find per item).
    const byId = new Map<string, SimNode>()
    for (const n of nodesRef.current) byId.set(n.id, n)

    // Update node group transforms.
    for (const n of nodesRef.current) {
      const el = nodeGroupRefs.current.get(n.id)
      if (el) {
        el.setAttribute("transform", `translate(${n.x ?? 0},${n.y ?? 0})`)
      }
    }

    // Update spine lines (person → YO).
    for (const p of PG_PEOPLE_2) {
      const pn = byId.get(p.id)
      if (!pn) continue
      const spine = spineLineRefs.current.get(p.id)
      if (spine) {
        spine.setAttribute("x1", String(pn.x ?? 0))
        spine.setAttribute("y1", String(pn.y ?? 0))
      }
    }

    // Update thread lines (person → interest), one per pair.
    for (const [pid, iid] of PG_PERSON_INTEREST_PAIRS) {
      const pn = byId.get(pid)
      const ni = byId.get(iid)
      const thread = threadLineRefs.current.get(`${pid}|${iid}`)
      if (thread && pn && ni) {
        thread.setAttribute("x1", String(pn.x ?? 0))
        thread.setAttribute("y1", String(pn.y ?? 0))
        thread.setAttribute("x2", String(ni.x ?? 0))
        thread.setAttribute("y2", String(ni.y ?? 0))
      }
    }

    // Auto-zoom: lerp camera transform toward the bounding box of nodes.
    updateCamera(byId)
  }

  // Compute target camera transform from node bbox + lerp current toward it.
  function updateCamera(byId: Map<string, SimNode>) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of nodesRef.current) {
      if (n.x == null || n.y == null) continue
      if (n.x < minX) minX = n.x
      if (n.y < minY) minY = n.y
      if (n.x > maxX) maxX = n.x
      if (n.y > maxY) maxY = n.y
    }
    if (!isFinite(minX)) return

    // Pad the bbox so nodes have breathing room from the viewport edge.
    const pad = 80
    minX -= pad
    minY -= pad
    maxX += pad
    maxY += pad
    const bw = Math.max(1, maxX - minX)
    const bh = Math.max(1, maxY - minY)
    const targetScale = Math.min(PG_VB_W / bw, PG_VB_H / bh, 1)
    const bcx = (minX + maxX) / 2
    const bcy = (minY + maxY) / 2
    const targetX = PG_VB_W / 2 - bcx * targetScale
    const targetY = PG_VB_H / 2 - bcy * targetScale

    // Smooth lerp so the camera never snaps.
    const cam = cameraRef.current
    const k = 0.04
    cam.x += (targetX - cam.x) * k
    cam.y += (targetY - cam.y) * k
    cam.scale += (targetScale - cam.scale) * k

    const g = cameraGroupRef.current
    if (g) {
      g.setAttribute(
        "transform",
        `translate(${cam.x.toFixed(2)},${cam.y.toFixed(2)}) scale(${cam.scale.toFixed(4)})`,
      )
    }
    // Suppress unused-arg lint when byId arg goes unused in future tweaks.
    void byId
  }

  // Re-target forces on each state change. Uses d3's built-in forceX/forceY
  // for cluster behavior — fast, well-tested, no custom code.
  useEffect(() => {
    const sim = simRef.current
    if (!sim) return
    // Always clear previous cluster forces first.
    sim.force("cluster-x", null)
    sim.force("cluster-y", null)

    if (state === 0) {
      sim.alpha(0).stop()
      return
    }

    if (state === 1) {
      // Lattice radiates from YO. Default link/charge from init are good.
      sim
        .force(
          "link",
          forceLink<SimNode, SimEdge>(edgesRef.current)
            .id((n) => (n as SimNode).id)
            .distance((l) => {
              const tgt = l.target as SimNode
              return tgt.id === "yo" ? 200 : 110
            })
            .strength(0.35),
        )
        .force(
          "charge",
          forceManyBody<SimNode>().strength((n) =>
            (n as SimNode).kind === "interest" ? -150 : -300,
          ),
        )
    } else if (state === 2 || state === 3) {
      // People cluster into their Venn region; YO link relaxes a little.
      sim
        .force(
          "link",
          forceLink<SimNode, SimEdge>(edgesRef.current)
            .id((n) => (n as SimNode).id)
            .distance((l) => {
              const tgt = l.target as SimNode
              return tgt.id === "yo" ? 230 : 130
            })
            .strength(0.1),
        )
        .force(
          "charge",
          forceManyBody<SimNode>().strength((n) =>
            (n as SimNode).kind === "interest" ? -90 : -180,
          ),
        )
        .force(
          "cluster-x",
          forceX<SimNode>((n) =>
            n.kind === "person" && n.vennCluster != null
              ? PG_VENN_2[n.vennCluster].x
              : 0,
          ).strength((n) =>
            n.kind === "person" && n.vennCluster != null ? 0.18 : 0,
          ),
        )
        .force(
          "cluster-y",
          forceY<SimNode>((n) =>
            n.kind === "person" && n.vennCluster != null
              ? PG_VENN_2[n.vennCluster].y
              : 0,
          ).strength((n) =>
            n.kind === "person" && n.vennCluster != null ? 0.18 : 0,
          ),
        )
    } else if (state === 4) {
      // People drag into IRL event zones; drop the YO links so they're free.
      sim
        .force(
          "link",
          forceLink<SimNode, SimEdge>([]).id((n) => (n as SimNode).id),
        )
        .force(
          "charge",
          forceManyBody<SimNode>().strength((n) =>
            (n as SimNode).kind === "interest" ? -70 : -160,
          ),
        )
        .force(
          "cluster-x",
          forceX<SimNode>((n) =>
            n.kind === "person" && n.irlZone != null
              ? PG_EVENTS_2[n.irlZone].x
              : 0,
          ).strength((n) =>
            n.kind === "person" && n.irlZone != null ? 0.25 : 0,
          ),
        )
        .force(
          "cluster-y",
          forceY<SimNode>((n) =>
            n.kind === "person" && n.irlZone != null
              ? PG_EVENTS_2[n.irlZone].y
              : 0,
          ).strength((n) =>
            n.kind === "person" && n.irlZone != null ? 0.25 : 0,
          ),
        )
    }

    sim.alpha(0.6).restart()
  }, [state])

  function getNode(id: string): SimNode | undefined {
    return nodesRef.current.find((n) => n.id === id)
  }

  function clientToSVG(
    clientX: number,
    clientY: number,
  ): [number, number] | null {
    const svg = svgRef.current
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const tr = pt.matrixTransform(ctm.inverse())
    return [tr.x, tr.y]
  }

  function onPointerDown(
    e: React.PointerEvent<SVGGElement>,
    id: string,
  ) {
    const node = getNode(id)
    if (!node || node.isYou) return
    const pt = clientToSVG(e.clientX, e.clientY)
    if (!pt) return
    dragRef.current = { id }
    e.currentTarget.setPointerCapture(e.pointerId)
    node.fx = pt[0]
    node.fy = pt[1]
    simRef.current?.alphaTarget(0.3).restart()
  }
  function onPointerMove(e: React.PointerEvent<SVGGElement>) {
    if (!dragRef.current) return
    const node = getNode(dragRef.current.id)
    if (!node) return
    const pt = clientToSVG(e.clientX, e.clientY)
    if (!pt) return
    node.fx = pt[0]
    node.fy = pt[1]
  }
  function onPointerUp() {
    if (!dragRef.current) return
    const node = getNode(dragRef.current.id)
    if (node) {
      node.fx = null
      node.fy = null
    }
    dragRef.current = null
    simRef.current?.alphaTarget(0)
  }

  const yoOpacity = state === 4 ? 0 : showPeople ? 1 : 0

  // Initial seed positions used only for first paint; the tick handler then
  // updates the DOM directly via refs.
  function initialPos(id: string): [number, number] {
    const n = getNode(id)
    return [n?.x ?? PG_CX, n?.y ?? PG_CY]
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${PG_VB_W} ${PG_VB_H}`}
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <defs>
        <radialGradient id="pg2-you-grad" cx="0.4" cy="0.4">
          <stop offset="0%" stopColor="#FCD8B0" />
          <stop offset="100%" stopColor={P.primary} />
        </radialGradient>
        <filter id="pg2-glow">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <style>{`
          @keyframes pg2-spawn {
            0%   { opacity: 0; transform: scale(0.2); }
            70%  { opacity: 1; transform: scale(1.08); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes pg2-line-draw {
            0%   { stroke-dashoffset: 600; opacity: 0; }
            10%  { opacity: 1; }
            100% { stroke-dashoffset: 0; opacity: 1; }
          }
          @keyframes pg2-line-pulse {
            0%, 100% { opacity: 0.25; }
            50%      { opacity: 0.55; }
          }
          @keyframes pg-spawn-fade {
            0%   { opacity: 0; }
            100% { opacity: 1; }
          }
        `}</style>
      </defs>

      {/* CAMERA — wraps everything that should auto-zoom-to-fit. The transform
          is updated each tick by updateCamera() to keep all nodes visible. */}
      <g ref={cameraGroupRef}>

      {/* Venn regions (states 2 + 3). Music label sits BELOW its circle so it
          doesn't collide with the centered YO node. */}
      <g
        style={{
          opacity: showVenn ? 1 : 0,
          transition: "opacity 0.7s ease",
        }}
      >
        {PG_VENN_2.map((v) => {
          const labelBelow = v.label === "music"
          const markY = labelBelow ? v.y + v.r - 50 : v.y - v.r + 30
          const txtY = labelBelow ? v.y + v.r - 26 : v.y - v.r + 54
          return (
            <g key={v.label}>
              <circle
                cx={v.x}
                cy={v.y}
                r={v.r}
                fill={`${v.fill}33`}
                stroke={P.muted}
                strokeOpacity={0.4}
                strokeWidth={1.4}
                strokeDasharray="5 5"
              />
              <text
                x={v.x}
                y={markY}
                textAnchor="middle"
                fontSize="26"
              >
                {v.mark}
              </text>
              <text
                x={v.x}
                y={txtY}
                textAnchor="middle"
                fontSize="14"
                fontFamily="ui-monospace, monospace"
                fill={P.muted}
                letterSpacing="2"
              >
                {v.label.toUpperCase()}
              </text>
            </g>
          )
        })}
      </g>

      {/* Event zones (state 4) */}
      <g
        style={{
          opacity: showEvents ? 1 : 0,
          transition: "opacity 0.7s ease",
        }}
      >
        {PG_EVENTS_2.map((z) => (
          <g key={z.label}>
            <rect
              x={z.x - 140}
              y={150}
              width={280}
              height={300}
              rx={28}
              fill={`${z.color}25`}
              stroke={z.color}
              strokeOpacity={0.6}
              strokeWidth={1.6}
              strokeDasharray="6 6"
            />
            <text
              x={z.x}
              y={205}
              textAnchor="middle"
              fontSize="44"
            >
              {z.mark}
            </text>
            <text
              x={z.x}
              y={240}
              textAnchor="middle"
              fontSize="14"
              fontFamily="ui-monospace, monospace"
              fill={P.text}
              letterSpacing="2"
            >
              {z.label.toUpperCase()}
            </text>
          </g>
        ))}
      </g>

      {/* Spine lines — person → YO. Endpoints written imperatively. */}
      <g
        style={{
          opacity: showInterests ? (interestsDim ? 0.35 : 1) : 0,
          transition: "opacity 0.6s ease",
        }}
      >
        {showPeople &&
          PG_PEOPLE_2.map((p, idx) => {
            const [px, py] = initialPos(p.id)
            const pulseDelay = (idx * 0.13).toFixed(2)
            return (
              <line
                key={`spine-${p.id}`}
                ref={(el) => {
                  if (el) spineLineRefs.current.set(p.id, el)
                }}
                x1={px}
                y1={py}
                x2={PG_CX}
                y2={PG_CY}
                stroke={P.primary}
                strokeWidth="2.2"
                strokeLinecap="round"
                style={{
                  animation: `pg2-line-pulse 2.4s ${pulseDelay}s ease-in-out infinite`,
                }}
              />
            )
          })}
      </g>

      {/* Thread lines — person → interest, one per (person, interest) pair. */}
      <g
        style={{
          opacity: showInterests ? (interestsDim ? 0.35 : 1) : 0,
          transition: "opacity 0.6s ease",
        }}
      >
        {showPeople &&
          PG_PERSON_INTEREST_PAIRS.map(([pid, iid], idx) => {
            const [px, py] = initialPos(pid)
            const [ix, iy] = initialPos(iid)
            const pulseDelay = (idx * 0.11 + 0.3).toFixed(2)
            return (
              <line
                key={`thread-${pid}-${iid}`}
                ref={(el) => {
                  if (el) threadLineRefs.current.set(`${pid}|${iid}`, el)
                }}
                x1={px}
                y1={py}
                x2={ix}
                y2={iy}
                stroke={P.success}
                strokeWidth="2.2"
                strokeLinecap="round"
                style={{
                  animation: `pg2-line-pulse 2.6s ${pulseDelay}s ease-in-out infinite`,
                }}
              />
            )
          })}
      </g>

      {/* Interest nodes — transforms updated imperatively by tickHandler. */}
      {showPeople &&
        PG_INTERESTS_2.map((it) => {
          const [ix, iy] = initialPos(it.id)
          return (
            <g
              key={it.id}
              ref={(el) => {
                if (el) nodeGroupRefs.current.set(it.id, el)
              }}
              transform={`translate(${ix},${iy})`}
              onPointerDown={(e) => onPointerDown(e, it.id)}
              style={{
                opacity: showInterests ? (interestsDim ? 0.3 : 1) : 0,
                transition: "opacity 0.6s ease",
                cursor: "grab",
                touchAction: "none",
              }}
            >
              <circle r="22" fill={P.elevated} stroke={P.success} strokeWidth="2" />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="22"
                fill={P.success}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {it.mark}
              </text>
            </g>
          )
        })}

      {/* YO node — pinned, no ref needed (transform never changes). */}
      <g
        transform={`translate(${PG_CX},${PG_CY})`}
        style={{
          opacity: yoOpacity,
          transition: "opacity 0.6s ease",
        }}
      >
        <circle r="46" fill="url(#pg2-you-grad)" filter="url(#pg2-glow)" />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="17"
          fontWeight={700}
          fill="white"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          YO
        </text>
      </g>

      {/* People nodes — transforms updated imperatively. CSS spawn-stagger
          on state 1 entry; otherwise just visible. */}
      {showPeople &&
        PG_PEOPLE_2.map((p) => {
          const [x, y] = initialPos(p.id)
          return (
            <g
              key={p.id}
              ref={(el) => {
                if (el) nodeGroupRefs.current.set(p.id, el)
              }}
              transform={`translate(${x},${y})`}
              onPointerDown={(e) => onPointerDown(e, p.id)}
              style={{
                cursor: "grab",
                touchAction: "none",
                animation:
                  state === 1
                    ? `pg-spawn-fade 0.5s ${p.spawnDelay}s ease-out both`
                    : undefined,
              }}
            >
              <circle
                r="30"
                fill={p.color}
                stroke={P.elevated}
                strokeWidth="2.6"
                filter="url(#pg2-glow)"
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="15"
                fontWeight={700}
                fill={P.text}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {p.label}
              </text>
            </g>
          )
        })}

      {/* state 0 — YOU + posts orbiting + DELETED bin (no graph behind) */}
      <g
        style={{
          opacity: showCenterYou ? 1 : 0,
          transition: "opacity 0.5s ease",
        }}
      >
        <g transform={`translate(${PG_CX}, ${PG_CY})`}>
          <circle r="52" fill="url(#pg2-you-grad)" filter="url(#pg2-glow)" />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="16"
            fontWeight={700}
            fill="white"
          >
            YOU
          </text>
        </g>
      </g>

      <g
        style={{
          opacity: showPosts ? 1 : 0,
          transition: "opacity 0.4s ease",
        }}
      >
        {PG_POSTS_2.map((post, i) => {
          const rad = (post.angle * Math.PI) / 180
          const r = 220
          const startX = PG_CX + Math.cos(rad) * r
          const startY = PG_CY + Math.sin(rad) * r
          const binX = PG_VB_W - 110
          const binY = PG_VB_H - 90
          // Phone-aspect rectangles for the artifact images.
          const w = 88
          const h = 132
          return (
            <g key={`post-${i}`}>
              <style>{`
                @keyframes pg2-suck-${i} {
                  0%   { transform: translate(${startX}px, ${startY}px) scale(1); opacity: 1; }
                  55%  { transform: translate(${startX}px, ${startY}px) scale(1); opacity: 1; }
                  85%  { transform: translate(${(startX + binX) / 2}px, ${(startY + binY) / 2}px) scale(0.45); opacity: 0.85; }
                  100% { transform: translate(${binX}px, ${binY}px) scale(0.08); opacity: 0; }
                }
              `}</style>
              <g
                style={{
                  animation:
                    state === 0
                      ? `pg2-suck-${i} 5s ${i * 0.45}s ease-in-out infinite`
                      : undefined,
                }}
              >
                <rect
                  x={-w / 2}
                  y={-h / 2}
                  width={w}
                  height={h}
                  rx="8"
                  fill={P.elevated}
                  stroke={P.muted}
                  strokeOpacity="0.5"
                />
                <image
                  href={post.src}
                  x={-w / 2 + 3}
                  y={-h / 2 + 3}
                  width={w - 6}
                  height={h - 6}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`inset(0 round 6px)`}
                  aria-hidden
                />
              </g>
            </g>
          )
        })}

        {/* bin */}
        <g transform={`translate(${PG_VB_W - 110}, ${PG_VB_H - 90})`}>
          <rect
            x="-32"
            y="-22"
            width="64"
            height="54"
            rx="6"
            fill="none"
            stroke={P.primary}
            strokeWidth="2.8"
          />
          <line x1="-36" y1="-28" x2="36" y2="-28" stroke={P.primary} strokeWidth="2.8" />
          <line x1="-12" y1="-28" x2="-12" y2="-36" stroke={P.primary} strokeWidth="2.8" />
          <line x1="12" y1="-28" x2="12" y2="-36" stroke={P.primary} strokeWidth="2.8" />
          <text
            x="0"
            y="58"
            textAnchor="middle"
            fontSize="13"
            fontFamily="ui-monospace, monospace"
            fill={P.primary}
            letterSpacing="2"
          >
            DELETED
          </text>
        </g>
      </g>

      {/* state 3 — businesses talk to communities */}
      <g
        style={{
          opacity: showBusinesses ? 1 : 0,
          transition: "opacity 0.5s ease",
        }}
      >
        {PG_BUSINESSES_2.map((b, i) => (
          <g key={b.label}>
            <g transform={`translate(${b.x}, ${b.y})`}>
              <rect
                x="-70"
                y="-34"
                width="140"
                height="68"
                rx="12"
                fill={P.elevated}
                stroke={P.primary}
                strokeWidth="1.6"
              />
              <image
                href={b.icon}
                x="-52"
                y="-22"
                width="104"
                height="44"
                preserveAspectRatio="xMidYMid meet"
                aria-label={b.label}
              />
            </g>
            <style>{`
              @keyframes pg2-mail-${i} {
                0%   { transform: translate(${b.x}px, ${b.y}px); opacity: 0; }
                10%  { transform: translate(${b.x}px, ${b.y}px); opacity: 1; }
                90%  { transform: translate(${b.target.x}px, ${b.target.y}px); opacity: 1; }
                100% { transform: translate(${b.target.x}px, ${b.target.y}px); opacity: 0; }
              }
            `}</style>
            <g
              style={{
                animation:
                  state === 3
                    ? `pg2-mail-${i} 3.2s ${i * 0.55}s ease-in-out infinite`
                    : undefined,
              }}
            >
              <rect x="-15" y="-11" width="30" height="22" rx="3" fill={P.primary} />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="14"
                fill={P.elevated}
              >
                ✉
              </text>
            </g>
          </g>
        ))}
      </g>

      </g>{/* end CAMERA */}
    </svg>
  )
}

/* ----------------------------------------------------------------- */
/* problems slide — five problems + scattered social-media icons      */
/* ----------------------------------------------------------------- */

const PROBLEMS: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "Content machines.",
    body: "Engineered to dopamine-hack you and harvest hours.",
  },
  {
    n: "02",
    title: "They don't foster friendships.",
    body: "Followers and likes — none of which is a real bond.",
  },
  {
    n: "03",
    title: "They don't build communities.",
    body: "A timeline isn't a community. It's a queue.",
  },
  {
    n: "04",
    title: "They don't respect privacy.",
    body: "Your identity is the inventory. Behavioural data is the product.",
  },
  {
    n: "05",
    title: "They don't get you off the screen.",
    body: "Every metric is built to keep you in. None to send you out.",
  },
]

type SocialIcon = {
  label: string
  src: string
  x: number
  y: number
  rot: number
  size: number
}

const SOCIAL_ICONS: SocialIcon[] = [
  { label: "Facebook",  src: "/images/icons/facebook.png",  x: 6,  y: 8,  rot: -8,  size: 72 },
  { label: "Instagram", src: "/images/icons/instagram.png", x: 86, y: 6,  rot: 6,   size: 76 },
  { label: "Snapchat",  src: "/images/icons/snapchat.png",  x: 14, y: 44, rot: -6,  size: 58 },
  { label: "TikTok",    src: "/images/icons/tik-tok.png",   x: 92, y: 80, rot: -10, size: 64 },
  { label: "Snapchat 2", src: "/images/icons/snapchat.png", x: 4,  y: 78, rot: 12,  size: 60 },
  { label: "Instagram 2", src: "/images/icons/instagram.png", x: 82, y: 50, rot: 10, size: 60 },
  { label: "Facebook 2", src: "/images/icons/facebook.png", x: 50, y: 4,  rot: 4,   size: 52 },
  { label: "TikTok 2",   src: "/images/icons/tik-tok.png",   x: 50, y: 90, rot: -4,  size: 54 },
  { label: "Facebook 3", src: "/images/icons/facebook.png", x: 28, y: 16, rot: 6,   size: 46 },
  { label: "Instagram 3", src: "/images/icons/instagram.png", x: 72, y: 22, rot: -8, size: 50 },
]

function ProblemsSlide() {
  return (
    <div className="relative w-full max-w-7xl">
      {/* scattered icon decorations */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {SOCIAL_ICONS.map((ic, i) => (
          <div
            key={`${ic.label}-${i}`}
            className="absolute overflow-hidden rounded-2xl"
            style={{
              left: `${ic.x}%`,
              top: `${ic.y}%`,
              width: ic.size,
              height: ic.size,
              transform: `translate(-50%, -50%) rotate(${ic.rot}deg)`,
              backgroundColor: P.elevated,
              border: `1px solid ${P.muted}33`,
              boxShadow: `0 12px 32px -22px ${P.text}66`,
              opacity: 0.7,
              animation: `ppt-fade-up 0.8s ${0.05 * i}s ease-out both, ppt-pulse-line ${5 + i * 0.4}s ${i * 0.2}s ease-in-out infinite`,
            }}
            aria-hidden
          >
            <img
              src={ic.src}
              alt=""
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                padding: ic.size * 0.18,
              }}
            />
          </div>
        ))}
      </div>

      <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center gap-8 text-center">
        <FadeUp delay={0.05}>
          <Kicker>the five problems</Kicker>
        </FadeUp>
        <FadeUp delay={0.18}>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: "clamp(40px, 5.4vw, 76px)",
              lineHeight: 1.0,
              letterSpacing: "-0.03em",
              color: P.text,
            }}
          >
            Today&rsquo;s social apps are{" "}
            <span style={{ color: P.primary, fontStyle: "italic" }}>
              not built for you.
            </span>
          </h2>
        </FadeUp>

        <div
          className="grid w-full gap-3 pt-2"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
        >
          {PROBLEMS.map((p, i) => (
            <FadeUp key={p.n} delay={0.4 + i * 0.07}>
              <div
                className="flex h-full flex-col items-start gap-2 rounded-xl border p-4 text-left"
                style={{
                  borderColor: `${P.muted}55`,
                  backgroundColor: `${P.elevated}f2`,
                  backdropFilter: "blur(2px)",
                }}
              >
                <div
                  className="font-mono text-[10px] tracking-[0.3em] uppercase"
                  style={{ color: P.primary }}
                >
                  {p.n}
                </div>
                <div
                  className="text-base leading-tight md:text-lg"
                  style={{
                    color: P.text,
                    fontFamily: SERIF,
                    fontWeight: 600,
                  }}
                >
                  {p.title}
                </div>
                <div
                  className="text-xs md:text-sm"
                  style={{ color: P.text, opacity: 0.7, lineHeight: 1.4 }}
                >
                  {p.body}
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- */
/* feature inventory slides — consumer / business / child-protection */
/* ----------------------------------------------------------------- */

type FeatureItem = { name: string; body: string }

function FeatureInventorySlide({
  kicker,
  headline,
  highlight,
  items,
  cols = 3,
}: {
  kicker: string
  headline: string
  highlight: string
  items: FeatureItem[]
  cols?: number
}) {
  return (
    <div className="flex w-full max-w-7xl flex-col gap-6">
      <FadeUp delay={0.05}>
        <Kicker>{kicker}</Kicker>
      </FadeUp>
      <FadeUp delay={0.18}>
        <h2
          style={{
            fontFamily: SERIF,
            fontSize: "clamp(40px, 5.2vw, 72px)",
            lineHeight: 1.0,
            letterSpacing: "-0.03em",
            color: P.text,
          }}
        >
          {headline}{" "}
          <span style={{ color: P.primary, fontStyle: "italic" }}>
            {highlight}
          </span>
        </h2>
      </FadeUp>
      <div
        className="grid gap-4 pt-3"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        }}
      >
        {items.map((it, i) => (
          <FadeUp key={it.name} delay={0.3 + i * 0.04}>
            <div
              className="h-full rounded-xl border p-5"
              style={{
                borderColor: `${P.muted}44`,
                backgroundColor: P.elevated,
              }}
            >
              <div
                className="mb-1.5 text-[22px] leading-tight"
                style={{ color: P.text, fontFamily: SERIF, fontWeight: 600 }}
              >
                {it.name}
              </div>
              <div
                className="text-base leading-snug"
                style={{ color: P.text, opacity: 0.78 }}
              >
                {it.body}
              </div>
            </div>
          </FadeUp>
        ))}
      </div>
    </div>
  )
}

const CONSUMER_FEATURES: FeatureItem[] = [
  { name: "Friend network", body: "Add, manage, tier friends — close vs regular." },
  { name: "Direct messages", body: "1:1 chats with friends and the homie AI." },
  { name: "Group chats", body: "Up to 15 members, with admin controls." },
  { name: "Voice calling", body: "VAPI-powered live voice with friends." },
  { name: "Communities", body: "Discover, join, create — by interest or location." },
  { name: "Posts, polls, events", body: "Announce, vote, plan inside any community." },
  { name: "Spotify integration", body: "Now-playing feed; tastes auto-populated." },
  { name: "Media profile", body: "Music, films, books, games, anime — provider-backed." },
  { name: "Coupons & offers", body: "Save and redeem deals from your communities." },
  { name: "Profile & visibility", body: "Interests, status, location, workplace — your call." },
  { name: "Notifications", body: "Real-time: requests, invites, messages, events." },
  { name: "Discover by interest", body: "Find people via what they actually love." },
]

const BUSINESS_FEATURES: FeatureItem[] = [
  { name: "Business account", body: "Claim a profile — category, contact, tagline." },
  { name: "Branches & locations", body: "Multiple outlets, services, hours per location." },
  { name: "Org communities", body: "Internal channels for team-only conversation." },
  { name: "Team voice chat", body: "VAPI calls inside the company channel." },
  { name: "Ad campaigns", body: "Compose, submit for approval, schedule." },
  { name: "Coupons & promos", body: "Targeted to communities, not random feeds." },
  { name: "Ad analytics", body: "Impressions, clicks, coupon saves, redemptions." },
  { name: "Summary metrics", body: "Aggregate performance across active campaigns." },
  { name: "Team & roles", body: "Add employees / managers with scoped access." },
  { name: "Deep-link pages", body: "Shareable slugs gated to verified members." },
]

const CHILD_FEATURES: FeatureItem[] = [
  { name: "Parental child accounts", body: "Create and manage minors with guardian controls." },
  { name: "Multi-guardian", body: "Co-parents and approved guardians can co-manage." },
  { name: "Spouse linking", body: "Connect spouse for shared calendar visibility." },
  { name: "Night-lock", body: "Restrict messaging to close circle during sleep hours." },
  { name: "Content limits", body: "Block specific users and communities per child." },
  { name: "Cross-age gating", body: "Approve age-mismatched friendships explicitly." },
  { name: "Account lockdown", body: "Disable messaging instantly in high-risk moments." },
  { name: "Audit & alerts", body: "Parents see every friendship and permission change." },
]

function ConsumerFeaturesSlide() {
  return (
    <FeatureInventorySlide
      kicker="for everyone"
      headline="Built so the people you know"
      highlight="can be known better."
      items={CONSUMER_FEATURES}
      cols={3}
    />
  )
}

function BusinessFeaturesSlide() {
  return (
    <FeatureInventorySlide
      kicker="for businesses"
      headline="Reach communities,"
      highlight="not individual identities."
      items={BUSINESS_FEATURES}
      cols={3}
    />
  )
}

function ChildProtectionSlide() {
  return (
    <FeatureInventorySlide
      kicker="for parents"
      headline="A social app"
      highlight="parents actually want their kids on."
      items={CHILD_FEATURES}
      cols={2}
    />
  )
}

function FeaturesSlide({ subIdx }: { subIdx: number }) {
  // selected card: subIdx -1 → 0, subIdx 0 → 1, ..., subIdx 4 → 5
  const selected = Math.max(0, Math.min(FEATURES.length - 1, subIdx + 1))
  const active = FEATURES[selected]

  return (
    <div
      className="grid w-full max-w-7xl items-start gap-8"
      style={{ gridTemplateColumns: "320px minmax(0, 1fr)" }}
    >
      {/* LEFT COLUMN: kicker + counter on top, then 6 cards. Fixed in place. */}
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <Kicker>what homie does</Kicker>
          <div
            className="font-mono text-xs tracking-[0.3em] uppercase"
            style={{ color: P.muted }}
          >
            {String(selected + 1).padStart(2, "0")} /{" "}
            {String(FEATURES.length).padStart(2, "0")}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {FEATURES.map((f, i) => {
            const isActive = i === selected
            return (
              <button
                key={f.id}
                onClick={() => {}}
                className="rounded-xl border px-4 py-3 text-left transition-all"
                style={{
                  borderColor: isActive ? P.primary : `${P.muted}44`,
                  backgroundColor: isActive
                    ? `${P.primary}10`
                    : P.elevated,
                  boxShadow: isActive
                    ? `0 8px 24px -16px ${P.primary}88`
                    : "none",
                  transform: isActive
                    ? "translateX(4px)"
                    : "translateX(0)",
                }}
              >
                <div
                  className="font-mono text-[10px] tracking-[0.3em] uppercase"
                  style={{ color: isActive ? P.primary : P.muted }}
                >
                  {f.cat}
                </div>
                <div
                  className="mt-1 text-sm font-semibold leading-snug"
                  style={{
                    color: P.text,
                    fontFamily: SERIF,
                    opacity: isActive ? 1 : 0.75,
                  }}
                >
                  {f.title.replace(/\.$/, "")}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* RIGHT COLUMN: header + visualizer. Height grows/shrinks with content. */}
      <div
        key={active.id}
        className="flex flex-col gap-4"
        style={{ animation: "ppt-fade-up 0.5s ease-out both" }}
      >
        <div
          className="font-mono text-xs tracking-[0.3em] uppercase"
          style={{ color: P.primary }}
        >
          {active.cat}
        </div>
        <h3
          style={{
            fontFamily: SERIF,
            fontSize: "clamp(36px, 4.6vw, 60px)",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            color: P.text,
          }}
        >
          {active.title}
        </h3>
        <p
          className="max-w-2xl text-base md:text-lg"
          style={{ color: P.text, opacity: 0.8 }}
        >
          {active.body}
        </p>
        <div
          className="mt-2 rounded-2xl border"
          style={{
            borderColor: `${P.muted}33`,
            backgroundColor: P.elevated,
            height: 580,
            overflow: "hidden",
          }}
        >
          <FeatureVisualizer id={active.id} />
        </div>
      </div>
    </div>
  )
}

/* feature visualizers ---------------------------------------------- */

function FeatureVisualizer({ id }: { id: string }) {
  switch (id) {
    case "music":
      return <MusicViz />
    case "foodie":
      return <FoodieViz />
    case "movie":
      return <MovieViz />
    case "gc":
      return <GCViz />
    case "run":
      return <RunClubViz />
    case "kids":
      return <KidModeViz />
    default:
      return null
  }
}

function MusicViz() {
  const songs = [
    { title: "folklore", artist: "Taylor Swift", liker: "Maya", color: "#A8C5B0" },
    { title: "Currents", artist: "Tame Impala", liker: "Sam", color: "#A5B5D4" },
    { title: "Blonde", artist: "Frank Ocean", liker: "Jordan", color: "#E8B784" },
    { title: "Channel Orange", artist: "Frank Ocean", liker: "Priya", color: "#D4A5A5" },
    { title: "Melodrama", artist: "Lorde", liker: "Riley", color: "#D4C5A5" },
  ]
  return (
    <div className="flex h-full flex-col justify-center gap-2 p-4">
      {songs.map((s, i) => (
        <div
          key={s.title}
          className="flex items-center gap-3 rounded-lg border px-3 py-2"
          style={{
            borderColor: `${P.muted}33`,
            backgroundColor: `${P.bg}80`,
            animation: `ppt-fade-up 0.5s ${0.1 + i * 0.08}s ease-out both`,
          }}
        >
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded font-bold"
            style={{
              background: `linear-gradient(135deg, ${s.color}, ${P.primary})`,
              color: P.bg,
              fontSize: 18,
            }}
          >
            ♫
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="truncate font-semibold"
              style={{ color: P.text, fontFamily: SERIF, fontSize: 20 }}
            >
              {s.title}
            </div>
            <div
              className="truncate"
              style={{ color: P.muted, fontSize: 14 }}
            >
              {s.artist}
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: s.color,
                animation: `ppt-pulse-line 2.4s ${i * 0.2}s ease-in-out infinite`,
              }}
            />
            <span style={{ color: P.text, fontWeight: 600, fontSize: 15 }}>
              {s.liker}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function FoodieViz() {
  const pins = [
    { x: 28, y: 35, person: "Maya", color: "#A8C5B0", name: "Bombay Café" },
    { x: 58, y: 22, person: "Jordan", color: "#E8B784", name: "Tanzo" },
    { x: 72, y: 58, person: "Priya", color: "#D4A5A5", name: "Hosa" },
    { x: 38, y: 68, person: "Alex", color: "#C5A5D4", name: "Naru" },
    { x: 84, y: 38, person: "Sam", color: "#A5B5D4", name: "Kofi & Co" },
  ]
  return (
    <div className="flex h-full">
      <div className="relative flex-1">
        <svg
          viewBox="0 0 100 100"
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <rect x="0" y="0" width="100" height="100" fill={`${P.bg}cc`} />
          <line x1="0" y1="50" x2="100" y2="50" stroke={`${P.muted}55`} strokeWidth="0.6" />
          <line x1="50" y1="0" x2="50" y2="100" stroke={`${P.muted}55`} strokeWidth="0.6" />
          <line x1="20" y1="0" x2="20" y2="100" stroke={`${P.muted}33`} strokeWidth="0.4" />
          <line x1="80" y1="0" x2="80" y2="100" stroke={`${P.muted}33`} strokeWidth="0.4" />
          <line x1="0" y1="25" x2="100" y2="25" stroke={`${P.muted}33`} strokeWidth="0.4" />
          <line x1="0" y1="75" x2="100" y2="75" stroke={`${P.muted}33`} strokeWidth="0.4" />
          {[
            [5, 5, 14, 19], [25, 5, 24, 19], [55, 5, 24, 19], [85, 5, 14, 19],
            [5, 30, 14, 19], [25, 30, 24, 19], [55, 30, 24, 19], [85, 30, 14, 19],
            [5, 55, 14, 19], [25, 55, 24, 19], [55, 55, 24, 19], [85, 55, 14, 19],
            [5, 80, 14, 19], [25, 80, 24, 19], [55, 80, 24, 19], [85, 80, 14, 19],
          ].map(([x, y, w, h], i) => (
            <rect
              key={i}
              x={x}
              y={y}
              width={w}
              height={h}
              rx={1}
              fill={`${P.muted}10`}
            />
          ))}
          {pins.map((p, i) => (
            <g
              key={p.person}
              style={{
                transformOrigin: `${p.x}px ${p.y}px`,
                animation: `ppt-fade-up 0.5s ${0.15 + i * 0.1}s ease-out both`,
              }}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r="2.6"
                fill={p.color}
                stroke={P.bg}
                strokeWidth="0.4"
              />
              <circle
                cx={p.x}
                cy={p.y}
                r="4"
                fill={p.color}
                opacity="0.25"
                style={{
                  transformOrigin: `${p.x}px ${p.y}px`,
                  animation: `ppt-ping-soft ${2.4 + i * 0.2}s ease-out infinite`,
                }}
              />
            </g>
          ))}
        </svg>
      </div>
      <div
        className="flex w-52 flex-shrink-0 flex-col justify-center gap-3 border-l px-4 py-3"
        style={{ borderColor: `${P.muted}33` }}
      >
        <div
          className="font-mono tracking-[0.3em] uppercase"
          style={{ color: P.muted, fontSize: 11 }}
        >
          recs from
        </div>
        {pins.map((p) => (
          <div key={p.person} className="flex items-center gap-2.5">
            <span
              className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <div className="min-w-0">
              <div
                className="font-semibold"
                style={{ color: P.text, fontSize: 16 }}
              >
                {p.person}
              </div>
              <div
                className="truncate"
                style={{ color: P.muted, fontSize: 13 }}
              >
                {p.name}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MovieViz() {
  const people = [
    { x: 14, y: 16, name: "Maya", color: "#A8C5B0", taste: "indie / drama" },
    { x: 86, y: 16, name: "Jordan", color: "#E8B784", taste: "sci-fi" },
    { x: 14, y: 84, name: "Priya", color: "#D4A5A5", taste: "literary" },
    { x: 86, y: 84, name: "Alex", color: "#C5A5D4", taste: "mind-bender" },
  ]
  return (
    <div className="relative h-full">
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* arrows */}
        {people.map((p, i) => {
          const cx = 50
          const cy = 50
          const sign = p.x < 50 ? 1 : -1
          return (
            <line
              key={`arrow-${p.name}`}
              x1={p.x + 7 * sign}
              y1={p.y + (p.y < 50 ? 5 : -5)}
              x2={cx - 17 * sign}
              y2={cy + (p.y < 50 ? -8 : 8)}
              stroke={p.color}
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeDasharray="2.5 2.5"
              style={{
                animation: `ppt-pulse-line ${2.4 + i * 0.3}s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          )
        })}
        {/* center box */}
        <rect
          x="32"
          y="37"
          width="36"
          height="26"
          rx="3"
          fill={P.elevated}
          stroke={P.primary}
          strokeWidth="1.4"
        />
        <text
          x="50"
          y="44"
          textAnchor="middle"
          fontSize="3.4"
          fontFamily="ui-monospace, monospace"
          fontWeight={700}
          fill={P.muted}
          letterSpacing="0.4"
        >
          TASTE BLEND
        </text>
        <text
          x="50"
          y="55"
          textAnchor="middle"
          fontSize="7"
          fontWeight={700}
          fill={P.primary}
          fontFamily={SERIF}
        >
          Arrival
        </text>
        <text
          x="50"
          y="60"
          textAnchor="middle"
          fontSize="3.4"
          fill={P.muted}
        >
          Villeneuve, 2016
        </text>
        {/* people corners */}
        {people.map((p) => (
          <g key={p.name}>
            <circle cx={p.x} cy={p.y} r="6.5" fill={p.color} />
            <text
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="4.4"
              fontWeight={700}
              fontFamily={SERIF}
              fill={P.text}
            >
              {p.name.slice(0, 2).toUpperCase()}
            </text>
            <text
              x={p.x}
              y={p.y + (p.y < 50 ? 11.5 : -9.5)}
              textAnchor="middle"
              fontSize="3.4"
              fontFamily="ui-monospace, monospace"
              fill={P.muted}
            >
              {p.taste}
            </text>
          </g>
        ))}
        {/* highlight ring */}
        <circle
          cx="50"
          cy="50"
          r="22"
          fill="none"
          stroke={P.primary}
          strokeWidth="0.5"
          opacity="0.5"
          style={{
            transformOrigin: "50px 50px",
            animation: "ppt-ping-soft 2.6s ease-out infinite",
          }}
        />
      </svg>
    </div>
  )
}

function GCViz() {
  const people = [
    { x: 18, y: 26, name: "Maya", color: "#A8C5B0" },
    { x: 78, y: 22, name: "Jordan", color: "#E8B784" },
    { x: 22, y: 76, name: "Priya", color: "#D4A5A5" },
    { x: 80, y: 78, name: "Alex", color: "#C5A5D4" },
  ]
  const venue = { x: 50, y: 50 }
  return (
    <div className="relative h-full">
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ overflow: "visible" }}
      >
        <rect x="0" y="0" width="100" height="100" fill={`${P.bg}cc`} />
        <line x1="0" y1="50" x2="100" y2="50" stroke={`${P.muted}40`} strokeWidth="0.5" />
        <line x1="50" y1="0" x2="50" y2="100" stroke={`${P.muted}40`} strokeWidth="0.5" />
        <line x1="25" y1="0" x2="25" y2="100" stroke={`${P.muted}25`} strokeWidth="0.3" />
        <line x1="75" y1="0" x2="75" y2="100" stroke={`${P.muted}25`} strokeWidth="0.3" />
        <line x1="0" y1="25" x2="100" y2="25" stroke={`${P.muted}25`} strokeWidth="0.3" />
        <line x1="0" y1="75" x2="100" y2="75" stroke={`${P.muted}25`} strokeWidth="0.3" />
        {people.map((p, i) => {
          const dx = venue.x - p.x
          const midX = p.x + dx * 0.6
          const path = `M ${p.x} ${p.y} L ${midX} ${p.y} L ${midX} ${venue.y} L ${venue.x} ${venue.y}`
          return (
            <path
              key={`nav-${p.name}`}
              d={path}
              fill="none"
              stroke={p.color}
              strokeWidth="0.9"
              strokeLinecap="round"
              strokeDasharray="40"
              style={{
                strokeDashoffset: 40,
                animation: `ppt-line-draw 1.4s ${0.2 + i * 0.25}s ease-out forwards`,
              }}
            />
          )
        })}
        {people.map((p, i) => (
          <g
            key={p.name}
            style={{ animation: `ppt-fade-up 0.5s ${i * 0.1}s ease-out both` }}
          >
            <circle cx={p.x} cy={p.y} r="3" fill={p.color} stroke={P.bg} strokeWidth="0.5" />
            <text
              x={p.x}
              y={p.y - 5}
              textAnchor="middle"
              fontSize="5.2"
              fontWeight={600}
              fontFamily={SERIF}
              fill={P.text}
            >
              {p.name}
            </text>
          </g>
        ))}
        <g style={{ animation: "ppt-fade-up 0.5s 1.2s ease-out both" }}>
          <circle
            cx={venue.x}
            cy={venue.y}
            r="7"
            fill={P.primary}
            opacity="0.2"
            style={{
              transformOrigin: `${venue.x}px ${venue.y}px`,
              animation: "ppt-ping-soft 2.6s ease-out infinite",
            }}
          />
          <path
            d={`M ${venue.x - 3} ${venue.y} A 3 3 0 1 1 ${venue.x + 3} ${venue.y} L ${venue.x} ${venue.y + 5.5} Z`}
            fill={P.primary}
          />
          <circle cx={venue.x} cy={venue.y - 0.5} r="1.1" fill={P.bg} />
        </g>
        <text
          x={venue.x}
          y={venue.y + 11}
          textAnchor="middle"
          fontSize="4.8"
          fontFamily={SERIF}
          fontWeight={700}
          fill={P.primary}
        >
          The Coffee Tree · 7pm
        </text>
      </svg>
    </div>
  )
}

function RunClubViz() {
  return (
    <div className="relative flex h-full items-center justify-center p-4">
      <video
        src="/video/Minimal_Animation_of_Running_Club.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="h-full max-h-[320px] w-auto rounded-lg"
        style={{ objectFit: "contain" }}
      />
    </div>
  )
}

function KidModeViz() {
  return (
    <div className="relative h-full">
      <svg
        viewBox="0 0 100 70"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ overflow: "visible" }}
      >
        {[20, 26, 32].map((r, i) => (
          <circle
            key={`ring-${i}`}
            cx="50"
            cy="35"
            r={r}
            fill="none"
            stroke={P.primary}
            strokeWidth="0.5"
            strokeDasharray="2.5 2.5"
            opacity={0.55 - i * 0.15}
            style={{
              transformOrigin: "50px 35px",
              animation: `ppt-ping-soft ${3 + i * 0.4}s ease-out infinite`,
            }}
          />
        ))}
        <g>
          {[
            { x: 43, y: 35, color: "#E8B784", label: "K1" },
            { x: 57, y: 35, color: "#A8C5B0", label: "K2" },
          ].map((k) => (
            <g key={k.label}>
              <circle
                cx={k.x}
                cy={k.y}
                r="5"
                fill={k.color}
                stroke={P.text}
                strokeWidth="0.4"
              />
              <text
                x={k.x}
                y={k.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="4.2"
                fontWeight={700}
                fill={P.text}
              >
                {k.label}
              </text>
            </g>
          ))}
        </g>
        {[
          { startX: 8, startY: 12, target: 38, targetY: 30, label: "ads", phase: 0 },
          { startX: 92, startY: 18, target: 64, targetY: 30, label: "stranger", phase: 1.0 },
          { startX: 14, startY: 58, target: 38, targetY: 42, label: "doomscroll", phase: 2.0 },
          { startX: 86, startY: 60, target: 64, targetY: 42, label: "pressure", phase: 3.0 },
        ].map((b, i) => (
          <g
            key={b.label}
            style={{
              animation: `ppt-fade-up 0.8s ${b.phase * 0.6}s ease-out both, ppt-pulse-line ${3 + i * 0.4}s ${b.phase * 0.6 + 0.8}s ease-in-out infinite`,
            }}
          >
            <circle
              cx={b.startX}
              cy={b.startY}
              r="3.6"
              fill={`${P.muted}55`}
              stroke={P.muted}
              strokeWidth="0.5"
            />
            <text
              x={b.startX}
              y={b.startY}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="3.4"
              fontWeight={600}
              fill={P.text}
              opacity="0.7"
            >
              ✕
            </text>
            <text
              x={b.startX}
              y={b.startY + 7}
              textAnchor="middle"
              fontSize="3.4"
              fill={P.muted}
              fontFamily="ui-monospace, monospace"
            >
              {b.label}
            </text>
            <line
              x1={b.startX}
              y1={b.startY}
              x2={b.target}
              y2={b.targetY}
              stroke={P.primary}
              strokeWidth="0.5"
              strokeDasharray="2 2"
              opacity="0.5"
            />
          </g>
        ))}
        <g>
          <text
            x="50"
            y="7"
            textAnchor="middle"
            fontSize="4.2"
            fontFamily="ui-monospace, monospace"
            fill={P.success}
            fontWeight={700}
            letterSpacing="0.4"
          >
            ⚐ PROTECTED
          </text>
        </g>
      </svg>
    </div>
  )
}

function GraphSlide() {
  return (
    <div className="grid w-full max-w-7xl items-center gap-12" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="flex flex-col gap-6">
        <FadeUp delay={0.05}>
          <Kicker>see your bonds</Kicker>
        </FadeUp>
        <FadeUp delay={0.2}>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: "clamp(44px, 5.8vw, 84px)",
              lineHeight: 1.0,
              letterSpacing: "-0.03em",
              color: P.text,
            }}
          >
            Your people.{" "}
            <span style={{ color: P.primary }}>
              Common ground, visible.
            </span>
          </h2>
        </FadeUp>
        <FadeUp delay={0.6}>
          <p
            className="max-w-md text-lg md:text-xl"
            style={{ color: P.text, opacity: 0.85 }}
          >
            Every bond you already have — labelled with what you actually share.
            A chat about <span style={{ color: P.secondary }}>folklore</span>{" "}
            never has to be the <em>first</em> chat about folklore.
          </p>
        </FadeUp>
      </div>
      {/* right half left empty for the persistent lattice */}
      <div />
    </div>
  )
}

function OverlapSlide() {
  return (
    <div className="flex w-full max-w-7xl flex-col gap-6" style={{ alignSelf: "flex-start", marginTop: "5%" }}>
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-3">
          <FadeUp delay={0.05}>
            <Kicker>shared taste · live</Kicker>
          </FadeUp>
          <FadeUp delay={0.2}>
            <h2
              style={{
                fontFamily: SERIF,
                fontSize: "clamp(44px, 5.6vw, 80px)",
                lineHeight: 1.0,
                letterSpacing: "-0.03em",
                color: P.text,
              }}
            >
              You & Priya{" "}
              <span style={{ color: P.primary }}>overlap on 3.</span>
            </h2>
          </FadeUp>
        </div>
        <FadeUp delay={0.5}>
          <span
            className="rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap"
            style={{ backgroundColor: P.success, color: P.bg }}
          >
            matched on real ids, not strings
          </span>
        </FadeUp>
      </div>
      {/* bottom area left empty for the persistent lattice */}
    </div>
  )
}

function CommunitySlide() {
  return (
    <div className="grid w-full max-w-7xl items-center gap-12" style={{ gridTemplateColumns: "1fr 1fr" }}>
      {/* left half left empty for the persistent lattice */}
      <div />
      <div className="flex flex-col gap-5">
        <FadeUp delay={0.05}>
          <Kicker>the community view</Kicker>
        </FadeUp>
        <FadeUp delay={0.2}>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: "clamp(40px, 5vw, 72px)",
              lineHeight: 1.0,
              letterSpacing: "-0.03em",
              color: P.text,
            }}
          >
            Your bonds,{" "}
            <span style={{ color: P.primary, fontStyle: "italic" }}>
              brighter.
            </span>
          </h2>
        </FadeUp>
        <FadeUp delay={0.55}>
          <p
            className="max-w-md text-base md:text-lg"
            style={{ color: P.text, opacity: 0.85 }}
          >
            More interests join. More threads form. The matrix on the right
            shows how the network{" "}
            <span style={{ color: P.secondary }}>stabilises</span> as bonds grow.
          </p>
        </FadeUp>
        <FadeUp delay={0.9}>
          <CrossMatrix />
        </FadeUp>
      </div>
    </div>
  )
}

function DemoSlide() {
  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-8 text-center">
      <FadeUp delay={0.05}>
        <Kicker>see it for yourself</Kicker>
      </FadeUp>
      <FadeUp delay={0.2}>
        <h2
          style={{
            fontFamily: SERIF,
            fontSize: "clamp(120px, 22vw, 320px)",
            lineHeight: 0.88,
            letterSpacing: "-0.05em",
            color: P.text,
          }}
        >
          <span style={{ color: P.primary, fontStyle: "italic" }}>demo.</span>
        </h2>
      </FadeUp>
    </div>
  )
}

function CloseSlide() {
  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-12 text-center">
      <FadeUp delay={0.05}>
        <Kicker>thank you</Kicker>
      </FadeUp>
      <FadeUp delay={0.2}>
        <h2
          style={{
            fontFamily: SERIF,
            fontSize: "clamp(80px, 14vw, 220px)",
            lineHeight: 0.88,
            letterSpacing: "-0.04em",
            color: P.text,
          }}
        >
          Make friends{" "}
          <span style={{ color: P.primary, fontStyle: "italic" }}>again.</span>
        </h2>
      </FadeUp>
      <FadeUp delay={0.8}>
        <div
          className="font-mono text-xs tracking-[0.4em] uppercase"
          style={{ color: P.muted }}
        >
          homie. — built for the meeting, not the scrolling.
        </div>
      </FadeUp>
    </div>
  )
}

/* ----------------------------------------------------------------- */
/* interactive stats slide                                           */
/* ----------------------------------------------------------------- */

function InteractiveStatsSlide({
  kicker,
  headline,
  body,
  attribution,
  cards,
  subIdx,
}: {
  kicker: string
  headline: React.ReactNode
  body: React.ReactNode
  attribution: string
  cards: CardData[]
  subIdx: number
}) {
  const expanded = subIdx >= 0 && subIdx < cards.length ? subIdx : -1
  // layout constants (right column)
  const H = 780
  const E = 410
  const C = 84
  const G = 10

  function getPos(i: number): { top: number; height: number; isExpanded: boolean } {
    if (expanded === -1) {
      const total = cards.length * C + (cards.length - 1) * G
      const startY = (H - total) / 2
      return { top: startY + i * (C + G), height: C, isExpanded: false }
    }
    if (i === expanded) {
      return { top: (H - E) / 2, height: E, isExpanded: true }
    }
    if (i < expanded) {
      const aboveCount = expanded
      const aboveTotal = aboveCount * C + (aboveCount - 1) * G
      const upperEnd = (H - E) / 2 - G
      const startY = upperEnd - aboveTotal
      return { top: startY + i * (C + G), height: C, isExpanded: false }
    }
    const lowerStart = (H - E) / 2 + E + G
    const idxBelow = i - expanded - 1
    return {
      top: lowerStart + idxBelow * (C + G),
      height: C,
      isExpanded: false,
    }
  }

  return (
    <div
      className="grid w-full max-w-7xl items-center gap-12"
      style={{ gridTemplateColumns: "minmax(0, 5fr) minmax(0, 4fr)" }}
    >
      <div className="flex flex-col gap-6">
        <Kicker>{kicker}</Kicker>
        <h2
          style={{
            fontFamily: SERIF,
            fontSize: "clamp(48px, 6.6vw, 96px)",
            lineHeight: 0.96,
            letterSpacing: "-0.03em",
            color: P.text,
          }}
        >
          {headline}
        </h2>
        <p
          className="text-xl leading-snug md:text-2xl"
          style={{ color: P.text, opacity: 0.85 }}
        >
          {body}
        </p>
        <p className="text-sm" style={{ color: P.muted }}>
          {attribution}
        </p>
      </div>

      {/* right column: absolute-positioned cards that smoothly transition */}
      <div className="relative w-full" style={{ height: H }}>
        {cards.map((c, i) => {
          const pos = getPos(i)
          return (
            <StatCard
              key={c.big}
              card={c}
              expanded={pos.isExpanded}
              top={pos.top}
              height={pos.height}
            />
          )
        })}
      </div>
    </div>
  )
}

function bigStatFontSize(big: string, expanded: boolean): number {
  const len = big.length
  if (expanded) {
    if (len <= 3) return 68
    if (len <= 4) return 60
    if (len <= 6) return 48
    return 40
  }
  if (len <= 3) return 46
  if (len <= 4) return 42
  if (len <= 6) return 34
  return 28
}

function bigStatColumnWidth(big: string): number {
  const len = big.length
  if (len <= 3) return 116
  if (len <= 4) return 130
  if (len <= 6) return 156
  return 180
}

function StatCard({
  card,
  expanded,
  top,
  height,
}: {
  card: CardData
  expanded: boolean
  top: number
  height: number
}) {
  const fontSize = bigStatFontSize(card.big, expanded)
  const colWidth = bigStatColumnWidth(card.big)
  return (
    <div
      className="absolute right-0 left-0 overflow-hidden rounded-2xl border"
      style={{
        top,
        height,
        borderColor: expanded ? P.primary : `${P.muted}55`,
        borderWidth: expanded ? 2 : 1,
        backgroundColor: P.elevated,
        boxShadow: expanded
          ? `0 24px 60px -28px ${P.primary}55`
          : "none",
        transition:
          "top 0.5s cubic-bezier(0.32, 0.72, 0, 1), height 0.5s cubic-bezier(0.32, 0.72, 0, 1), border-color 0.3s, border-width 0.3s, box-shadow 0.4s",
        willChange: "top, height",
      }}
    >
      {/* header — big number and subtitle each in own slot, both vertically centered */}
      <div
        className="flex items-stretch gap-4"
        style={{
          minHeight: 84,
          paddingLeft: 22,
          paddingRight: 22,
          paddingTop: 4,
        }}
      >
        <div
          className="flex flex-shrink-0 items-center justify-start"
          style={{
            width: colWidth,
            transition: "width 0.4s cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          <span
            style={{
              fontFamily: SERIF,
              color: P.primary,
              fontSize,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              transition: "font-size 0.45s cubic-bezier(0.32, 0.72, 0, 1)",
              whiteSpace: "nowrap",
            }}
          >
            {card.big}
          </span>
        </div>
        <div className="flex flex-1 items-center" style={{ minWidth: 0 }}>
          <span
            style={{
              color: P.text,
              opacity: 0.88,
              fontSize: expanded ? 18 : 15.5,
              lineHeight: 1.4,
              transition: "font-size 0.4s",
              display: "block",
              overflowWrap: "break-word",
            }}
          >
            {card.small}
          </span>
        </div>
      </div>

      {/* body — only mounts when expanded so chart animations re-fire */}
      {expanded && (
        <div
          className="pb-5"
          style={{
            paddingLeft: 22,
            paddingRight: 22,
            animation: "ppt-fade-up 0.5s 0.18s ease-out both",
          }}
        >
          <div style={{ height: 240 }}>
            <TrendChart
              data={card.chart}
              yLabel={card.yLabel}
              yMax={card.yMax}
            />
          </div>
          <div className="mt-3 text-sm leading-relaxed" style={{ color: P.muted }}>
            {card.caption}
          </div>
        </div>
      )}
    </div>
  )
}

function TrendChart({
  data,
  yLabel,
  yMax,
}: {
  data: { year: number; value: number }[]
  yLabel: string
  yMax?: number
}) {
  const W = 600
  const H = 220
  const pad = { l: 56, r: 16, t: 16, b: 36 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b
  const minYear = data[0].year
  const maxYear = data[data.length - 1].year
  const max = yMax ?? Math.ceil(Math.max(...data.map((d) => d.value)) * 1.15)
  const xFor = (y: number) =>
    pad.l + ((y - minYear) / (maxYear - minYear || 1)) * innerW
  const yFor = (v: number) => pad.t + (1 - v / max) * innerH

  const path = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xFor(d.year)} ${yFor(d.value)}`)
    .join(" ")

  // shaded area under line
  const areaPath =
    `M ${xFor(data[0].year)} ${pad.t + innerH} ` +
    data.map((d) => `L ${xFor(d.year)} ${yFor(d.value)}`).join(" ") +
    ` L ${xFor(data[data.length - 1].year)} ${pad.t + innerH} Z`

  // y axis ticks (4 lines)
  const yTicks = useMemo(() => {
    const ticks: number[] = []
    for (let i = 0; i <= 4; i++) ticks.push((max / 4) * i)
    return ticks
  }, [max])

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* grid lines */}
      {yTicks.map((v, i) => (
        <g key={`g-${i}`}>
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={yFor(v)}
            y2={yFor(v)}
            stroke={P.muted}
            strokeOpacity="0.18"
            strokeWidth="1"
            strokeDasharray="4 6"
          />
          <text
            x={pad.l - 8}
            y={yFor(v)}
            textAnchor="end"
            dominantBaseline="central"
            fontSize="11"
            fontFamily="ui-monospace, monospace"
            fill={P.muted}
          >
            {Math.round(v)}
          </text>
        </g>
      ))}
      {/* y axis label */}
      <text
        x={pad.l - 44}
        y={pad.t + innerH / 2}
        textAnchor="middle"
        fontSize="10"
        fontFamily="ui-monospace, monospace"
        fill={P.muted}
        transform={`rotate(-90 ${pad.l - 44} ${pad.t + innerH / 2})`}
      >
        {yLabel}
      </text>

      {/* area + line */}
      <path
        d={areaPath}
        fill={P.primary}
        opacity="0.12"
        style={{
          animation: "ppt-fade-up 0.6s 0.15s ease-out both",
        }}
      />
      <path
        d={path}
        fill="none"
        stroke={P.primary}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 1600,
          strokeDashoffset: 1600,
          animation: "ppt-line-draw 1.2s 0.1s ease-out forwards",
        }}
      />
      {/* points + year labels */}
      {data.map((d, i) => (
        <g key={i}>
          <circle
            cx={xFor(d.year)}
            cy={yFor(d.value)}
            r="5"
            fill={P.elevated}
            stroke={P.primary}
            strokeWidth="2"
            style={{
              opacity: 0,
              animation: `ppt-fade-up 0.35s ${0.6 + i * 0.12}s ease-out both`,
            }}
          />
          {i === data.length - 1 && (
            <text
              x={xFor(d.year)}
              y={yFor(d.value) - 14}
              textAnchor="middle"
              fontFamily={SERIF}
              fontSize="20"
              fontWeight="600"
              fill={P.primary}
              style={{
                opacity: 0,
                animation: `ppt-fade-up 0.35s ${0.6 + i * 0.12 + 0.2}s ease-out both`,
              }}
            >
              {Math.round(d.value)}
            </text>
          )}
          <text
            x={xFor(d.year)}
            y={H - pad.b + 18}
            textAnchor="middle"
            fontSize="11"
            fontFamily="ui-monospace, monospace"
            fill={P.muted}
          >
            {d.year}
          </text>
        </g>
      ))}
    </svg>
  )
}

/* ----------------------------------------------------------------- */
/* social lattice viz                                                */
/* ----------------------------------------------------------------- */

type LatticeNode = {
  id: string
  type: "person" | "interest"
  baseX: number
  baseY: number
  r: number
  phase: number
  amp: number
  speed: number
  color?: string
  label?: string
  ring?: boolean
}

const LATTICE_NODES: LatticeNode[] = [
  // people
  { id: "you", type: "person", baseX: 400, baseY: 300, r: 38, color: "#C8501F", label: "YO", ring: true, phase: 0.1, amp: 4, speed: 0.45 },
  { id: "maya", type: "person", baseX: 200, baseY: 165, r: 28, color: "#A8C5B0", label: "MA", phase: 1.2, amp: 6, speed: 0.55 },
  { id: "jordan", type: "person", baseX: 600, baseY: 165, r: 28, color: "#E8B784", label: "JO", phase: 2.4, amp: 6, speed: 0.5 },
  { id: "priya", type: "person", baseX: 175, baseY: 385, r: 28, color: "#D4A5A5", label: "PR", phase: 3.6, amp: 5, speed: 0.45 },
  { id: "alex", type: "person", baseX: 625, baseY: 385, r: 28, color: "#C5A5D4", label: "AL", phase: 4.8, amp: 6, speed: 0.55 },
  { id: "sam", type: "person", baseX: 360, baseY: 100, r: 24, color: "#A5B5D4", label: "SA", phase: 0.8, amp: 5, speed: 0.6, ring: true },
  { id: "riley", type: "person", baseX: 440, baseY: 500, r: 24, color: "#D4C5A5", label: "RI", phase: 2.0, amp: 5, speed: 0.45 },
  { id: "tay", type: "person", baseX: 65, baseY: 290, r: 24, color: "#E8B5A5", label: "TA", phase: 3.2, amp: 6, speed: 0.5 },
  { id: "luca", type: "person", baseX: 735, baseY: 290, r: 24, color: "#A5D4C5", label: "LU", phase: 4.4, amp: 6, speed: 0.55 },
  // interests (white nodes)
  { id: "i1", type: "interest", baseX: 280, baseY: 75, r: 18, phase: 5.2, amp: 4, speed: 0.6 },
  { id: "i2", type: "interest", baseX: 480, baseY: 75, r: 18, phase: 5.6, amp: 4, speed: 0.5 },
  { id: "i3", type: "interest", baseX: 285, baseY: 235, r: 16, phase: 6.0, amp: 5, speed: 0.55 },
  { id: "i4", type: "interest", baseX: 525, baseY: 235, r: 16, phase: 6.4, amp: 5, speed: 0.45 },
  { id: "i5", type: "interest", baseX: 290, baseY: 540, r: 18, phase: 0.4, amp: 4, speed: 0.5, ring: true },
  { id: "i6", type: "interest", baseX: 515, baseY: 540, r: 18, phase: 0.7, amp: 4, speed: 0.55 },
  { id: "i7", type: "interest", baseX: 110, baseY: 200, r: 14, phase: 1.0, amp: 4, speed: 0.6 },
  { id: "i8", type: "interest", baseX: 695, baseY: 200, r: 14, phase: 1.5, amp: 4, speed: 0.5 },
  { id: "i9", type: "interest", baseX: 110, baseY: 380, r: 14, phase: 2.1, amp: 4, speed: 0.55 },
  { id: "i10", type: "interest", baseX: 695, baseY: 380, r: 14, phase: 2.7, amp: 4, speed: 0.5 },
  { id: "i11", type: "interest", baseX: 380, baseY: 215, r: 16, phase: 3.3, amp: 5, speed: 0.55, ring: true },
  { id: "i12", type: "interest", baseX: 420, baseY: 385, r: 16, phase: 3.9, amp: 5, speed: 0.45 },
  { id: "i13", type: "interest", baseX: 215, baseY: 470, r: 14, phase: 4.5, amp: 4, speed: 0.55 },
  { id: "i14", type: "interest", baseX: 585, baseY: 470, r: 14, phase: 5.0, amp: 4, speed: 0.5 },
  { id: "i15", type: "interest", baseX: 365, baseY: 575, r: 12, phase: 0.5, amp: 3, speed: 0.6 },
  { id: "i16", type: "interest", baseX: 460, baseY: 575, r: 12, phase: 0.9, amp: 3, speed: 0.55 },
]

const LATTICE_EDGES: { from: string; to: string }[] = [
  // you to friends
  { from: "you", to: "maya" },
  { from: "you", to: "jordan" },
  { from: "you", to: "priya" },
  { from: "you", to: "alex" },
  { from: "you", to: "sam" },
  { from: "you", to: "riley" },
  { from: "you", to: "i3" },
  { from: "you", to: "i11" },
  { from: "you", to: "i12" },
  { from: "you", to: "i13" },
  // friends to interests
  { from: "maya", to: "i1" },
  { from: "maya", to: "i3" },
  { from: "maya", to: "i11" },
  { from: "jordan", to: "i2" },
  { from: "jordan", to: "i4" },
  { from: "sam", to: "i1" },
  { from: "sam", to: "i2" },
  { from: "sam", to: "i11" },
  { from: "priya", to: "i3" },
  { from: "priya", to: "i9" },
  { from: "priya", to: "i12" },
  { from: "priya", to: "i13" },
  { from: "alex", to: "i4" },
  { from: "alex", to: "i10" },
  { from: "alex", to: "i12" },
  { from: "alex", to: "i14" },
  { from: "tay", to: "i7" },
  { from: "tay", to: "i9" },
  { from: "luca", to: "i8" },
  { from: "luca", to: "i10" },
  { from: "riley", to: "i5" },
  { from: "riley", to: "i6" },
  { from: "riley", to: "i15" },
  { from: "riley", to: "i16" },
  // person to person bonds
  { from: "maya", to: "sam" },
  { from: "jordan", to: "sam" },
  { from: "tay", to: "priya" },
  { from: "luca", to: "alex" },
  { from: "priya", to: "riley" },
  { from: "alex", to: "riley" },
]

type LatticeMode = "idle" | "chaotic" | "stable" | "overlap" | "community"

function computeLatticeMode(idx: number, subIdx: number): LatticeMode {
  // slide 10 (idx 9): subIdx -1 = chaotic, subIdx 0 = stable
  if (idx === 9) return subIdx >= 0 ? "stable" : "chaotic"
  if (idx === 10) return "overlap"
  if (idx === 11) return "community"
  return "idle"
}

// Cross-matrix data: pairwise shared interest counts (computed once)
const PAIR_PEOPLE = ["you", "maya", "jordan", "priya", "alex", "sam", "riley", "tay", "luca"] as const
const PAIR_LABELS: Record<string, string> = {
  you: "YO",
  maya: "MA",
  jordan: "JO",
  priya: "PR",
  alex: "AL",
  sam: "SA",
  riley: "RI",
  tay: "TA",
  luca: "LU",
}

const PAIR_COUNTS: Record<string, Record<string, number>> = {
  you: { maya: 2, jordan: 2, priya: 3, alex: 2, sam: 2, riley: 2, tay: 0, luca: 0 },
  maya: { you: 2, jordan: 2, priya: 1, alex: 0, sam: 3, riley: 1, tay: 0, luca: 0 },
  jordan: { you: 2, maya: 2, priya: 0, alex: 1, sam: 3, riley: 1, tay: 0, luca: 0 },
  priya: { you: 3, maya: 1, jordan: 0, alex: 1, sam: 0, riley: 2, tay: 1, luca: 0 },
  alex: { you: 2, maya: 0, jordan: 1, priya: 1, sam: 0, riley: 2, tay: 0, luca: 1 },
  sam: { you: 2, maya: 3, jordan: 3, priya: 0, alex: 0, riley: 0, tay: 0, luca: 0 },
  riley: { you: 2, maya: 1, jordan: 1, priya: 2, alex: 2, sam: 0, tay: 0, luca: 0 },
  tay: { you: 0, maya: 0, jordan: 0, priya: 1, alex: 0, sam: 0, riley: 0, luca: 0 },
  luca: { you: 0, maya: 0, jordan: 0, priya: 0, alex: 1, sam: 0, riley: 0, tay: 0 },
}

function CrossMatrix() {
  // own clock — starts when matrix mounts (slide 12 enters)
  const [tick, setTick] = useState(0)
  const startRef = useRef(0)
  useEffect(() => {
    startRef.current = performance.now() / 1000
    let id: number
    const loop = () => {
      setTick(performance.now() / 1000 - startRef.current)
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [])

  const cellSize = 32
  const labelSize = 22
  const elapsed = tick

  // for "increment pulse" — track which cells have just gained a value
  const lastEventT = (() => {
    let last = 0
    for (const ev of COMMUNITY_GROWTH) {
      if (elapsed >= ev.t) last = ev.t
    }
    return last
  })()

  return (
    <div className="flex flex-col gap-2">
      <div
        className="font-mono text-xs tracking-[0.3em] uppercase"
        style={{ color: P.muted }}
      >
        bonds · shared interests per pair
      </div>
      <svg
        viewBox={`0 0 ${labelSize + cellSize * PAIR_PEOPLE.length} ${labelSize + cellSize * PAIR_PEOPLE.length}`}
        className="w-full"
        style={{ maxWidth: 360 }}
      >
        {PAIR_PEOPLE.map((p, c) => (
          <text
            key={`ch-${p}`}
            x={labelSize + c * cellSize + cellSize / 2}
            y={labelSize - 6}
            textAnchor="middle"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize={9}
            fontWeight={700}
            fill={P.muted}
            letterSpacing="0.04em"
          >
            {PAIR_LABELS[p]}
          </text>
        ))}
        {PAIR_PEOPLE.map((p, r) => (
          <text
            key={`rh-${p}`}
            x={labelSize - 4}
            y={labelSize + r * cellSize + cellSize / 2}
            textAnchor="end"
            dominantBaseline="central"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize={9}
            fontWeight={700}
            fill={P.muted}
            letterSpacing="0.04em"
          >
            {PAIR_LABELS[p]}
          </text>
        ))}
        {PAIR_PEOPLE.map((rowP, r) =>
          PAIR_PEOPLE.map((colP, c) => {
            const isDiag = r === c
            const count = isDiag ? -1 : currentCount(elapsed, rowP, colP)
            const intensity = Math.min(count / 4, 1)
            const fill = isDiag
              ? `${P.muted}11`
              : count === 0
                ? `${P.muted}18`
                : `${P.primary}${Math.round(intensity * 255)
                    .toString(16)
                    .padStart(2, "0")}`
            const x = labelSize + c * cellSize
            const y = labelSize + r * cellSize

            // detect if this cell was just incremented (within last 0.5s)
            const justUpdated = (() => {
              if (isDiag) return false
              for (const ev of COMMUNITY_GROWTH) {
                if (elapsed - ev.t > 0 && elapsed - ev.t < 0.5) {
                  for (const [a, b] of ev.increments) {
                    if (
                      (a === rowP && b === colP) ||
                      (a === colP && b === rowP)
                    ) {
                      return true
                    }
                  }
                }
              }
              return false
            })()

            const pulseScale = justUpdated
              ? 1 + 0.12 * (1 - (elapsed - lastEventT) / 0.5)
              : 1

            return (
              <g
                key={`c-${r}-${c}`}
                style={{
                  transformOrigin: `${x + cellSize / 2}px ${y + cellSize / 2}px`,
                  transform: `scale(${pulseScale})`,
                  transition: "transform 0.3s ease-out",
                }}
              >
                <rect
                  x={x + 2}
                  y={y + 2}
                  width={cellSize - 4}
                  height={cellSize - 4}
                  rx={4}
                  fill={fill}
                  stroke={isDiag ? "none" : `${P.primary}22`}
                  strokeWidth="0.5"
                  style={{
                    transition: "fill 0.4s ease-out",
                  }}
                />
                {!isDiag && count > 0 && (
                  <text
                    x={x + cellSize / 2}
                    y={y + cellSize / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fontSize={11}
                    fontWeight={700}
                    fill={intensity > 0.55 ? P.bg : P.primary}
                  >
                    {count}
                  </text>
                )}
              </g>
            )
          }),
        )}
      </svg>
    </div>
  )
}

function PersistentLattice({
  idx,
  subIdx,
}: {
  idx: number
  subIdx: number
}) {
  // disabled in the new deck — the morphing problem-graph slide owns its own viz.
  const rect = {
    left: "26%",
    top: "20%",
    width: "48%",
    height: "60%",
    opacity: 0,
  }

  const mode = computeLatticeMode(idx, subIdx)

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-10"
      style={{
        ...rect,
        transition:
          "left 0.7s cubic-bezier(0.32, 0.72, 0, 1), top 0.7s cubic-bezier(0.32, 0.72, 0, 1), width 0.7s cubic-bezier(0.32, 0.72, 0, 1), height 0.7s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.4s",
      }}
    >
      <SocialLattice mode={mode} />
    </div>
  )
}

// Common interests between you and priya (highlighted in overlap mode)
const COMMON_YOU_PRIYA = new Set(["i3", "i12", "i13"])

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

type ModeConfig = {
  ampMul: number
  speedMul: number
  overrideX: Record<string, number>
  overrideY: Record<string, number>
  flicker: number // 0..1: how much edges flicker
  overlapDim: number // 0..1: how much non-shared elements dim
  pulseShared: number // 0..1: how strong the shared-interest pulse is
  ppEmphasis: number // 0..1: how much person-person edges are emphasized
}

function getModeConfig(m: LatticeMode): ModeConfig {
  switch (m) {
    case "chaotic":
      return {
        ampMul: 4.5,
        speedMul: 2.4,
        overrideX: {},
        overrideY: {},
        flicker: 1,
        overlapDim: 0,
        pulseShared: 0,
        ppEmphasis: 0,
      }
    case "stable":
      return {
        ampMul: 1.6,
        speedMul: 1.2,
        overrideX: {},
        overrideY: {},
        flicker: 0,
        overlapDim: 0,
        pulseShared: 0,
        ppEmphasis: 0,
      }
    case "overlap":
      return {
        ampMul: 1.0,
        speedMul: 1.0,
        overrideX: { you: 290, priya: 510, i3: 400, i12: 400, i13: 400 },
        overrideY: { you: 300, priya: 300, i3: 200, i12: 300, i13: 400 },
        flicker: 0,
        overlapDim: 1,
        pulseShared: 1,
        ppEmphasis: 0,
      }
    case "community":
      return {
        ampMul: 1.4,
        speedMul: 1.1,
        overrideX: {},
        overrideY: {},
        flicker: 0,
        overlapDim: 0,
        pulseShared: 0,
        ppEmphasis: 1,
      }
    default:
      return {
        ampMul: 1,
        speedMul: 1,
        overrideX: {},
        overrideY: {},
        flicker: 0,
        overlapDim: 0,
        pulseShared: 0,
        ppEmphasis: 0,
      }
  }
}

// Extra interest nodes that appear in community mode (24 total)
const COMMUNITY_EXTRA_NODES: LatticeNode[] = [
  { id: "x1", type: "interest", baseX: 350, baseY: 30, r: 12, phase: 1.1, amp: 5, speed: 0.7 },
  { id: "x2", type: "interest", baseX: 470, baseY: 30, r: 12, phase: 1.7, amp: 5, speed: 0.65 },
  { id: "x3", type: "interest", baseX: 60, baseY: 110, r: 12, phase: 2.3, amp: 5, speed: 0.7 },
  { id: "x4", type: "interest", baseX: 740, baseY: 110, r: 12, phase: 2.9, amp: 5, speed: 0.6 },
  { id: "x5", type: "interest", baseX: 340, baseY: 320, r: 14, phase: 3.5, amp: 4, speed: 0.55 },
  { id: "x6", type: "interest", baseX: 460, baseY: 320, r: 14, phase: 4.1, amp: 4, speed: 0.6 },
  { id: "x7", type: "interest", baseX: 60, baseY: 510, r: 12, phase: 4.7, amp: 5, speed: 0.65 },
  { id: "x8", type: "interest", baseX: 740, baseY: 510, r: 12, phase: 5.3, amp: 5, speed: 0.7 },
  { id: "x9", type: "interest", baseX: 230, baseY: 20, r: 11, phase: 0.3, amp: 5, speed: 0.7 },
  { id: "x10", type: "interest", baseX: 580, baseY: 20, r: 11, phase: 0.9, amp: 5, speed: 0.65 },
  { id: "x11", type: "interest", baseX: 120, baseY: 50, r: 11, phase: 1.5, amp: 5, speed: 0.6 },
  { id: "x12", type: "interest", baseX: 680, baseY: 50, r: 11, phase: 2.1, amp: 5, speed: 0.7 },
  { id: "x13", type: "interest", baseX: 240, baseY: 245, r: 13, phase: 2.6, amp: 4, speed: 0.55 },
  { id: "x14", type: "interest", baseX: 560, baseY: 245, r: 13, phase: 3.1, amp: 4, speed: 0.6 },
  { id: "x15", type: "interest", baseX: 90, baseY: 360, r: 11, phase: 3.7, amp: 5, speed: 0.65 },
  { id: "x16", type: "interest", baseX: 710, baseY: 360, r: 11, phase: 4.2, amp: 5, speed: 0.55 },
  { id: "x17", type: "interest", baseX: 130, baseY: 450, r: 11, phase: 4.8, amp: 4, speed: 0.6 },
  { id: "x18", type: "interest", baseX: 670, baseY: 450, r: 11, phase: 5.4, amp: 4, speed: 0.65 },
  { id: "x19", type: "interest", baseX: 230, baseY: 560, r: 12, phase: 5.9, amp: 4, speed: 0.6 },
  { id: "x20", type: "interest", baseX: 570, baseY: 560, r: 12, phase: 0.4, amp: 4, speed: 0.65 },
  { id: "x21", type: "interest", baseX: 330, baseY: 470, r: 12, phase: 1.0, amp: 4, speed: 0.55 },
  { id: "x22", type: "interest", baseX: 470, baseY: 470, r: 12, phase: 1.6, amp: 4, speed: 0.6 },
  { id: "x23", type: "interest", baseX: 380, baseY: 555, r: 11, phase: 2.2, amp: 4, speed: 0.7 },
  { id: "x24", type: "interest", baseX: 420, baseY: 555, r: 11, phase: 2.8, amp: 4, speed: 0.65 },
]

const COMMUNITY_EXTRA_EDGES: { from: string; to: string }[] = [
  // x1-x8 (original)
  { from: "you", to: "x5" },
  { from: "you", to: "x6" },
  { from: "maya", to: "x1" },
  { from: "jordan", to: "x2" },
  { from: "tay", to: "x3" },
  { from: "luca", to: "x4" },
  { from: "priya", to: "x5" },
  { from: "alex", to: "x6" },
  { from: "tay", to: "x7" },
  { from: "luca", to: "x8" },
  { from: "riley", to: "x5" },
  { from: "sam", to: "x1" },
  { from: "sam", to: "x2" },
  { from: "maya", to: "x5" },
  { from: "jordan", to: "x6" },
  // x9-x24 (added)
  { from: "maya", to: "x9" },
  { from: "sam", to: "x9" },
  { from: "jordan", to: "x10" },
  { from: "sam", to: "x10" },
  { from: "maya", to: "x11" },
  { from: "tay", to: "x11" },
  { from: "jordan", to: "x12" },
  { from: "luca", to: "x12" },
  { from: "you", to: "x13" },
  { from: "maya", to: "x13" },
  { from: "you", to: "x14" },
  { from: "jordan", to: "x14" },
  { from: "priya", to: "x15" },
  { from: "tay", to: "x15" },
  { from: "alex", to: "x16" },
  { from: "luca", to: "x16" },
  { from: "priya", to: "x17" },
  { from: "riley", to: "x17" },
  { from: "alex", to: "x18" },
  { from: "riley", to: "x18" },
  { from: "priya", to: "x19" },
  { from: "sam", to: "x19" },
  { from: "alex", to: "x20" },
  { from: "sam", to: "x20" },
  { from: "you", to: "x21" },
  { from: "sam", to: "x21" },
  { from: "riley", to: "x21" },
  { from: "you", to: "x22" },
  { from: "alex", to: "x22" },
  { from: "riley", to: "x22" },
  { from: "maya", to: "x23" },
  { from: "jordan", to: "x23" },
  { from: "sam", to: "x23" },
  { from: "priya", to: "x24" },
  { from: "alex", to: "x24" },
  { from: "riley", to: "x24" },
]

// Community growth events — each spawns one interest node + edges.
// `increments` lists pairs that gain a shared interest (+1 to matrix cell).
type GrowthEvent = {
  t: number
  nodeId: string
  increments: [string, string][]
}

const COMMUNITY_GROWTH: GrowthEvent[] = [
  { t: 0.3, nodeId: "x1", increments: [["maya", "sam"]] },
  { t: 0.6, nodeId: "x9", increments: [["maya", "sam"]] },
  { t: 0.9, nodeId: "x2", increments: [["jordan", "sam"]] },
  { t: 1.2, nodeId: "x10", increments: [["jordan", "sam"]] },
  { t: 1.5, nodeId: "x3", increments: [] },
  { t: 1.8, nodeId: "x11", increments: [["maya", "tay"]] },
  { t: 2.1, nodeId: "x4", increments: [] },
  { t: 2.4, nodeId: "x12", increments: [["jordan", "luca"]] },
  { t: 2.7, nodeId: "x13", increments: [["you", "maya"]] },
  { t: 3.0, nodeId: "x14", increments: [["you", "jordan"]] },
  {
    t: 3.3,
    nodeId: "x5",
    increments: [
      ["you", "priya"],
      ["you", "maya"],
      ["you", "riley"],
      ["priya", "maya"],
      ["priya", "riley"],
      ["maya", "riley"],
    ],
  },
  {
    t: 3.6,
    nodeId: "x6",
    increments: [
      ["you", "alex"],
      ["you", "jordan"],
      ["alex", "jordan"],
    ],
  },
  { t: 3.9, nodeId: "x15", increments: [["priya", "tay"]] },
  { t: 4.2, nodeId: "x16", increments: [["alex", "luca"]] },
  { t: 4.5, nodeId: "x7", increments: [] },
  { t: 4.8, nodeId: "x8", increments: [] },
  { t: 5.1, nodeId: "x17", increments: [["priya", "riley"]] },
  { t: 5.4, nodeId: "x18", increments: [["alex", "riley"]] },
  { t: 5.7, nodeId: "x19", increments: [["priya", "sam"]] },
  { t: 6.0, nodeId: "x20", increments: [["alex", "sam"]] },
  {
    t: 6.3,
    nodeId: "x21",
    increments: [
      ["you", "sam"],
      ["you", "riley"],
      ["sam", "riley"],
    ],
  },
  {
    t: 6.6,
    nodeId: "x22",
    increments: [
      ["you", "alex"],
      ["you", "riley"],
      ["alex", "riley"],
    ],
  },
  {
    t: 6.9,
    nodeId: "x23",
    increments: [
      ["maya", "jordan"],
      ["maya", "sam"],
      ["jordan", "sam"],
    ],
  },
  {
    t: 7.2,
    nodeId: "x24",
    increments: [
      ["priya", "alex"],
      ["priya", "riley"],
      ["alex", "riley"],
    ],
  },
]

// Base pair counts (from LATTICE_EDGES interest overlaps before community spawns)
const BASE_PAIR_COUNTS: Record<string, Record<string, number>> = {
  you: { maya: 2, jordan: 0, priya: 3, alex: 1, sam: 1, riley: 0, tay: 0, luca: 0 },
  maya: { you: 2, jordan: 0, priya: 1, alex: 0, sam: 2, riley: 0, tay: 0, luca: 0 },
  jordan: { you: 0, maya: 0, priya: 0, alex: 1, sam: 1, riley: 0, tay: 0, luca: 0 },
  priya: { you: 3, maya: 1, jordan: 0, alex: 1, sam: 0, riley: 0, tay: 1, luca: 0 },
  alex: { you: 1, maya: 0, jordan: 1, priya: 1, sam: 0, riley: 0, tay: 0, luca: 1 },
  sam: { you: 1, maya: 2, jordan: 1, priya: 0, alex: 0, riley: 0, tay: 0, luca: 0 },
  riley: { you: 0, maya: 0, jordan: 0, priya: 0, alex: 0, sam: 0, tay: 0, luca: 0 },
  tay: { you: 0, maya: 0, jordan: 0, priya: 1, alex: 0, sam: 0, riley: 0, luca: 0 },
  luca: { you: 0, maya: 0, jordan: 0, priya: 0, alex: 1, sam: 0, riley: 0, tay: 0 },
}

function currentCount(elapsedT: number, a: string, b: string): number {
  let count = BASE_PAIR_COUNTS[a]?.[b] ?? 0
  for (const ev of COMMUNITY_GROWTH) {
    if (elapsedT < ev.t) break
    for (const [x, y] of ev.increments) {
      if ((x === a && y === b) || (x === b && y === a)) count++
    }
  }
  return count
}

// returns visibility 0..1 for an extra node based on community elapsed time
function extraNodeVisibility(
  nodeId: string,
  inCommunity: boolean,
  fromCommunity: boolean,
  communityElapsed: number,
  transitionEased: number,
): number {
  const event = COMMUNITY_GROWTH.find((e) => e.nodeId === nodeId)
  if (!event) return 0
  if (inCommunity) {
    const since = communityElapsed - event.t
    if (since < 0) return 0
    if (since < 0.4) return since / 0.4
    return 1
  }
  if (fromCommunity) {
    // fading out as we leave community
    return 1 - transitionEased
  }
  return 0
}

export function SocialLattice({
  mode = "stable",
}: {
  mode?: LatticeMode
}) {
  const [t, setT] = useState(0)

  // transition: smoothly interpolate from previous mode → current mode
  const transitionRef = useRef({
    fromMode: mode,
    toMode: mode,
    startT: 0,
    duration: 1.4,
  })

  // monotonic phase accumulator — prevents shake when speedMul changes mid-flight
  const phaseAccRef = useRef(0)
  const lastTRef = useRef(0)

  useEffect(() => {
    transitionRef.current = {
      fromMode: transitionRef.current.toMode,
      toMode: mode,
      startT: performance.now() / 1000,
      duration: 1.4,
    }
  }, [mode])

  useEffect(() => {
    let id: number
    const tick = () => {
      const now = performance.now() / 1000
      if (lastTRef.current === 0) lastTRef.current = now
      const dt = Math.min(0.05, now - lastTRef.current)
      lastTRef.current = now

      // compute current interpolated speedMul
      const tr = transitionRef.current
      const elapsed = Math.max(0, now - tr.startT)
      const rawProgress = Math.min(1, elapsed / tr.duration)
      const eased = easeInOutCubic(rawProgress)
      const fromCfg = getModeConfig(tr.fromMode)
      const toCfg = getModeConfig(tr.toMode)
      const currentSpeedMul = lerp(
        fromCfg.speedMul,
        toCfg.speedMul,
        eased,
      )

      phaseAccRef.current += dt * currentSpeedMul
      setT(now)
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])

  const tr = transitionRef.current
  const elapsed = Math.max(0, t - tr.startT)
  const rawProgress = Math.min(1, elapsed / tr.duration)
  const eased = easeInOutCubic(rawProgress)

  const fromCfg = getModeConfig(tr.fromMode)
  const toCfg = getModeConfig(tr.toMode)
  const phaseAcc = phaseAccRef.current

  // include community extras whenever either side is community (so they fade in/out)
  const includeExtras =
    tr.fromMode === "community" || tr.toMode === "community"
  const nodes = includeExtras
    ? [...LATTICE_NODES, ...COMMUNITY_EXTRA_NODES]
    : LATTICE_NODES
  const edges = includeExtras
    ? [...LATTICE_EDGES, ...COMMUNITY_EXTRA_EDGES]
    : LATTICE_EDGES

  // interpolated motion params
  const ampMul = lerp(fromCfg.ampMul, toCfg.ampMul, eased)
  const speedMul = lerp(fromCfg.speedMul, toCfg.speedMul, eased)
  const flicker = lerp(fromCfg.flicker, toCfg.flicker, eased)
  const overlapDim = lerp(fromCfg.overlapDim, toCfg.overlapDim, eased)
  const pulseShared = lerp(fromCfg.pulseShared, toCfg.pulseShared, eased)
  const ppEmphasis = lerp(fromCfg.ppEmphasis, toCfg.ppEmphasis, eased)

  // extras: per-node staggered spawn based on community elapsed time
  const inCommunity = tr.toMode === "community"
  const fromCommunity = tr.fromMode === "community"
  const communityElapsed = inCommunity ? Math.max(0, t - tr.startT) : 0

  // compute interpolated base position per node (slides smoothly between configs)
  const basePos: Record<string, { x: number; y: number }> = {}
  for (const n of nodes) {
    const fromX = fromCfg.overrideX[n.id] ?? n.baseX
    const fromY = fromCfg.overrideY[n.id] ?? n.baseY
    const toX = toCfg.overrideX[n.id] ?? n.baseX
    const toY = toCfg.overrideY[n.id] ?? n.baseY
    basePos[n.id] = {
      x: lerp(fromX, toX, eased),
      y: lerp(fromY, toY, eased),
    }
  }

  // live positions = lerped base + sin/cos motion (using monotonic phase accumulator)
  const positions: Record<string, { x: number; y: number }> = {}
  for (const n of nodes) {
    const bx = basePos[n.id].x
    const by = basePos[n.id].y
    positions[n.id] = {
      x:
        bx +
        Math.cos(phaseAcc * n.speed + n.phase) * n.amp * ampMul,
      y:
        by +
        Math.sin(phaseAcc * n.speed * 0.93 + n.phase) *
          n.amp *
          ampMul,
    }
  }

  // edge opacity factoring flicker (0..1)
  function edgeOpacity(idx: number, baseOpacity: number) {
    if (flicker < 0.01) return baseOpacity
    const flickerVal =
      0.05 + ((Math.sin(t * 1.8 + idx * 0.31) + 1) / 2) * 0.45
    return lerp(baseOpacity, flickerVal, flicker)
  }

  // edge style — interpolated between modes
  function edgeStyle(e: { from: string; to: string }, idx: number) {
    const fromN = nodes.find((n) => n.id === e.from)
    const toN = nodes.find((n) => n.id === e.to)
    const isPP =
      fromN?.type === "person" && toN?.type === "person"
    const isYouPriyaShared =
      (e.from === "you" && COMMON_YOU_PRIYA.has(e.to)) ||
      (e.to === "you" && COMMON_YOU_PRIYA.has(e.from)) ||
      (e.from === "priya" && COMMON_YOU_PRIYA.has(e.to)) ||
      (e.to === "priya" && COMMON_YOU_PRIYA.has(e.from))

    // base opacity (with flicker mixed in)
    let opacity = edgeOpacity(idx, 0.45)
    let stroke: string = P.muted
    let width = 1

    // overlap mode: dim non-shared, brighten shared
    if (overlapDim > 0) {
      if (isYouPriyaShared) {
        const target = { stroke: P.primary, width: 1.9, opacity: 0.9 }
        stroke = overlapDim > 0.5 ? target.stroke : stroke
        width = lerp(width, target.width, overlapDim)
        opacity = lerp(opacity, target.opacity, overlapDim)
      } else {
        opacity = lerp(opacity, opacity * 0.25, overlapDim)
      }
    }
    // community mode: person-person bonds emphasized
    if (ppEmphasis > 0 && isPP) {
      stroke = ppEmphasis > 0.5 ? P.primary : stroke
      width = lerp(width, 1.7, ppEmphasis)
      opacity = lerp(opacity, 0.78, ppEmphasis)
    }

    // edges that involve community extras: per-extra-node staggered visibility
    const extraId = e.from.startsWith("x")
      ? e.from
      : e.to.startsWith("x")
        ? e.to
        : null
    if (extraId) {
      const vis = extraNodeVisibility(
        extraId,
        inCommunity,
        fromCommunity,
        communityElapsed,
        eased,
      )
      opacity *= vis
    }

    return { stroke, width, opacity }
  }

  // node opacity (handles overlap dim + extras fade-in)
  function nodeOpacity(n: LatticeNode) {
    let op = 1
    if (overlapDim > 0) {
      const isHighlighted =
        n.id === "you" ||
        n.id === "priya" ||
        COMMON_YOU_PRIYA.has(n.id)
      if (!isHighlighted) {
        op = lerp(1, 0.32, overlapDim)
      }
    }
    if (n.id.startsWith("x")) {
      op *= extraNodeVisibility(
        n.id,
        inCommunity,
        fromCommunity,
        communityElapsed,
        eased,
      )
    }
    return op
  }

  // pulse ring on shared interests, intensity tied to pulseShared
  function nodeExtraRing(n: LatticeNode) {
    if (pulseShared < 0.05) return null
    if (!COMMON_YOU_PRIYA.has(n.id)) return null
    const pulse = (Math.sin(t * 1.6 + n.phase) + 1) / 2
    return {
      show: true,
      ringR: n.r + 8 + pulse * 10,
      ringOpacity: (0.5 - pulse * 0.4) * pulseShared,
    }
  }

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox="0 0 800 600"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ overflow: "visible" }}
      >
        {/* edges first so they render under nodes */}
        {edges.map((e, i) => {
          const a = positions[e.from]
          const b = positions[e.to]
          if (!a || !b) return null
          const s = edgeStyle(e, i)
          return (
            <line
              key={`e-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={s.stroke}
              strokeWidth={s.width}
              strokeLinecap="round"
              opacity={s.opacity}
            />
          )
        })}

        {/* nodes */}
        {nodes.map((n) => {
          const pos = positions[n.id]
          if (!pos) return null
          const op = nodeOpacity(n)
          const extra = nodeExtraRing(n)
          if (n.type === "person") {
            return (
              <g key={n.id} opacity={op}>
                {extra?.show && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={extra.ringR}
                    fill="none"
                    stroke={P.primary}
                    strokeWidth="2"
                    opacity={extra.ringOpacity}
                  />
                )}
                {n.ring && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={n.r + 9}
                    fill="none"
                    stroke={n.color}
                    strokeWidth="1.5"
                    opacity="0.45"
                  />
                )}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={n.r}
                  fill={n.color}
                  stroke={`${P.text}22`}
                  strokeWidth="0.5"
                />
                <text
                  x={pos.x}
                  y={pos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                  fontSize={n.r * 0.55}
                  fontWeight={700}
                  fill={n.id === "you" ? P.bg : P.text}
                  letterSpacing="0.02em"
                >
                  {n.label}
                </text>
              </g>
            )
          }
          // interest node (white)
          return (
            <g key={n.id} opacity={op}>
              {extra?.show && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={extra.ringR}
                  fill="none"
                  stroke={P.primary}
                  strokeWidth="2"
                  opacity={extra.ringOpacity}
                />
              )}
              {n.ring && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={n.r + 7}
                  fill="none"
                  stroke={`${P.muted}88`}
                  strokeWidth="1"
                />
              )}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={n.r}
                fill={P.elevated}
                stroke={`${P.muted}aa`}
                strokeWidth="1.2"
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ----------------------------------------------------------------- */
/* legacy visualizers (kept for reference, slides now use lattice)   */
/* ----------------------------------------------------------------- */

function GraphViz() {
  const you = { x: 400, y: 225, r: 60 }
  const friends = [
    { id: "maya", name: "Maya", x: 130, y: 90, r: 44, shared: "folklore" },
    { id: "jordan", name: "Jordan", x: 670, y: 90, r: 44, shared: "Dune" },
    { id: "priya", name: "Priya", x: 130, y: 360, r: 44, shared: "Arrival" },
    {
      id: "alex",
      name: "Alex",
      x: 670,
      y: 360,
      r: 44,
      shared: "Hollow Knight",
    },
  ]
  return (
    <div className="relative aspect-[16/10] w-full">
      <svg
        viewBox="0 0 800 450"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ overflow: "visible" }}
      >
        {friends.map((f, i) => (
          <line
            key={`edge-${f.id}`}
            x1={you.x}
            y1={you.y}
            x2={f.x}
            y2={f.y}
            stroke={P.primary}
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{
              animation: `ppt-pulse-line ${2.4 + (i % 4) * 0.5}s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
        {friends.map((f) => {
          const t = 0.5
          const dx = f.x - you.x
          const dy = f.y - you.y
          const len = Math.sqrt(dx * dx + dy * dy) || 1
          const px = -dy / len
          const py = dx / len
          const offsetSign = dy < 0 ? -1 : 1
          const offset = 28 * offsetSign
          const mx = you.x + dx * t + px * offset
          const my = you.y + dy * t + py * offset
          const labelW = f.shared.length * 13 + 28
          return (
            <g key={`label-${f.id}`}>
              <rect
                x={mx - labelW / 2}
                y={my - 20}
                width={labelW}
                height={40}
                rx={20}
                fill={P.elevated}
                stroke={P.primary}
                strokeWidth="2"
              />
              <text
                x={mx}
                y={my}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily={SERIF}
                fontSize={20}
                fontWeight={500}
                fill={P.primary}
              >
                {f.shared}
              </text>
            </g>
          )
        })}
        {friends.map((f) => (
          <g key={`node-${f.id}`}>
            <circle
              cx={f.x}
              cy={f.y}
              r={f.r}
              fill={P.secondary}
              stroke={P.primary}
              strokeWidth="2.5"
            />
            <text
              x={f.x}
              y={f.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily={SERIF}
              fontSize={30}
              fontWeight={600}
              fill={P.bg}
            >
              {f.name.charAt(0)}
            </text>
            <text
              x={f.x}
              y={f.y + f.r + 28}
              textAnchor="middle"
              fontFamily={SERIF}
              fontSize={22}
              fontWeight={500}
              fill={P.text}
            >
              {f.name}
            </text>
          </g>
        ))}
        <g>
          <circle
            cx={you.x}
            cy={you.y}
            r={you.r + 10}
            fill={P.primary}
            opacity="0.22"
            style={{
              transformOrigin: `${you.x}px ${you.y}px`,
              animation: "ppt-ping-soft 2.8s ease-out infinite",
            }}
          />
          <circle cx={you.x} cy={you.y} r={you.r} fill={P.primary} />
          <text
            x={you.x}
            y={you.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily={SERIF}
            fontSize={28}
            fontWeight={600}
            fill={P.bg}
          >
            you
          </text>
        </g>
      </svg>
    </div>
  )
}

function OverlapViz() {
  type Side = "you" | "shared" | "priya"
  const items: { title: string; side: Side; x: number; y: number }[] = [
    { title: "Hollow Knight", side: "you", x: 220, y: 130 },
    { title: "Dune", side: "you", x: 350, y: 280 },
    { title: "folklore", side: "shared", x: 500, y: 120 },
    { title: "Arrival", side: "shared", x: 620, y: 290 },
    { title: "Attack on Titan", side: "shared", x: 740, y: 140 },
    { title: "In Rainbows", side: "priya", x: 870, y: 280 },
    { title: "Blame!", side: "priya", x: 990, y: 130 },
  ]
  const youA = { cx: 90, cy: 210, r: 56 }
  const priyaA = { cx: 1110, cy: 210, r: 56 }
  const railY = 210
  const gradId = "overlap-rail-harvest"

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 items-center text-center">
        <div
          className="font-mono text-xs tracking-[0.3em] uppercase"
          style={{ color: P.muted }}
        >
          only you
        </div>
        <div
          className="font-mono text-xs tracking-[0.3em] uppercase"
          style={{ color: P.primary }}
        >
          ← shared →
        </div>
        <div
          className="font-mono text-xs tracking-[0.3em] uppercase"
          style={{ color: P.muted }}
        >
          only priya
        </div>
      </div>
      <div className="relative aspect-[12/4] w-full">
        <svg
          viewBox="0 0 1200 420"
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
          style={{ overflow: "visible" }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor={P.muted} stopOpacity="0.25" />
              <stop offset="0.18" stopColor={P.primary} stopOpacity="0.5" />
              <stop offset="0.5" stopColor={P.primary} stopOpacity="0.95" />
              <stop offset="0.82" stopColor={P.primary} stopOpacity="0.5" />
              <stop offset="1" stopColor={P.muted} stopOpacity="0.25" />
            </linearGradient>
          </defs>
          <rect
            x="440"
            y="80"
            width="320"
            height="260"
            rx="130"
            fill={P.primary}
            opacity="0.08"
            stroke={P.primary}
            strokeOpacity="0.4"
            strokeWidth="1.5"
            strokeDasharray="8 10"
          />
          <line
            x1={youA.cx + youA.r + 8}
            y1={railY}
            x2={priyaA.cx - priyaA.r - 8}
            y2={railY}
            stroke={`url(#${gradId})`}
            strokeWidth="5"
            strokeLinecap="round"
          />
          {items.map((item, i) => {
            const targets =
              item.side === "you"
                ? [youA]
                : item.side === "priya"
                  ? [priyaA]
                  : [youA, priyaA]
            const isShared = item.side === "shared"
            return targets.map((tgt, ti) => {
              const sign = item.x > tgt.cx ? -1 : 1
              const endX = tgt.cx + sign * (tgt.r + 4)
              const ctrlX = (item.x + endX) / 2
              return (
                <path
                  key={`strand-${i}-${ti}`}
                  d={`M ${item.x} ${item.y} Q ${ctrlX} ${item.y} ${endX} ${tgt.cy}`}
                  fill="none"
                  stroke={isShared ? P.primary : P.muted}
                  strokeWidth={isShared ? 1.8 : 1.2}
                  strokeLinecap="round"
                  opacity={isShared ? 0.6 : 0.35}
                  style={{
                    animation: `ppt-pulse-line ${3 + (i * 0.2 + ti * 0.1)}s ease-in-out ${i * 0.12}s infinite`,
                  }}
                />
              )
            })
          })}
          {items.map((item, i) => {
            const shared = item.side === "shared"
            const w = item.title.length * 13 + 36
            return (
              <g key={`pill-${item.title}`}>
                {shared && (
                  <circle
                    cx={item.x}
                    cy={item.y}
                    r="50"
                    fill={P.primary}
                    opacity="0.18"
                    style={{
                      transformOrigin: `${item.x}px ${item.y}px`,
                      animation: `ppt-ping-soft ${2.6 + i * 0.2}s ease-out infinite`,
                    }}
                  />
                )}
                <rect
                  x={item.x - w / 2}
                  y={item.y - 26}
                  width={w}
                  height={52}
                  rx={26}
                  fill={P.elevated}
                  stroke={shared ? P.primary : `${P.muted}88`}
                  strokeWidth={shared ? 2.5 : 1.5}
                />
                {shared && (
                  <circle
                    cx={item.x - w / 2 + 18}
                    cy={item.y}
                    r="6"
                    fill={P.primary}
                  />
                )}
                <text
                  x={item.x + (shared ? 10 : 0)}
                  y={item.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily={SERIF}
                  fontSize="22"
                  fontWeight={500}
                  fill={P.text}
                >
                  {item.title}
                </text>
              </g>
            )
          })}
          {[
            { ...youA, label: "you", color: P.primary },
            { ...priyaA, label: "priya", color: P.secondary },
          ].map((a) => (
            <g key={a.label}>
              <circle
                cx={a.cx}
                cy={a.cy}
                r={a.r + 14}
                fill={a.color}
                opacity="0.22"
                style={{
                  transformOrigin: `${a.cx}px ${a.cy}px`,
                  animation: "ppt-ping-soft 3s ease-out infinite",
                }}
              />
              <circle cx={a.cx} cy={a.cy} r={a.r} fill={a.color} />
              <text
                x={a.cx}
                y={a.cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily={SERIF}
                fontSize="36"
                fontWeight={600}
                fill={P.bg}
              >
                {a.label.charAt(0).toUpperCase()}
              </text>
              <text
                x={a.cx}
                y={a.cy + a.r + 36}
                textAnchor="middle"
                fontFamily={SERIF}
                fontSize="22"
                fontWeight={500}
                fill={P.text}
              >
                {a.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

function ConstellationViz() {
  const people = [
    { name: "you", x: 400, y: 240, central: true },
    { name: "Priya", x: 160, y: 110, central: false },
    { name: "Jordan", x: 640, y: 110, central: false },
    { name: "Maya", x: 400, y: 430, central: false },
  ]
  const bonds = [
    { from: 0, to: 1, shared: ["Radiohead", "1984"] },
    { from: 0, to: 2, shared: ["folklore"] },
    { from: 0, to: 3, shared: ["Arrival", "Hollow Knight"] },
    { from: 1, to: 2, shared: ["Dune"] },
  ]

  return (
    <div className="relative aspect-[16/11] w-full">
      <svg
        viewBox="0 0 800 560"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ overflow: "visible" }}
      >
        {bonds.map((b, i) => {
          const from = people[b.from]
          const to = people[b.to]
          const thickness = 2.5 + b.shared.length * 2.2
          const midX = (from.x + to.x) / 2
          const midY = (from.y + to.y) / 2
          return (
            <g key={`bond-${i}`}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={P.primary}
                strokeWidth={thickness + 8}
                strokeLinecap="round"
                opacity="0.12"
              />
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={P.primary}
                strokeWidth={thickness}
                strokeLinecap="round"
                opacity="0.75"
                style={{
                  animation: `ppt-pulse-line ${2.6 + i * 0.4}s ease-in-out ${i * 0.35}s infinite`,
                }}
              />
              {b.shared.map((item, idx) => {
                const dx = to.x - from.x
                const dy = to.y - from.y
                const len = Math.sqrt(dx * dx + dy * dy) || 1
                const tdx = dx / len
                const tdy = dy / len
                const px = -dy / len
                const py = dx / len
                const cx = 400
                const cy = 240
                const dot = (midX - cx) * px + (midY - cy) * py
                const sign = dot >= 0 ? 1 : -1
                const perpOffset = 50 * sign
                const stackSpread = (idx - (b.shared.length - 1) / 2) * 64
                const ox = midX + tdx * stackSpread + px * perpOffset
                const oy = midY + tdy * stackSpread + py * perpOffset
                const w = item.length * 12 + 28
                return (
                  <g key={`${i}-${item}`}>
                    <line
                      x1={midX + tdx * stackSpread}
                      y1={midY + tdy * stackSpread}
                      x2={ox}
                      y2={oy}
                      stroke={P.primary}
                      strokeWidth="1.5"
                      opacity="0.5"
                    />
                    <rect
                      x={ox - w / 2}
                      y={oy - 18}
                      width={w}
                      height={36}
                      rx={18}
                      fill={P.elevated}
                      stroke={P.primary}
                      strokeWidth="2"
                    />
                    <text
                      x={ox}
                      y={oy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontFamily={SERIF}
                      fontSize={18}
                      fontWeight={500}
                      fill={P.primary}
                    >
                      {item}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })}
        {people.map((p) => {
          const r = p.central ? 60 : 48
          const haloR = p.central ? 78 : 64
          const fill = p.central ? P.primary : P.secondary
          const labelOffset = r + 30
          return (
            <g key={p.name}>
              <circle
                cx={p.x}
                cy={p.y}
                r={haloR}
                fill={P.primary}
                opacity={p.central ? 0.22 : 0.16}
                style={{
                  transformOrigin: `${p.x}px ${p.y}px`,
                  animation: `ppt-ping-soft ${p.central ? 2.6 : 3.2}s ease-out infinite`,
                }}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={fill}
                stroke={P.primary}
                strokeWidth={p.central ? 0 : 2.5}
              />
              <text
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily={SERIF}
                fontSize={p.central ? 28 : 32}
                fontWeight={600}
                fill={P.bg}
              >
                {p.central ? "you" : p.name.charAt(0)}
              </text>
              {!p.central && (
                <text
                  x={p.x}
                  y={p.y + labelOffset}
                  textAnchor="middle"
                  fontFamily={SERIF}
                  fontSize="22"
                  fontWeight={500}
                  fill={P.text}
                >
                  {p.name}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ----------------------------------------------------------------- */
/* shared bits                                                       */
/* ----------------------------------------------------------------- */

function FadeUp({
  children,
  delay = 0,
}: {
  children: React.ReactNode
  delay?: number
}) {
  return (
    <div
      style={{
        animation: `ppt-fade-up 0.7s ${delay}s ease-out both`,
      }}
    >
      {children}
    </div>
  )
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-mono text-xs tracking-[0.4em] uppercase md:text-sm"
      style={{ color: P.muted }}
    >
      <span
        className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
        style={{ backgroundColor: P.primary }}
      />
      {children}
    </div>
  )
}

function GapColumn({
  big,
  unit,
  label,
  sub,
  tone,
}: {
  big: string
  unit: string
  label: string
  sub: string
  tone: "primary" | "muted" | "secondary"
}) {
  const color =
    tone === "primary"
      ? P.primary
      : tone === "secondary"
        ? P.secondary
        : P.muted
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        style={{
          fontFamily: SERIF,
          color,
          fontSize: "clamp(120px, 16vw, 220px)",
          lineHeight: 0.85,
          letterSpacing: "-0.04em",
        }}
      >
        {big}
      </div>
      <div
        className="font-mono text-xs tracking-[0.3em] uppercase"
        style={{ color: P.muted }}
      >
        {unit}
      </div>
      <div
        className="text-xl font-semibold md:text-2xl"
        style={{ color, opacity: tone === "muted" ? 0.7 : 1 }}
      >
        {label}
      </div>
      <div className="text-sm" style={{ color: P.muted }}>
        {sub}
      </div>
    </div>
  )
}

function TrapCard({
  big,
  headline,
  sub,
  stats,
}: {
  big: string
  headline: string
  sub: string
  stats: string[]
}) {
  return (
    <div
      className="flex h-full flex-col gap-4 rounded-3xl border p-8"
      style={{
        borderColor: `${P.muted}55`,
        backgroundColor: P.elevated,
      }}
    >
      <div
        style={{
          fontFamily: SERIF,
          color: P.primary,
          fontSize: "clamp(64px, 8vw, 110px)",
          lineHeight: 0.9,
          letterSpacing: "-0.04em",
        }}
      >
        {big}
      </div>
      <div className="text-2xl md:text-3xl" style={{ color: P.text }}>
        {headline}
      </div>
      <div
        className="text-base"
        style={{ color: P.text, opacity: 0.7 }}
        dangerouslySetInnerHTML={{ __html: sub }}
      />
      <ul className="mt-2 flex flex-col gap-2 text-sm md:text-base">
        {stats.map((s, i) => (
          <li
            key={i}
            className="flex gap-3"
            style={{ color: P.text, opacity: 0.85 }}
          >
            <span
              className="mt-2 inline-block h-1 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: P.primary }}
            />
            <span dangerouslySetInnerHTML={{ __html: s }} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProfitBar({
  name,
  value,
  max,
  color,
}: {
  name: string
  value: number
  max: number
  color: string
}) {
  const pct = (value / max) * 100
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <div
          className="text-2xl font-semibold md:text-3xl"
          style={{ color: P.text, fontFamily: SERIF }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: SERIF,
            color,
            fontSize: "clamp(40px, 4.4vw, 64px)",
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          ${value}B
        </div>
      </div>
      <div
        className="relative h-4 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: `${P.muted}22` }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            backgroundColor: color,
            width: `${pct}%`,
            animation: "ppt-bar-grow 1s 0.2s ease-out both",
          }}
        />
      </div>
      <div
        className="font-mono text-xs tracking-wide"
        style={{ color: P.muted }}
      >
        2025 advertising revenue
      </div>
    </div>
  )
}

function FeatureCard({
  cat,
  title,
  body,
}: {
  cat: string
  title: string
  body: string
}) {
  return (
    <div
      className="flex h-full flex-col gap-3 rounded-2xl border p-6"
      style={{
        borderColor: `${P.muted}55`,
        backgroundColor: P.elevated,
      }}
    >
      <div
        className="font-mono text-xs tracking-[0.3em] uppercase"
        style={{ color: P.primary }}
      >
        {cat}
      </div>
      <div
        className="text-xl font-semibold leading-tight md:text-2xl"
        style={{ color: P.text, fontFamily: SERIF }}
        dangerouslySetInnerHTML={{ __html: title }}
      />
      <div
        className="text-base leading-snug"
        style={{ color: P.text, opacity: 0.75 }}
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </div>
  )
}

function Pillar({
  n,
  title,
  body,
}: {
  n: string
  title: string
  body: string
}) {
  return (
    <div
      className="flex h-full flex-col gap-3 rounded-2xl border p-6 text-left"
      style={{
        borderColor: `${P.muted}55`,
        backgroundColor: P.elevated,
      }}
    >
      <div
        className="font-mono text-xs tracking-[0.3em]"
        style={{ color: P.primary }}
      >
        {n}
      </div>
      <div
        className="text-xl font-semibold md:text-2xl"
        style={{ color: P.text }}
      >
        {title}
      </div>
      <div
        className="text-base md:text-lg"
        style={{ color: P.text, opacity: 0.75 }}
      >
        {body}
      </div>
    </div>
  )
}

function Chrome({
  idx,
  total,
  next,
  prev,
  jump,
}: {
  idx: number
  total: number
  next: () => void
  prev: () => void
  jump: (i: number) => void
}) {
  return (
    <>
      <div
        className="absolute top-6 left-8 z-20 flex items-center gap-2 font-mono text-xs tracking-[0.4em] uppercase"
        style={{ color: P.muted }}
      >
        <span
          className="inline-block h-2 w-2 animate-pulse rounded-full"
          style={{ backgroundColor: P.primary }}
        />
        homie · pitch
      </div>
      <div
        className="absolute top-6 right-8 z-20 font-mono text-xs tracking-[0.25em]"
        style={{ color: P.muted }}
      >
        {String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </div>

      <div className="absolute bottom-7 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            onClick={() => jump(i)}
            aria-label={`Go to slide ${i + 1}`}
            className="h-1.5 rounded-full transition-all"
            style={{
              width: i === idx ? 28 : 6,
              backgroundColor: i === idx ? P.primary : `${P.muted}66`,
            }}
          />
        ))}
      </div>

      <button
        onClick={prev}
        aria-label="Previous slide"
        className="absolute bottom-6 left-8 z-20 rounded-full border px-4 py-2 font-mono text-xs tracking-[0.2em] uppercase transition disabled:pointer-events-none disabled:opacity-30"
        style={{
          borderColor: `${P.muted}66`,
          color: P.text,
          backgroundColor: `${P.elevated}cc`,
        }}
      >
        ← prev
      </button>
      <button
        onClick={next}
        aria-label="Next slide"
        className="absolute right-8 bottom-6 z-20 rounded-full border px-4 py-2 font-mono text-xs tracking-[0.2em] uppercase transition disabled:pointer-events-none disabled:opacity-30"
        style={{
          borderColor: `${P.muted}66`,
          color: P.text,
          backgroundColor: `${P.elevated}cc`,
        }}
      >
        next →
      </button>
    </>
  )
}

function AmbientGlows() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 z-0 h-[600px] w-[600px] rounded-full opacity-35 blur-3xl"
        style={{ background: P.primary }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-40 z-0 h-[640px] w-[640px] rounded-full opacity-25 blur-3xl"
        style={{ background: P.secondary }}
      />
    </>
  )
}

function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 mix-blend-multiply"
      style={{
        opacity: 0.18,
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='linear' slope='0.9'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        backgroundSize: "200px 200px",
      }}
    />
  )
}

function Keyframes() {
  return (
    <style>{`
      @keyframes ppt-fade-up {
        from { opacity: 0; transform: translateY(14px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes ppt-slide-in {
        from { opacity: 0; transform: translateY(8px) scale(0.99); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes ppt-pulse-line {
        0%, 100% { opacity: 0.2; }
        50% { opacity: 0.95; }
      }
      @keyframes ppt-ping-soft {
        0% { transform: scale(1); opacity: 0.6; }
        100% { transform: scale(1.9); opacity: 0; }
      }
      @keyframes ppt-line-draw {
        from { stroke-dashoffset: 1600; }
        to { stroke-dashoffset: 0; }
      }
      @keyframes ppt-bar-grow {
        from { width: 0; }
      }
    `}</style>
  )
}
