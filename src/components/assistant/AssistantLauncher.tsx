import { useCallback, useSyncExternalStore } from "react";
import { useRouterState } from "@tanstack/react-router";
import { AssistantMark } from "@/components/brand/AssistantMark";
import { CordialBotWordmark } from "@/components/brand/CordialBotBrand";
import { cn } from "@/lib/utils";
import { assistantLauncherStore, shouldShowAssistantLauncher } from "./launcher-state";

export function useAssistantLauncher() {
  const isOpen = useSyncExternalStore(
    assistantLauncherStore.subscribe,
    assistantLauncherStore.get,
    () => false,
  );
  const setOpen = useCallback((next: boolean) => assistantLauncherStore.set(next), []);
  return { isOpen, setOpen };
}

export function AssistantLauncherButton({ variant }: { variant: "desktop" | "mobile" }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setOpen } = useAssistantLauncher();
  if (!shouldShowAssistantLauncher(pathname)) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Abrir Cordial Bot"
      title="Cordial Bot"
      className={cn(
        "glass-panel inline-flex shrink-0 items-center rounded-full text-primary transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        variant === "desktop" ? "h-9 gap-2 px-1 2xl:pr-3" : "size-10 justify-center",
      )}
    >
      <AssistantMark size={variant === "desktop" ? 28 : 26} />
      {variant === "desktop" ? <CordialBotWordmark className="hidden !text-sm 2xl:inline" /> : null}
    </button>
  );
}
