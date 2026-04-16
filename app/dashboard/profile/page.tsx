import { SiteHeader } from "@/components/site-header"
import Image from "next/image"
import { UserInfoForm } from "@/components/app-ui/UserInfoForm"
export default function Page() {
  return (
    <div>
      <SiteHeader pageName="Profile" />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex min-w-full flex-row items-center justify-center gap-2 p-2">
          <UserInfoForm />
        </div>
      </div>
    </div>
  )
}
