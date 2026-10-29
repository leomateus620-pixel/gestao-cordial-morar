import "./google-ads.css";
import "./google-loading.css";

/** Reserves the Google layout without displaying invented metric values. */
export function GoogleMarketingSkeleton({
  area = "overview",
}: {
  area?: "overview" | "campaigns";
}) {
  return (
    <div
      className="gads-root gads-loading"
      role="status"
      aria-label="Carregando Google Ads"
      aria-busy="true"
    >
      <div className="gads-data-bar" aria-hidden="true">
        <span className="gads-loading-bar gads-loading-coverage" />
        <span className="gads-loading-bar gads-loading-info" />
      </div>
      {area === "overview" && (
        <>
          <div className="gads-kpis" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="gads-surface gads-kpi gads-loading-kpi">
                <div className="gads-kpi-top">
                  <span className="gads-loading-bar gads-loading-icon" />
                  <span className="gads-loading-bar gads-loading-label" />
                </div>
                <span className="gads-loading-bar gads-loading-value" />
              </div>
            ))}
          </div>
          <div className="gads-surface gads-trend" aria-hidden="true">
            <div className="gads-trend-header">
              <h2>Evolução</h2>
              <div className="gads-trend-controls">
                <span className="gads-loading-control gads-first-metric">
                  <span className="gads-loading-bar" />
                </span>
                <span className="gads-loading-control gads-second-metric">
                  <span className="gads-loading-bar" />
                </span>
                <span className="gads-loading-control gads-loading-segment">
                  <span className="gads-loading-bar" />
                </span>
              </div>
            </div>
            <div className="gads-trend-meta">
              <span className="gads-loading-bar gads-loading-legend" />
            </div>
            <div className="gads-plot gads-loading-plot" />
            <div className="gads-chart-footer">
              <span />
              <span className="gads-loading-bar gads-loading-footer" />
            </div>
          </div>
        </>
      )}
      <div className="gads-surface gads-loading-campaigns" aria-hidden="true">
        <div className="gads-loading-tablehead">
          <h2>Campanhas</h2>
          <div className="gads-loading-actions">
            <span className="gads-loading-control gads-loading-sort">
              <span className="gads-loading-bar" />
            </span>
            <span className="gads-loading-control gads-loading-columns">
              <span className="gads-loading-bar" />
            </span>
          </div>
        </div>
        <div className="gads-loading-tablelabels">
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} className="gads-loading-bar" />
          ))}
        </div>
        {Array.from({ length: 3 }, (_, row) => (
          <div className="gads-loading-row" key={row}>
            {Array.from({ length: 8 }, (_, column) => (
              <span key={column} className="gads-loading-bar" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
