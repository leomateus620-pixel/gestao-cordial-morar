import { useEffect } from "react";
import { onCLS, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

/** Official field metrics, collected only with consent. Aggregation and p75
 * evaluation belong to the configured analytics service, never this component. */
export function SitePerformance() {
  useEffect(() => {
    let active = true;
    const report = (metric: Metric) => {
      try {
        if (!active || localStorage.getItem("cordial:analytics-consent") !== "granted") return;
        window.dispatchEvent(
          new CustomEvent("cordial:performance", {
            detail: {
              name: metric.name,
              value: metric.value,
              rating: metric.rating,
              viewport: matchMedia("(max-width:768px)").matches ? "compact" : "wide",
            },
          }),
        );
      } catch {
        /* Metrics never block the public experience. */
      }
    };
    onCLS(report);
    onINP(report);
    onLCP(report);
    onTTFB(report);
    return () => {
      active = false;
    };
  }, []);
  return null;
}
