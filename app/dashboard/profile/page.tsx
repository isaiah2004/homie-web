import { SiteHeader } from "@/components/site-header"
import { UserInfoForm } from "@/components/app-ui/UserInfoForm"
import { ProfileSideNav } from "@/components/app-ui/ProfileSideNav"

export default function Page() {
  return (
    <div>
      <SiteHeader pageName="Profile" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main mx-auto flex w-full max-w-6xl gap-4 p-2 md:gap-6 md:p-6">
          <ProfileSideNav />
          <div className="min-w-0 flex-1">
            <UserInfoForm />
          </div>
        </div>
      </div>
    </div>
  )
}
