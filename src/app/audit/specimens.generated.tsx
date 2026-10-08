// Written by the audit skill's scripts/specimens.mjs. Each entry is one real call site, copied as written.
// Do not edit: run the script again. To change one, define the same key in your own specimens file.
import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
import { Button } from "../../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { Kbd } from "../../components/ui/kbd";
import { Separator } from "../../components/ui/separator";
import { EllipsisIcon, LinkIcon, PlayIcon, ShuffleIcon } from "lucide-react";
import type { AuditSpecimens } from "./AuditPage";

export const generated: AuditSpecimens["components"] = {
  "src/components/ui/avatar.tsx#Avatar": {
    from: "src/components/shell/nav-rail.tsx:56",
    render: (props) => (
        <Avatar className="mt-1.5" {...props}>
          <AvatarImage
            src="https://i.pinimg.com/736x/16/0b/21/160b21d7c6c33be3430846595f9d2418.jpg"
            alt="Your profile"
          />
          <AvatarFallback>P</AvatarFallback>
        </Avatar>
      ),
  },
  "src/components/ui/button.tsx#Button": {
    from: "src/components/playlist/playlist-view.tsx:111",
    render: (props) => <Button variant="outline" size="icon-lg" aria-label="More options" {...props} />,
  },
  "src/components/ui/dropdown-menu.tsx#DropdownMenu": {
    from: "src/components/playlist/playlist-view.tsx:108",
    render: (props) => (
        <DropdownMenu {...props}>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="icon-lg" aria-label="More options" />
            }
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => {}}>
              <PlayIcon />
              Play from the top
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {}}>
              <ShuffleIcon />
              Shuffle play
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {}}
            >
              <LinkIcon />
              Copy link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
  },
  "src/components/ui/kbd.tsx#Kbd": {
    from: "src/components/playlist/playlist-view.tsx:104",
    render: (props) => <Kbd {...props}>⌘K</Kbd>,
  },
  "src/components/ui/separator.tsx#Separator": {
    from: "src/components/player/now-playing-bar.tsx:179",
    render: (props) => (
        <Separator
          orientation="vertical" {...props}
        />
      ),
  },
};
