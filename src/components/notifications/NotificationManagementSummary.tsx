import { Clock3, Eye, Inbox, TimerReset } from "lucide-react";
import type { NotificationManagementSummary as Summary } from "@/lib/notifications/notifications.functions";
import { formatElapsedSeconds } from "@/lib/time/elapsed";

function duration(value: number | null) {
  return value == null ? "—" : formatElapsedSeconds(value);
}

export function NotificationManagementSummary({ summary }: { summary: Summary }) {
  const completion =
    summary.assignedCount > 0
      ? Math.min(100, Math.round((summary.openedCount / summary.assignedCount) * 100))
      : 0;

  const metrics = [
    { label: "Atribuídos hoje", value: String(summary.assignedCount), icon: Inbox },
    { label: "Aguardando abertura", value: String(summary.pendingOpenCount), icon: Clock3 },
    {
      label: "Média de abertura",
      value: duration(summary.averageFirstOpenSeconds),
      icon: TimerReset,
    },
    { label: "Mediana", value: duration(summary.medianFirstOpenSeconds), icon: Eye },
  ];

  return (
    <section className="notification-management" aria-labelledby="notification-management-title">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="notification-management-kicker">Visão gerencial · hoje</p>
          <h3 id="notification-management-title" className="notification-management-title">
            Ritmo de resposta
          </h3>
        </div>
        <span className="notification-management-rate">{completion}% abertos</span>
      </div>
      <div
        className="notification-progress"
        role="progressbar"
        aria-label="Atendimentos abertos hoje"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={completion}
      >
        <span style={{ transform: `scaleX(${completion / 100})` }} />
      </div>
      <dl className="notification-metric-grid">
        {metrics.map(({ label, value, icon: Icon }) => (
          <div key={label} className="notification-metric">
            <dt>
              <Icon className="size-3.5" />
              {label}
            </dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
