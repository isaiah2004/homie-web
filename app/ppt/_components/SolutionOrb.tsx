"use client"

import { useEffect, useRef } from "react"
import gsap from "gsap"

const CATEGORIES = [
  { label: "music", hue: "#a78bfa", source: "Spotify" },
  { label: "film", hue: "#f472b6", source: "OMDb" },
  { label: "books", hue: "#fbbf24", source: "Open Library" },
  { label: "games", hue: "#34d399", source: "FreeToGame" },
  { label: "anime", hue: "#60a5fa", source: "Jikan" },
]

export function SolutionOrb() {
  const wrap = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(".orb-core", { scale: 0, transformOrigin: "center" })
      gsap.set(".orb-ring", { scale: 0.6, opacity: 0, transformOrigin: "center" })
      gsap.set(".orb-planet", { scale: 0, transformOrigin: "center" })
      gsap.set(".orb-label", { opacity: 0 })

      const tl = gsap.timeline({
        delay: 0.15,
        onComplete: () => {
          gsap.to(".orb-core", {
            scale: 1.08,
            duration: 2.4,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          })
          gsap.to(".orb-planet", {
            scale: 1.12,
            duration: 1.8,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            stagger: { each: 0.25, from: "random" },
          })
          gsap.to(".orb-ring", {
            scale: 1.04,
            duration: 3.6,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            stagger: 0.4,
          })
        },
      })
      tl.to(".orb-core", { scale: 1, duration: 0.7, ease: "back.out(1.6)" })
        .to(".orb-ring", { scale: 1, opacity: 1, duration: 0.8, ease: "power2.out", stagger: 0.12 }, "-=0.3")
        .to(".orb-planet", { scale: 1, duration: 0.6, ease: "back.out(1.8)", stagger: 0.08 }, "-=0.5")
        .to(".orb-label", { opacity: 1, duration: 0.4, stagger: 0.04 }, "-=0.3")
    }, wrap)
    return () => ctx.revert()
  }, [])

  const cx = 300
  const cy = 260
  const orbitR = 170

  return (
    <svg ref={wrap} viewBox="0 0 600 520" className="h-full w-full">
      <defs>
        <radialGradient id="orb-core-grad" cx="0.4" cy="0.4">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="45%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#7c3aed" />
        </radialGradient>
        <filter id="orb-glow">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* rings */}
      {[1, 2, 3].map((i) => (
        <circle
          key={i}
          className="orb-ring"
          cx={cx}
          cy={cy}
          r={60 + i * 40}
          fill="none"
          stroke="white"
          strokeOpacity={0.08 + (3 - i) * 0.04}
          strokeWidth={1}
        />
      ))}

      {/* planets (static positions, individually pulsing) */}
      <g>
        {CATEGORIES.map((c, i) => {
          const angle = (i / CATEGORIES.length) * Math.PI * 2 - Math.PI / 2
          const x = cx + Math.cos(angle) * orbitR
          const y = cy + Math.sin(angle) * orbitR
          return (
            <g key={c.label} className="orb-planet" style={{ transformOrigin: `${x}px ${y}px` }}>
              <circle
                cx={x}
                cy={y}
                r={22}
                fill={c.hue}
                opacity={0.9}
                filter="url(#orb-glow)"
              />
              <text
                className="orb-label"
                x={x}
                y={y + 4}
                textAnchor="middle"
                fill="#0a0910"
                fontSize="11"
                fontWeight={700}
              >
                {c.label}
              </text>
              <text
                className="orb-label"
                x={x}
                y={y + 38}
                textAnchor="middle"
                fill="#e5e7eb"
                fontSize="9"
                opacity={0.7}
              >
                {c.source}
              </text>
            </g>
          )
        })}
      </g>

      {/* core */}
      <circle
        className="orb-core"
        cx={cx}
        cy={cy}
        r={46}
        fill="url(#orb-core-grad)"
        filter="url(#orb-glow)"
      />
      <text
        className="orb-core"
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        fill="white"
        fontSize="14"
        fontWeight={700}
        letterSpacing={1}
      >
        homie
      </text>
    </svg>
  )
}
