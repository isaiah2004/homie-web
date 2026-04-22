"use client"
import { InfoIcon } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * FieldInfo renders a small (i) icon that shows a tooltip on hover/focus.
 *
 * We intentionally use a <span> (not a <button>) because this component is
 * sometimes rendered inside another button (e.g. AccordionTrigger), and the
 * HTML spec forbids nested <button> elements. Using a span with role="button"
 * keeps it accessible without breaking hydration.
 *
 * We stop pointer/click propagation so clicking the info icon doesn't
 * accidentally toggle an enclosing accordion/disclosure.
 */
export function FieldInfo({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label="More info"
          className="inline-flex items-center text-muted-foreground/70 hover:text-foreground transition-colors ml-1 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            // Prevent Space/Enter from bubbling to an enclosing accordion trigger
            if (e.key === " " || e.key === "Enter") {
              e.stopPropagation()
            }
          }}
        >
          <InfoIcon className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
