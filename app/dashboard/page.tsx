import { SiteHeader } from "@/components/site-header"

export default function Page() {
  return (
    <div>
      <SiteHeader pageName="Dashboard" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2"></div>
      </div>
    </div>
  )
}
