export function RentalSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="glass-panel h-28 animate-pulse rounded-3xl" />
      ))}
    </div>
  );
}
