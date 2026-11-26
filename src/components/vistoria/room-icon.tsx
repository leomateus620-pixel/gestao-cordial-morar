import {
  BedDouble,
  BriefcaseBusiness,
  CarFront,
  CookingPot,
  ShowerHead,
  Sofa,
  SquareDashed,
  Trees,
  WashingMachine,
} from "lucide-react";
import type { RoomKind } from "@/lib/vistoria/model";

const icons = {
  sala: Sofa,
  dormitorio: BedDouble,
  suite: BedDouble,
  banheiro: ShowerHead,
  cozinha: CookingPot,
  servico: WashingMachine,
  garagem: CarFront,
  externa: Trees,
  comercial: BriefcaseBusiness,
  terreno: Trees,
  outro: SquareDashed,
} satisfies Record<RoomKind, typeof Sofa>;

export function roomKindFromName(name: string): RoomKind {
  const text = name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/^sala comercial\b/.test(text)) return "comercial";
  if (/^sala\b/.test(text)) return "sala";
  if (/^cozinha\b/.test(text)) return "cozinha";
  if (/^(quarto|dormitorio)\b/.test(text)) return "dormitorio";
  if (/^suite\b/.test(text)) return "suite";
  if (/^(banheiro|lavabo)\b/.test(text)) return "banheiro";
  if (/^(garagem|vaga)\b/.test(text)) return "garagem";
  if (/^(lavanderia|area de servico)\b/.test(text)) return "servico";
  if (/^(varanda|sacada|patio|area externa)\b/.test(text)) return "externa";
  return "outro";
}

export function RoomIcon({
  kind,
  name,
  className,
}: {
  kind: string;
  name: string;
  className?: string;
}) {
  const known = kind !== "outro" && Object.hasOwn(icons, kind);
  const Icon = icons[known ? (kind as RoomKind) : roomKindFromName(name)];
  return <Icon className={className} strokeWidth={1.8} aria-hidden />;
}
