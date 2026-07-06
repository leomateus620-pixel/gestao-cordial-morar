export function MarketingSkeleton() {
  return (
    <div className="space-y-5" aria-label="Carregando campanhas de marketing">
      <div className="premium-card h-40 animate-pulse rounded-3xl motion-reduce:animate-none" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-3xl border border-white/60 bg-white/50 motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <div className="h-72 animate-pulse rounded-3xl border border-white/60 bg-white/50 motion-reduce:animate-none" />
        <div className="h-72 animate-pulse rounded-3xl border border-white/60 bg-white/50 motion-reduce:animate-none" />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-72 animate-pulse rounded-3xl border border-white/60 bg-white/50 motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}
