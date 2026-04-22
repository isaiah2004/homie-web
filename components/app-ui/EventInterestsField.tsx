"use client"
import { useState } from "react"
import { X, Sparkles as SparkleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

export const EVENT_PRESETS = [
  "Concerts",
  "Open Mics",
  "Comedy Shows",
  "Sports Games",
  "Art Gallery Openings",
  "Festivals",
  "Conferences",
  "Club Nights",
  "Theater",
  "Film Screenings",
  "Food Festivals",
  "Book Clubs",
  "Trivia Nights",
] as const

type EventInterest = { value: string; custom: boolean; visibility: string }

type Props = {
  value: EventInterest[]
  onChange: (next: EventInterest[]) => void
  defaultVisibility?: string
  renderVisibility?: (args: {
    value: string
    onChange: (next: string) => void
  }) => React.ReactNode
}

export function EventInterestsField({
  value,
  onChange,
  defaultVisibility = "friends",
  renderVisibility,
}: Props) {
  const [custom, setCustom] = useState("")

  const has = (v: string) =>
    value.some((x) => x.value.toLowerCase() === v.toLowerCase())

  const addPreset = (preset: string) => {
    if (has(preset)) return
    onChange([
      ...value,
      { value: preset, custom: false, visibility: defaultVisibility },
    ])
  }

  const addCustom = () => {
    const v = custom.trim()
    if (!v || has(v)) {
      setCustom("")
      return
    }
    onChange([
      ...value,
      { value: v, custom: true, visibility: defaultVisibility },
    ])
    setCustom("")
  }

  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx))

  const updateVisibility = (idx: number, next: string) => {
    onChange(
      value.map((x, i) => (i === idx ? { ...x, visibility: next } : x))
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {EVENT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => addPreset(preset)}
            disabled={has(preset)}
            className={
              "rounded-full px-3 py-1 text-xs border transition-colors " +
              (has(preset)
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-background text-foreground hover:bg-muted border-border")
            }
          >
            {preset}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addCustom()
            }
          }}
          placeholder="Add a custom event type"
        />
        <Button type="button" size="sm" variant="secondary" onClick={addCustom}>
          Add
        </Button>
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((item, idx) => (
            <Badge
              key={`${item.value}-${idx}`}
              variant="secondary"
              className="pl-2 pr-1 py-1 gap-1.5"
            >
              {item.custom && <SparkleIcon className="size-3 opacity-70" />}
              <span>{item.value}</span>
              {renderVisibility?.({
                value: item.visibility,
                onChange: (next) => updateVisibility(idx, next),
              })}
              <button
                type="button"
                onClick={() => remove(idx)}
                className="ml-1 opacity-70 hover:opacity-100"
                aria-label={`Remove ${item.value}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
