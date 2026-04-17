"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import gsap from "gsap"

type Phase = "in" | "out"

type GNode = {
  id: string
  label?: string
  color: string
  r: number
  phase: Phase
}

type GEdge = {
  id: string
  a: string
  b: string
  phase: Phase
}

type Physics = {
  x: number
  y: number
  vx: number
  vy: number
}

const LABELS = [
  "Kid A",
  "Dune",
  "Frieren",
  "Halo",
  "Pynchon",
  "Arrival",
  "Chrono",
  "Sufjan",
  "Hollow Knight",
  "Evangelion",
  "Tame Impala",
  "Mass Effect",
  "Fleetwood",
  "Berserk",
  "Severance",
  "Interstellar",
  "Portal",
  "Bloodborne",
  "Frank Ocean",
  "Radiohead",
  "Tarkovsky",
  "Outer Wilds",
]

const COLORS = ["#f472b6", "#c084fc", "#fbbf24", "#22d3ee", "#fb7185"]

let idCounter = 0
const nextId = () => `n${++idCounter}`

function makeNode(): GNode {
  return {
    id: nextId(),
    r: 2.8 + Math.random() * 3.8,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    label: Math.random() > 0.5 ? LABELS[Math.floor(Math.random() * LABELS.length)] : undefined,
    phase: "in",
  }
}

function edgeKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function computeDesiredEdges(liveNodes: GNode[], phys: Map<string, Physics>): GEdge[] {
  const edges: GEdge[] = []
  const seen = new Set<string>()
  for (const n of liveNodes) {
    const pa = phys.get(n.id)
    if (!pa) continue
    const ranked = liveNodes
      .filter((o) => o.id !== n.id)
      .map((o) => {
        const pb = phys.get(o.id)
        if (!pb) return null
        return { o, d: Math.hypot(pb.x - pa.x, pb.y - pa.y) }
      })
      .filter((x): x is { o: GNode; d: number } => x !== null)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
    for (const { o } of ranked) {
      const k = edgeKey(n.id, o.id)
      if (seen.has(k)) continue
      seen.add(k)
      const [aa, bb] = n.id < o.id ? [n.id, o.id] : [o.id, n.id]
      edges.push({ id: k, a: aa, b: bb, phase: "in" })
    }
  }
  return edges
}

function reconcileEdgesPure(
  prevEdges: GEdge[],
  desired: GEdge[],
): { next: GEdge[]; dying: string[] } {
  const desiredMap = new Map(desired.map((e) => [e.id, e]))
  const next: GEdge[] = []
  const seen = new Set<string>()
  const dying: string[] = []
  for (const e of prevEdges) {
    seen.add(e.id)
    if (desiredMap.has(e.id)) {
      next.push({ ...e, phase: "in" })
    } else if (e.phase === "in") {
      next.push({ ...e, phase: "out" })
      dying.push(e.id)
    } else {
      next.push(e)
    }
  }
  for (const e of desired) {
    if (!seen.has(e.id)) next.push(e)
  }
  return { next, dying }
}

function randomEdgeSpawn(w: number, h: number): { x: number; y: number } {
  const side = Math.floor(Math.random() * 4)
  if (side === 0) return { x: 30, y: 40 + Math.random() * (h - 80) }
  if (side === 1) return { x: w - 30, y: 40 + Math.random() * (h - 80) }
  if (side === 2) return { x: 40 + Math.random() * (w - 80), y: 30 }
  return { x: 40 + Math.random() * (w - 80), y: h - 30 }
}

