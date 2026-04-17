"use client"

import { useEffect, useRef } from "react"
import gsap from "gsap"

type Item = { id: string; label: string; shared?: boolean }

const LEFT: Item[] = [
  { id: "kid-a", label: "Kid A", shared: true },
  { id: "chrono", label: "Chrono Trigger", shared: true },
  { id: "frieren", label: "Frieren", shared: true },
  { id: "dune", label: "Dune" },
  { id: "arrival", label: "Arrival" },
  { id: "jeff", label: "Jeff Buckley" },
]

// shared items are deliberately placed on different rows on the RIGHT than
// on the LEFT so the connecting lines cross each other — a visual metaphor
// for worlds that don't line up on the surface but share a hidden spine.
const RIGHT: Item[] = [
  { id: "chrono", label: "Chrono Trigger", shared: true }, // left row 1 → right row 0
  { id: "pynchon", label: "Pynchon" },
  { id: "hollow", label: "Hollow Knight" },
  { id: "frieren", label: "Frieren", shared: true }, // left row 2 → right row 3
  { id: "sufjan", label: "Sufjan" },
  { id: "kid-a", label: "Kid A", shared: true }, // left row 0 → right row 5
]

// layout constants
const VB_W = 900
const VB_H = 500
const LEFT_COL_X = 230
const RIGHT_COL_X = 670
const AVATAR_Y = 60
const ROW_START_Y = 150
const ROW_GAP = 50
const NODE_R = 7
const SHARED_NODE_R = 10
const PULSE_LEN = 26

