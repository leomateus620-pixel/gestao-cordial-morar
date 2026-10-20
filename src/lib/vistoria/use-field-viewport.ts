import { useEffect } from "react";
/** iOS/Android visual viewport can shrink while the layout viewport remains tall. */
export function useFieldViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      document.documentElement.style.setProperty("--inspection-keyboard-inset", `${inset}px`);
      document.documentElement.toggleAttribute("data-inspection-keyboard", inset > 120);
      if (inset > 120 && document.activeElement instanceof HTMLElement)
        document.activeElement.scrollIntoView({ block: "nearest" });
    };
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    update();
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--inspection-keyboard-inset");
      document.documentElement.removeAttribute("data-inspection-keyboard");
    };
  }, []);
}