export function BondNetwork() {
  const wrap = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState({ w: 0, h: 0 })
  const dimRef = useRef({ w: 0, h: 0 })
  const [nodes, setNodes] = useState<GNode[]>([])
  const [edges, setEdges] = useState<GEdge[]>([])
  const nodesRef = useRef<GNode[]>([])
  const edgesRef = useRef<GEdge[]>([])
  const physicsRef = useRef<Map<string, Physics>>(new Map())
  const nodeElsRef = useRef<
    Map<string, { circle: SVGCircleElement | null; label: SVGTextElement | null }>
  >(new Map())
  const edgeElsRef = useRef<Map<string, SVGLineElement>>(new Map())
  const seededRef = useRef(false)

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])
  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  // track container size
  useEffect(() => {
    if (!wrap.current) return
    const update = () => {
      if (!wrap.current) return
      const r = wrap.current.getBoundingClientRect()
      dimRef.current = { w: r.width, h: r.height }
      setDim({ w: r.width, h: r.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])

  // cleanup on unmount
  useEffect(() => {
    return () => {
      physicsRef.current.clear()
      nodeElsRef.current.clear()
      edgeElsRef.current.clear()
    }
  }, [])

  // seed once — seededRef guards strict-mode double-invoke
  useEffect(() => {
    if (dim.w < 100 || dim.h < 100 || seededRef.current) return
    seededRef.current = true
    const w = dim.w
    const h = dim.h
    const count = Math.min(34, Math.max(22, Math.round((w * h) / 32000)))
    const seeded: GNode[] = []
    for (let i = 0; i < count; i++) {
      const n = makeNode()
      seeded.push(n)
      physicsRef.current.set(n.id, {
        x: 40 + Math.random() * (w - 80),
        y: 40 + Math.random() * (h - 80),
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
      })
    }
    setNodes(seeded)
    setEdges(computeDesiredEdges(seeded, physicsRef.current))
  }, [dim.w, dim.h])

  // spawn / cull cycle — all side effects live here, outside setState updaters
  useEffect(() => {
    if (dim.w < 100) return
    const tick = () => {
      const prev = nodesRef.current
      const live = prev.filter((n) => n.phase === "in")
      if (live.length < 4) return

      const cullCount = Math.min(2, live.length - 2)
      const killIds = new Set<string>()
      while (killIds.size < cullCount) {
        killIds.add(live[Math.floor(Math.random() * live.length)].id)
      }
      const cycled = prev.map((n) =>
        killIds.has(n.id) ? { ...n, phase: "out" as Phase } : n,
      )

      const spawnCount = 2 + (Math.random() < 0.3 ? 1 : 0)
      const spawn: GNode[] = []
      for (let i = 0; i < spawnCount; i++) {
        const n = makeNode()
        spawn.push(n)
        const { x, y } = randomEdgeSpawn(dimRef.current.w, dimRef.current.h)
        const cx = dimRef.current.w / 2
        const cy = dimRef.current.h / 2
        const len = Math.hypot(cx - x, cy - y) || 1
        physicsRef.current.set(n.id, {
          x,
          y,
          vx: ((cx - x) / len) * 0.5 + (Math.random() - 0.5) * 0.3,
          vy: ((cy - y) / len) * 0.5 + (Math.random() - 0.5) * 0.3,
        })
      }

      const nextNodes = [...cycled, ...spawn]
      setNodes(nextNodes)

      // schedule the actual node removal after fade-out animation
      setTimeout(() => {
        for (const id of killIds) physicsRef.current.delete(id)
        setNodes((curr) => curr.filter((n) => !killIds.has(n.id)))
      }, 950)

      // edge reconciliation — pure compute, side effects scheduled outside updater
      const nextLive = nextNodes.filter((n) => n.phase === "in")
      const desired = computeDesiredEdges(nextLive, physicsRef.current)
      const { next: nextEdges, dying } = reconcileEdgesPure(edgesRef.current, desired)
      setEdges(nextEdges)
      for (const id of dying) {
        setTimeout(() => {
          setEdges((curr) => curr.filter((x) => x.id !== id))
        }, 700)
      }
    }
    const interval = setInterval(tick, 1400)
    return () => clearInterval(interval)
  }, [dim.w, dim.h])

  // continuous edge rewire — no node changes, just topology reshuffle as nodes drift
  useEffect(() => {
    if (dim.w < 100) return
    const tick = () => {
      const live = nodesRef.current.filter((n) => n.phase === "in")
      if (live.length < 4) return
      const desired = computeDesiredEdges(live, physicsRef.current)
      const { next, dying } = reconcileEdgesPure(edgesRef.current, desired)
      setEdges(next)
      for (const id of dying) {
        setTimeout(() => {
          setEdges((curr) => curr.filter((x) => x.id !== id))
        }, 700)
      }
    }
    const interval = setInterval(tick, 900)
    return () => clearInterval(interval)
  }, [dim.w])

  // physics simulation — per-frame force resolution + DOM paint
  useEffect(() => {
    if (dim.w < 100) return
    let raf = 0
    const tick = () => {
      const phys = physicsRef.current
      const { w, h } = dimRef.current

      const ids = Array.from(phys.keys())
      const forces = new Map<string, { fx: number; fy: number }>()
      for (const id of ids) forces.set(id, { fx: 0, fy: 0 })

      for (let i = 0; i < ids.length; i++) {
        const pa = phys.get(ids[i])!
        for (let j = i + 1; j < ids.length; j++) {
          const pb = phys.get(ids[j])!
          const dx = pb.x - pa.x
          const dy = pb.y - pa.y
          const distSq = dx * dx + dy * dy + 40
          const dist = Math.sqrt(distSq)
          const mag = 900 / distSq
          const fx = (dx / dist) * mag
          const fy = (dy / dist) * mag
          const fa = forces.get(ids[i])!
          const fb = forces.get(ids[j])!
          fa.fx -= fx
          fa.fy -= fy
          fb.fx += fx
          fb.fy += fy
        }
      }

      const restLen = 120
      for (const e of edgesRef.current) {
        if (e.phase !== "in") continue
        const pa = phys.get(e.a)
        const pb = phys.get(e.b)
        if (!pa || !pb) continue
        const dx = pb.x - pa.x
        const dy = pb.y - pa.y
        const dist = Math.hypot(dx, dy) || 0.01
        const diff = dist - restLen
        const k = 0.012
        const fx = (dx / dist) * diff * k
        const fy = (dy / dist) * diff * k
        const fa = forces.get(e.a)
        const fb = forces.get(e.b)
        if (fa) {
          fa.fx += fx
          fa.fy += fy
        }
        if (fb) {
          fb.fx -= fx
          fb.fy -= fy
        }
      }

      const cx = w / 2
      const cy = h / 2
      for (const id of ids) {
        const p = phys.get(id)!
        const f = forces.get(id)!
        f.fx += (cx - p.x) * 0.0012
        f.fy += (cy - p.y) * 0.0012
      }

      const damping = 0.9
      const maxV = 1.4
      const pad = 24
      for (const id of ids) {
        const p = phys.get(id)!
        const f = forces.get(id)!
        p.vx = (p.vx + f.fx) * damping
        p.vy = (p.vy + f.fy) * damping
        const v = Math.hypot(p.vx, p.vy)
        if (v > maxV) {
          p.vx = (p.vx / v) * maxV
          p.vy = (p.vy / v) * maxV
        }
        p.x += p.vx
        p.y += p.vy
        if (p.x < pad) {
          p.x = pad
          p.vx = Math.abs(p.vx) * 0.6
        } else if (p.x > w - pad) {
          p.x = w - pad
          p.vx = -Math.abs(p.vx) * 0.6
        }
        if (p.y < pad) {
          p.y = pad
          p.vy = Math.abs(p.vy) * 0.6
        } else if (p.y > h - pad) {
          p.y = h - pad
          p.vy = -Math.abs(p.vy) * 0.6
        }
      }

      for (const [id, p] of phys) {
        const refs = nodeElsRef.current.get(id)
        if (refs?.circle) {
          refs.circle.setAttribute("cx", p.x.toFixed(2))
          refs.circle.setAttribute("cy", p.y.toFixed(2))
        }
        if (refs?.label) {
          refs.label.setAttribute("x", (p.x + 10).toFixed(2))
          refs.label.setAttribute("y", (p.y + 4).toFixed(2))
        }
      }
      for (const e of edgesRef.current) {
        const pa = phys.get(e.a)
        const pb = phys.get(e.b)
        const line = edgeElsRef.current.get(e.id)
        if (pa && pb && line) {
          line.setAttribute("x1", pa.x.toFixed(2))
          line.setAttribute("y1", pa.y.toFixed(2))
          line.setAttribute("x2", pb.x.toFixed(2))
          line.setAttribute("y2", pb.y.toFixed(2))
        }
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [dim.w, dim.h])

  return (
    <div ref={wrap} className="absolute inset-0">
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${dim.w || 1} ${dim.h || 1}`}
        className="block h-full w-full"
      >
        <defs>
          <linearGradient id="bn-edge-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c084fc" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#f472b6" stopOpacity="1" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.9" />
          </linearGradient>
          <filter id="bn-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g>
          {edges.map((e) => (
            <EdgeLine key={e.id} edge={e} edgeElsRef={edgeElsRef} />
          ))}
        </g>
        <g>
          {nodes.map((n) => (
            <NodeDot
              key={n.id}
              node={n}
              physicsRef={physicsRef}
              nodeElsRef={nodeElsRef}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}

function NodeDot({
  node,
  physicsRef,
  nodeElsRef,
}: {
  node: GNode
  physicsRef: React.RefObject<Map<string, Physics>>
  nodeElsRef: React.RefObject<
    Map<string, { circle: SVGCircleElement | null; label: SVGTextElement | null }>
  >
}) {
  const circleRef = useRef<SVGCircleElement>(null)
  const labelRef = useRef<SVGTextElement>(null)

  // sync initial position & register refs before paint so we don't flash at (0,0)
  useLayoutEffect(() => {
    const phys = physicsRef.current?.get(node.id)
    const circle = circleRef.current
    const label = labelRef.current
    if (circle && phys) {
      circle.setAttribute("cx", phys.x.toFixed(2))
      circle.setAttribute("cy", phys.y.toFixed(2))
    }
    if (label && phys) {
      label.setAttribute("x", (phys.x + 10).toFixed(2))
      label.setAttribute("y", (phys.y + 4).toFixed(2))
    }
    nodeElsRef.current?.set(node.id, { circle, label })
    return () => {
      nodeElsRef.current?.delete(node.id)
    }
  }, [node.id, physicsRef, nodeElsRef])

  useEffect(() => {
    const el = circleRef.current
    if (!el) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { attr: { r: 0 }, opacity: 0 },
        { attr: { r: node.r }, opacity: 0.95, duration: 0.9, ease: "back.out(1.8)" },
      )
      gsap.to(el, {
        attr: { r: node.r * 1.3 },
        duration: 2.2 + Math.random() * 1.8,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 1.2,
      })
      if (labelRef.current) {
        gsap.fromTo(
          labelRef.current,
          { opacity: 0 },
          { opacity: 0.8, duration: 0.8, delay: 0.3, ease: "power2.out" },
        )
      }
    })
    return () => ctx.revert()
  }, [node.r])

  useEffect(() => {
    if (node.phase !== "out") return
    const el = circleRef.current
    if (el) {
      gsap.to(el, { attr: { r: 0 }, opacity: 0, duration: 0.85, ease: "power3.in" })
    }
    if (labelRef.current) {
      gsap.to(labelRef.current, { opacity: 0, duration: 0.4 })
    }
  }, [node.phase])

  return (
    <g>
      <circle ref={circleRef} r={node.r} fill={node.color} filter="url(#bn-glow)" opacity={0} />
      {node.label && (
        <text
          ref={labelRef}
          fontSize="10"
          fill="rgba(255,255,255,0.8)"
          opacity={0}
          style={{
            fontFamily: "var(--font-mono), ui-monospace, monospace",
            letterSpacing: "0.06em",
          }}
        >
          {node.label}
        </text>
      )}
    </g>
  )
}

function EdgeLine({
  edge,
  edgeElsRef,
}: {
  edge: GEdge
  edgeElsRef: React.RefObject<Map<string, SVGLineElement>>
}) {
  const ref = useRef<SVGLineElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    edgeElsRef.current?.set(edge.id, el)
    return () => {
      edgeElsRef.current?.delete(edge.id)
    }
  }, [edge.id, edgeElsRef])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    gsap.fromTo(el, { opacity: 0 }, { opacity: 0.4, duration: 0.9, ease: "power2.out" })
  }, [edge.id])

  useEffect(() => {
    if (edge.phase !== "out") return
    const el = ref.current
    if (!el) return
    gsap.to(el, { opacity: 0, duration: 0.55, ease: "power2.in" })
  }, [edge.phase])

  return <line ref={ref} stroke="url(#bn-edge-grad)" strokeWidth={0.9} opacity={0} />
}
