import { inspectionLayout } from "@/lib/vistoria/layout";

/** Mesmas regras do antigo botão flutuante: fora do Assistente e da vistoria. */
export function shouldShowAssistantLauncher(pathname: string): boolean {
  return !pathname.startsWith("/assistente") && !inspectionLayout(pathname);
}

type Listener = () => void;
let open = false;
const listeners = new Set<Listener>();

export const assistantLauncherStore = {
  get: () => open,
  set(next: boolean) {
    if (open === next) return;
    open = next;
    listeners.forEach((l) => l());
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