export function InterestGraph() {
  const wrap = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!wrap.current) return
    const root = wrap.current
    const ctx = gsap.context(() => {
      const bases = root.querySelectorAll<SVGPathElement>(".ig-link-base")
      const pulses = root.querySelectorAll<SVGPathElement>(".ig-link-pulse")

      // draw-in setup for base lines
      bases.forEach((p) => {
        const L = p.getTotalLength()
        gsap.set(p, { strokeDasharray: L, strokeDashoffset: L })
      })

      // pulse setup: a short visible dash followed by a big invisible gap
      // so only one bright packet is on the path at any time. Two staggered
      // pulses per link guarantee at least one is always on-screen.
      pulses.forEach((p) => {
        const L = p.getTotalLength()
        gsap.set(p, {
          strokeDasharray: `${PULSE_LEN} ${L + PULSE_LEN}`,
          strokeDashoffset: 0,
          opacity: 0,
        })
      })

      gsap.set(".ig-node", { scale: 0, transformOrigin: "center" })
      gsap.set(".ig-label", { opacity: 0 })
      gsap.set(".ig-avatar", { scale: 0.6, opacity: 0, transformOrigin: "center" })

      const tl = gsap.timeline({
        delay: 0.25,
        onComplete: () => {
          // shared-node heartbeat
          gsap.to(".ig-shared", {
            scale: 1.25,
            duration: 1.4,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            stagger: { each: 0.22, from: "random" },
          })
          // avatar breathing
          gsap.to(".ig-avatar", {
            scale: 1.05,
            duration: 2.6,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            stagger: 0.3,
          })
          // continuous travelling packets. Every link has three pulses at
          // 1/3-cycle offsets so the line is always alive with motion and
          // readable as a stream, not a single dot.
          const DURATION = 2.6
          const SLOT_FRACTION: Record<string, number> = { a: 0, b: 1 / 3, c: 2 / 3 }
          pulses.forEach((p) => {
            const L = p.getTotalLength()
            const span = L + PULSE_LEN
            const frac = SLOT_FRACTION[p.dataset.pulse ?? "a"] ?? 0
            const start = -span * frac
            const end = start - span
            gsap.set(p, { opacity: 1 })
            gsap.fromTo(
              p,
              { strokeDashoffset: start },
              {
                strokeDashoffset: end,
                duration: DURATION,
                ease: "none",
                repeat: -1,
              },
            )
          })
        },
      })

      tl.to(".ig-avatar", {
        scale: 1,
        opacity: 1,
        duration: 0.8,
        ease: "back.out(1.6)",
        stagger: 0.15,
      })
        .to(
          ".ig-node",
          { scale: 1, duration: 0.5, ease: "back.out(1.8)", stagger: 0.05 },
          "-=0.5",
        )
        .to(".ig-label", { opacity: 1, duration: 0.4, stagger: 0.04 }, "-=0.4")
        .to(
          ".ig-link-base",
          {
            strokeDashoffset: 0,
            duration: 1.1,
            ease: "power3.out",
            stagger: 0.14,
          },
          "-=0.2",
        )
    }, wrap)
    return () => ctx.revert()
  }, [])

  const leftNodes = LEFT.map((n, i) => ({
    ...n,
    x: LEFT_COL_X,
    y: ROW_START_Y + i * ROW_GAP,
  }))
  const rightNodes = RIGHT.map((n, i) => ({
    ...n,
    x: RIGHT_COL_X,
    y: ROW_START_Y + i * ROW_GAP,
  }))

  const links = leftNodes
    .filter((n) => n.shared)
    .map((ln) => {
      const rn = rightNodes.find((r) => r.id === ln.id)!
      const midX = (ln.x + rn.x) / 2
      const d = `M ${ln.x + 12} ${ln.y} C ${midX} ${ln.y}, ${midX} ${rn.y}, ${rn.x - 12} ${rn.y}`
      return { id: ln.id, d }
    })

  return (
    <svg ref={wrap} viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-full w-full">
      <defs>
        <linearGradient
          id="ig-link-grad"
          gradientUnits="userSpaceOnUse"
          x1={LEFT_COL_X}
          y1="0"
          x2={RIGHT_COL_X}
          y2="0"
        >
          <stop offset="0%" stopColor="#c084fc" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#f472b6" stopOpacity="1" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id="ig-avatar-grad-a" cx="0.4" cy="0.4">
          <stop offset="0%" stopColor="#f9a8d4" />
          <stop offset="100%" stopColor="#7c3aed" />
        </radialGradient>
        <radialGradient id="ig-avatar-grad-b" cx="0.4" cy="0.4">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#ec4899" />
        </radialGradient>
        <filter id="ig-glow">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="ig-pulse-glow">
          <feGaussianBlur stdDeviation="4.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* base gradient line (static) */}
      {links.map((lk, i) => (
        <path
          key={`base-${lk.id}-${i}`}
          className="ig-link-base"
          d={lk.d}
          stroke="url(#ig-link-grad)"
          strokeOpacity={0.75}
          strokeWidth={1.8}
          fill="none"
          strokeLinecap="round"
        />
      ))}

      {/* travelling pulse packets (three per link, 1/3-cycle offset) */}
      {links.flatMap((lk, i) =>
        (["a", "b", "c"] as const).map((slot) => (
          <path
            key={`pulse-${lk.id}-${i}-${slot}`}
            className="ig-link-pulse"
            data-pulse={slot}
            d={lk.d}
            stroke="#fff"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            filter="url(#ig-pulse-glow)"
          />
        )),
      )}

      {/* avatars */}
      <g className="ig-avatar">
        <circle cx={LEFT_COL_X} cy={AVATAR_Y} r={32} fill="url(#ig-avatar-grad-a)" filter="url(#ig-glow)" />
        <text x={LEFT_COL_X} y={AVATAR_Y + 4} textAnchor="middle" fill="white" fontSize="12" fontWeight={700}>
          you
        </text>
      </g>
      <g className="ig-avatar">
        <circle cx={RIGHT_COL_X} cy={AVATAR_Y} r={32} fill="url(#ig-avatar-grad-b)" filter="url(#ig-glow)" />
        <text x={RIGHT_COL_X} y={AVATAR_Y + 4} textAnchor="middle" fill="white" fontSize="12" fontWeight={700}>
          them
        </text>
      </g>

      {/* left column */}
      {leftNodes.map((n, i) => (
        <g key={`l-${n.id}-${i}`}>
          <circle
            className={`ig-node ${n.shared ? "ig-shared" : ""}`}
            cx={n.x}
            cy={n.y}
            r={n.shared ? SHARED_NODE_R : NODE_R}
            fill={n.shared ? "#fbbf24" : "#fff"}
            opacity={n.shared ? 1 : 0.5}
            filter={n.shared ? "url(#ig-glow)" : undefined}
          />
          <text
            className="ig-label"
            x={n.x - 18}
            y={n.y + 4}
            textAnchor="end"
            fill={n.shared ? "#fde68a" : "#e5e7eb"}
            fontSize="13"
            fontWeight={n.shared ? 600 : 400}
            opacity={n.shared ? 1 : 0.7}
          >
            {n.label}
          </text>
        </g>
      ))}

      {/* right column */}
      {rightNodes.map((n, i) => (
        <g key={`r-${n.id}-${i}`}>
          <circle
            className={`ig-node ${n.shared ? "ig-shared" : ""}`}
            cx={n.x}
            cy={n.y}
            r={n.shared ? SHARED_NODE_R : NODE_R}
            fill={n.shared ? "#fbbf24" : "#fff"}
            opacity={n.shared ? 1 : 0.5}
            filter={n.shared ? "url(#ig-glow)" : undefined}
          />
          <text
            className="ig-label"
            x={n.x + 18}
            y={n.y + 4}
            textAnchor="start"
            fill={n.shared ? "#fde68a" : "#e5e7eb"}
            fontSize="13"
            fontWeight={n.shared ? 600 : 400}
            opacity={n.shared ? 1 : 0.7}
          >
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
