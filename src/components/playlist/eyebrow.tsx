import { cn } from "@/lib/utils"

/** Small uppercase section label used above titles and sections. */
export function Eyebrow({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "text-2xs font-semibold tracking-widest text-muted-foreground uppercase",
        className
      )}
      {...props}
    />
  )
}
