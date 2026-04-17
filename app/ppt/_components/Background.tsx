"use client"

import { useEffect, useRef } from "react"
import gsap from "gsap"

type BackgroundProps = {
  palette: [string, string, string]
}

export function Background({ palette }: BackgroundProps) {
  const blobA = useRef<HTMLDivElement>(null)
  const blobB = useRef<HTMLDivElement>(null)
  const blobC = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.to(blobA.current, {
        xPercent: 20,
        yPercent: -15,
        scale: 1.25,
        duration: 14,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      })
      gsap.to(blobB.current, {
        xPercent: -22,
        yPercent: 18,
        scale: 0.9,
        duration: 18,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      })
      gsap.to(blobC.current, {
        xPercent: 10,
        yPercent: 25,
        scale: 1.15,
        duration: 22,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      })
    })
    return () => ctx.revert()
  }, [palette])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#0a0910]" />
      <div
        ref={blobA}
        className="absolute -top-40 -left-40 h-[70vmax] w-[70vmax] rounded-full opacity-60 blur-[120px] will-change-transform"
        style={{ background: `radial-gradient(circle at 30% 30%, ${palette[0]}, transparent 60%)` }}
      />
      <div
        ref={blobB}
        className="absolute top-10 right-0 h-[65vmax] w-[65vmax] rounded-full opacity-55 blur-[120px] will-change-transform"
        style={{ background: `radial-gradient(circle at 70% 40%, ${palette[1]}, transparent 60%)` }}
      />
      <div
        ref={blobC}
        className="absolute -bottom-40 left-1/4 h-[70vmax] w-[70vmax] rounded-full opacity-50 blur-[140px] will-change-transform"
        style={{ background: `radial-gradient(circle at 50% 50%, ${palette[2]}, transparent 60%)` }}
      />
      {/* grain overlay */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.18] mix-blend-overlay" aria-hidden>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
      {/* vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </div>
  )
}
