"use client"

import { ReactNode, useEffect, useRef } from "react"
import gsap from "gsap"

type RevealProps = {
  children: ReactNode
  delay?: number
  y?: number
  duration?: number
  className?: string
  as?: "div" | "span" | "h1" | "h2" | "h3" | "p"
  slideKey?: string | number
}

export function Reveal({
  children,
  delay = 0,
  y = 18,
  duration = 0.8,
  className,
  as: Tag = "div",
  slideKey,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!ref.current) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ref.current,
        { opacity: 0, y, filter: "blur(8px)" },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration,
          delay,
          ease: "power3.out",
        },
      )
    })
    return () => ctx.revert()
  }, [delay, y, duration, slideKey])
  return (
    // @ts-expect-error - dynamic tag name
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  )
}

type RevealWordsProps = {
  text: string
  className?: string
  wordClassName?: string
  delay?: number
  stagger?: number
  slideKey?: string | number
}

export function RevealWords({
  text,
  className,
  wordClassName,
  delay = 0,
  stagger = 0.06,
  slideKey,
}: RevealWordsProps) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const words = ref.current.querySelectorAll("[data-w]")
    const ctx = gsap.context(() => {
      gsap.fromTo(
        words,
        { opacity: 0, y: 22, filter: "blur(10px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.9, delay, stagger, ease: "power3.out" },
      )
    })
    return () => ctx.revert()
  }, [text, delay, stagger, slideKey])

  // bg-clip-text + text-transparent on an outer element doesn't propagate
  // to inline-block children — gradient text has to live on each word span.
  // className is for outer layout, wordClassName is for per-word visual styling.
  // no overflow-hidden on the per-word wrapper: the intro already hides the
  // word via opacity+blur, and clipping the wrapper chops descenders like
  // the "g" in "language" / "again".
  return (
    <span ref={ref} className={className}>
      {text.split(" ").map((w, i) => (
        <span key={i} className="inline-block pr-[0.25em] align-baseline">
          <span data-w className={`inline-block ${wordClassName ?? ""}`}>
            {w}
          </span>
        </span>
      ))}
    </span>
  )
}
