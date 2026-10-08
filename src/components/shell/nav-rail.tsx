"use client"

import {
  CompassIcon,
  HeartIcon,
  HouseIcon,
  LibraryIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react"

import { IconTooltip } from "@/components/icon-tooltip"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type NavItem = { label: string; icon: LucideIcon; active?: boolean }

const primaryNav: NavItem[] = [
  { label: "Home", icon: HouseIcon },
  { label: "Explore", icon: CompassIcon },
  { label: "Library", icon: LibraryIcon, active: true },
  { label: "Liked songs", icon: HeartIcon },
]

function RailButton({ label, icon: Icon, active }: NavItem) {
  return (
    <IconTooltip label={label} side="right">
      <Button
        variant="ghost"
        size="icon-xl"
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "rounded-xl text-muted-foreground",
          active && "bg-muted text-foreground"
        )}
      >
        <Icon className="size-4.5" />
      </Button>
    </IconTooltip>
  )
}

export function NavRail() {
  return (
    <nav
      aria-label="Main"
      className="flex w-18 shrink-0 flex-col items-center gap-1.5 pt-1 pb-6"
    >
      {primaryNav.map((item) => (
        <RailButton key={item.label} {...item} />
      ))}
      <div className="flex-1" />
      <RailButton label="Settings" icon={SettingsIcon} />
      <Avatar className="mt-1.5">
        <AvatarImage
          src="https://i.pinimg.com/736x/16/0b/21/160b21d7c6c33be3430846595f9d2418.jpg"
          alt="Your profile"
        />
        <AvatarFallback>P</AvatarFallback>
      </Avatar>
    </nav>
  )
}
