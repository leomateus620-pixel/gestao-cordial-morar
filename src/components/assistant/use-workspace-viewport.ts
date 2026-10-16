import { useEffect, useRef } from "react";

/** Fit the actual available space, including the mobile keyboard and browser bars. */
export function useWorkspaceViewport(enabled = true, fullViewport = false) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (window.innerWidth >= 768) {
          element.style.removeProperty("--assistant-viewport-height");
          element.style.removeProperty("--assistant-viewport-top");
          return;
        }
        const viewport = window.visualViewport;
        const bottom = (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0);
        const available = fullViewport
          ? (viewport?.height ?? window.innerHeight)
          : Math.max(180, bottom - Math.max(0, element.getBoundingClientRect().top) - 12);
        if (fullViewport)
          element.style.setProperty("--assistant-viewport-top", `${viewport?.offsetTop ?? 0}px`);
        element.style.setProperty("--assistant-viewport-height", `${Math.floor(available)}px`);
      });
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [enabled, fullViewport]);
  return ref;
}
