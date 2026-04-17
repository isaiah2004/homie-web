"use client"

import { useEffect, useMemo, useRef } from "react"
import gsap from "gsap"

// A scatter of faint floating dots that drift — used on "problem" slide
// to convey isolation (each dot alone, unconnected).
export function Constellation({ count = 46 }: { count?: number }) {
  const wrap = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!wrap.current) return
    const dots = wrap.current.querySelectorAll<SVGCircleElement>("circle")
    const ctx = gsap.context(() => {
      dots.forEach((d) => {
        gsap.to(d, {
          cx: `+=${gsap.utils.random(-20, 20)}`,
          cy: `+=${gsap.utils.random(-20, 20)}`,
          duration: gsap.utils.random(4, 10),
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        })
        gsap.to(d, {
          opacity: gsap.utils.random(0.15, 0.6),
          duration: gsap.utils.random(2, 5),
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        })
      })
    })
    return () => ctx.revert()
  }, [])

  const points = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // deterministic pseudo-random so SSR and client match
        const s = (n: number) => {
          const x = Math.sin(i * 9301 + n * 49297) * 233280
          return x - Math.floor(x)
        }
        return { x: s(1) * 100, y: s(2) * 100, r: s(3) * 1.8 + 0.6 }
      }),
    [count],
  )

  return (
    <svg
      ref={wrap}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-80"
    >
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="white" opacity={0.3} />
      ))}
    </svg>
  )
}
