import type { ComponentProps } from "react";
import { X } from "lucide-react";
import { DialogClose, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Localized close control without changing other modules' dialogs. */
export function AssistantDialogContent({
  children,
  className,
  closeDisabled,
  ...props
}: ComponentProps<typeof DialogContent> & { closeDisabled?: boolean }) {
  return (
    <DialogContent className={cn("[&>button:last-child]:hidden", className)} {...props}>
      {children}
      <DialogClose
        aria-label="Fechar"
        disabled={closeDisabled}
        className="absolute right-2 top-2 grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40"
      >
        <X size={17} />
      </DialogClose>
    </DialogContent>
  );
}
