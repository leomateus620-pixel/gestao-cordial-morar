import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function useDialogFocusTrap<T extends HTMLElement>(active: boolean) {
  const dialogRef = useRef<T>(null);

  useEffect(() => {
    if (!active || typeof document === "undefined") return;

    const dialog = dialogRef.current;
    const returnFocus = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => {
      dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    });

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", trapFocus);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", trapFocus);
      returnFocus?.focus();
    };
  }, [active]);

  return dialogRef;
}
