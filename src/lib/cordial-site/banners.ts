import type { SiteBanner } from "./contract";

/** Banners exibidos agora: ativos, dentro do período (início incluso, fim exclusivo), na ordem do painel. */
export function activeBanners(list: readonly SiteBanner[] | undefined, now: Date = new Date()): SiteBanner[] {
  const t = now.getTime();
  return (list ?? []).filter(
    (b) =>
      b.active &&
      (!b.startsAt || Date.parse(b.startsAt) <= t) &&
      (!b.endsAt || Date.parse(b.endsAt) > t),
  );
}

export type BannerStatus = "ativo" | "agendado" | "encerrado" | "pausado";
export function bannerStatus(b: SiteBanner, now: Date = new Date()): BannerStatus {
  if (!b.active) return "pausado";
  const t = now.getTime();
  if (b.startsAt && Date.parse(b.startsAt) > t) return "agendado";
  if (b.endsAt && Date.parse(b.endsAt) <= t) return "encerrado";
  return "ativo";
}
