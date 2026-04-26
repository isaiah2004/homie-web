"use client"

import { SiteHeader } from "@/components/site-header"
import { PageShell } from "@/components/dashboard-layout"
import { UserInfoForm } from "@/components/app-ui/UserInfoForm"
import { BusinessInfoForm } from "@/components/app-ui/BusinessInfoForm"
import { ProfileSideNav } from "@/components/app-ui/ProfileSideNav"
import { AiKeysCard } from "@/components/integrations/AiKeysCard"
import { useAccountType } from "@/hooks/use-account-type"

export default function Page() {
  const { accountType, isLoaded } = useAccountType()

  if (!isLoaded) {
    return (
      <PageShell header={<SiteHeader pageName="Profile" />}>
        <div className="flex-1 flex flex-col min-w-0 overflow-auto">
          <div className="@container/main mx-auto flex w-full max-w-6xl gap-4 p-2 md:gap-6 md:p-6">
            <div className="min-w-0 flex-1">
              <div className="p-6 text-sm text-muted-foreground">
                Loading…
              </div>
            </div>
          </div>
        </div>
      </PageShell>
    )
  }

  const isBusiness = accountType === "business"

  return (
    <PageShell header={<SiteHeader pageName="Profile" />}>
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="@container/main mx-auto flex w-full max-w-6xl gap-4 p-2 md:gap-6 md:p-6">
          {/* Keep the personal side nav only for the personal branch — the
              business form renders its own section structure. */}
          {!isBusiness && <ProfileSideNav />}
          <div className="min-w-0 flex-1 space-y-6">
            {isBusiness ? <BusinessInfoForm /> : <UserInfoForm />}
            <section id="section-ai-keys">
              <AiKeysCard />
            </section>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
