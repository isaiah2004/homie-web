"use client"
import { useEffect, useState } from "react"
import {
  User,
  Activity,
  Sparkles,
  Music,
  MapPin,
  Briefcase,
  CalendarHeart,
  Menu,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"

const SECTIONS = [
  { id: "section-basic", label: "Basic Info", Icon: User },
  { id: "section-status", label: "Current Status", Icon: Activity },
  { id: "section-interests", label: "Interests", Icon: Sparkles },
  { id: "section-events", label: "Events", Icon: CalendarHeart },
  { id: "section-media", label: "Media", Icon: Music },
  { id: "section-places", label: "Places", Icon: MapPin },
  { id: "section-projects", label: "Projects", Icon: Briefcase },
] as const

export function ProfileSideNav() {
  // Active-section highlighting via IntersectionObserver
  const [activeId, setActiveId] = useState<string>("section-basic")

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => !!el
    )
    if (els.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top that's intersecting.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          )
        if (visible[0]) setActiveId(visible[0].target.id)
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  // Desktop rail
  const rail = (
    <nav className="hidden lg:flex flex-col gap-2 w-14 sticky top-20 self-start pt-2">
      {SECTIONS.map(({ id, label, Icon }) => (
        <Tooltip key={id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => scrollTo(id)}
              aria-label={label}
              className={cn(
                "size-10 rounded-lg inline-flex items-center justify-center transition-colors",
                activeId === id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ))}
    </nav>
  )

  // Mobile button → sheet
  const mobile = (
    <div className="lg:hidden fixed bottom-4 left-4 z-40">
      <Sheet>
        <SheetTrigger asChild>
          <Button
            size="icon"
            variant="secondary"
            className="rounded-full shadow-md"
            aria-label="Open profile section navigation"
          >
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64">
          <SheetHeader>
            <SheetTitle>Jump to section</SheetTitle>
            <SheetDescription className="sr-only">
              Quick navigation between profile sections.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-1 px-2">
            {SECTIONS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollTo(id)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm text-left transition-colors",
                  activeId === id
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted"
                )}
              >
                <Icon className="size-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )

  return (
    <>
      {rail}
      {mobile}
    </>
  )
}
