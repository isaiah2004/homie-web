import { Button } from "../ui/button"
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs"

export function Header() {
  return (
    <header className="flex h-16 items-center justify-end gap-4 p-4">
      <Show when="signed-out">
        <SignInButton />
        <SignUpButton>
          <Button className="h-10 cursor-pointer rounded-full bg-purple-700 px-4 text-sm font-medium text-white sm:h-12 sm:px-5 sm:text-base">
            Sign Up
          </Button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </header>
  )
}
