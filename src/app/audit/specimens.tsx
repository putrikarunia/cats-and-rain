import {
  EllipsisIcon,
  LinkIcon,
  PlayIcon,
  SearchIcon,
  SearchXIcon,
  ShuffleIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Toggle } from "@/components/ui/toggle"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import type { AuditSpecimens } from "./AuditPage"
import { generated } from "./specimens.generated"

type Props = Record<string, unknown>

// Every specimen shows the component as written. The classes call sites pass to
// restyle it are drawn by the page under "Overridden", from the scan. Where a
// specimen needs room, a plain wrapper gives it, not a class on the component.

const searchGroup = (props: Props = {}, addonProps: Props = {}) => (
  <div data-audit-room className="w-72">
    <InputGroup {...props}>
      <InputGroupAddon {...addonProps}>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        placeholder="Search songs, artists"
        aria-label="Search songs, artists"
      />
      <InputGroupAddon align="inline-end">
        <Kbd>⌘K</Kbd>
      </InputGroupAddon>
    </InputGroup>
  </div>
)

const moreMenu = (itemProps: Props = {}, contentProps: Props = {}) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={<Button variant="outline" size="icon-lg" aria-label="More options" />}
    >
      <EllipsisIcon />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" {...contentProps}>
      <DropdownMenuItem {...itemProps}>
        <PlayIcon />
        Play from the top
      </DropdownMenuItem>
      <DropdownMenuItem>
        <ShuffleIcon />
        Shuffle play
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem>
        <LinkIcon />
        Copy link
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)

const viewTabs = ({
  tabs = {},
  list = {},
  trigger = {},
  content = {},
}: { tabs?: Props; list?: Props; trigger?: Props; content?: Props }) => (
  <div data-audit-room className="w-120">
    <Tabs defaultValue="songs" {...tabs}>
      <TabsList {...list}>
        {[
          { value: "playlist", label: "Playlist" },
          { value: "songs", label: "Songs" },
          { value: "about", label: "About" },
        ].map(({ value, label }) => (
          <TabsTrigger key={value} value={value} {...trigger}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="playlist" />
      <TabsContent value="songs" {...content}>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Songs is on its way</EmptyTitle>
            <EmptyDescription>This view hasn’t been designed yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </TabsContent>
      <TabsContent value="about">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>About is on its way</EmptyTitle>
            <EmptyDescription>This view hasn’t been designed yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </TabsContent>
    </Tabs>
  </div>
)

const noMatches = (props: Props, mediaProps: Props = {}) => (
  <div data-audit-room className="w-120">
    <Empty {...props}>
      <EmptyHeader>
        <EmptyMedia variant="icon" {...mediaProps}>
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>No songs match “thunderstorm”</EmptyTitle>
        <EmptyDescription>Try a song title, artist or album.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  </div>
)

const tabsMocks = { view: "songs", hero: "(empty)" }

export const specimens: AuditSpecimens = {
  components: {
    ...generated,
    // The generated one is icon-only; this call site has a label.
    "src/components/ui/button.tsx#Button": {
      from: "src/components/playlist/playlist-actions.tsx:25",
      render: (props) => {
        const iconOnly = String(props.size ?? "").startsWith("icon")
        return (
          <Button size="xl" aria-label={iconOnly ? "Play" : undefined} {...props}>
            <PlayIcon data-icon={iconOnly ? undefined : "inline-start"} />
            {!iconOnly && "Play"}
          </Button>
        )
      },
    },
    "src/components/ui/dropdown-menu.tsx#DropdownMenuItem": {
      from: "src/components/playlist/playlist-view.tsx:117",
      render: (props) => moreMenu(props),
    },
    "src/components/ui/dropdown-menu.tsx#DropdownMenuContent": {
      from: "src/components/playlist/playlist-view.tsx:116",
      render: (props) => moreMenu({}, props),
    },
    "src/components/ui/empty.tsx#Empty": {
      from: "src/components/playlist/songs-section.tsx:53",
      mocks: { "query.trim()": "thunderstorm" },
      render: (props) => noMatches(props),
    },
    "src/components/ui/empty.tsx#EmptyMedia": {
      from: "src/components/playlist/songs-section.tsx:55",
      mocks: { "query.trim()": "thunderstorm" },
      render: (props) => noMatches({}, props),
    },
    "src/components/ui/input-group.tsx#InputGroup": {
      from: "src/components/playlist/playlist-view.tsx:82",
      render: (props) => searchGroup(props),
    },
    "src/components/ui/input-group.tsx#InputGroupAddon": {
      from: "src/components/playlist/playlist-view.tsx:83",
      render: (props) => searchGroup({}, props),
    },
    // Only used inside InputGroupInput and InputGroupTextarea, which restyle them.
    "src/components/ui/input.tsx#Input": {
      from: "src/components/ui/input-group.tsx:124",
      render: (props) => (
        <div data-audit-room className="w-65">
          <Input data-slot="input-group-control" {...props} />
        </div>
      ),
    },
    "src/components/ui/textarea.tsx#Textarea": {
      from: "src/components/ui/input-group.tsx:140",
      render: (props) => (
        <div data-audit-room className="w-65">
          <Textarea data-slot="input-group-control" {...props} />
        </div>
      ),
    },
    "src/components/ui/slider.tsx#Slider": {
      from: "src/components/player/now-playing-bar.tsx:166",
      mocks: { effectiveVolume: "0.6" },
      render: (props) => (
        <div data-audit-room className="w-48">
          <Slider aria-label="Volume" min={0} max={1} step={0.01} defaultValue={[0.6]} {...props} />
        </div>
      ),
    },
    "src/components/ui/tabs.tsx#Tabs": {
      from: "src/components/playlist/playlist-view.tsx:63",
      mocks: tabsMocks,
      render: (props) => viewTabs({ tabs: props }),
    },
    "src/components/ui/tabs.tsx#TabsList": {
      from: "src/components/playlist/playlist-view.tsx:69",
      mocks: tabsMocks,
      render: (props) => viewTabs({ list: props }),
    },
    "src/components/ui/tabs.tsx#TabsTrigger": {
      from: "src/components/playlist/playlist-view.tsx:71",
      mocks: tabsMocks,
      render: (props) => viewTabs({ trigger: props }),
    },
    "src/components/ui/tabs.tsx#TabsContent": {
      from: "src/components/playlist/playlist-view.tsx:141",
      mocks: tabsMocks,
      render: (props) => viewTabs({ content: props }),
    },
    "src/components/ui/toggle.tsx#Toggle": {
      from: "src/components/player/now-playing-bar.tsx:99",
      render: (props) => (
        <Toggle aria-label="Shuffle" {...props}>
          <ShuffleIcon />
        </Toggle>
      ),
    },
    "src/components/ui/tooltip.tsx#Tooltip": {
      from: "src/components/icon-tooltip.tsx:22",
      mocks: {
        label: "Shuffle play",
        children: "the Shuffle play button, playlist-actions.tsx:34",
        side: "top",
      },
      render: (props) => (
        <TooltipProvider delay={400}>
          <Tooltip {...props}>
            <TooltipTrigger
              render={<Button variant="outline" size="icon-xl" aria-label="Shuffle play" />}
            >
              <ShuffleIcon />
            </TooltipTrigger>
            <TooltipContent side="top">Shuffle play</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
    },
  },
  handRolled: {},
}
