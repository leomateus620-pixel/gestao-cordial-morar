import { Link } from "@tanstack/react-router";

export function SectionHeader({
  title,
  href,
  action = "Ver tudo",
}: {
  title: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      {href && (
        <Link to={href as never} className="text-xs font-medium text-primary">
          {action}
        </Link>
      )}
    </div>
  );
}