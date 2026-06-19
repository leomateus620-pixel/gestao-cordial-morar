import { useCallback, type CSSProperties, type PointerEvent } from "react";
import {
  Camera,
  ClipboardCheck,
  HardDrive,
  HousePlus,
  MapPinned,
  Plus,
  type LucideIcon,
} from "lucide-react";

type AgenciamentoCreateCardProps = {
  onCreate: () => void;
  disabled?: boolean;
};

export function AgenciamentoCreateCard({ onCreate, disabled }: AgenciamentoCreateCardProps) {
  const handlePointerMove = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "touch") return;
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty("--agency-tilt-x", `${(-y * 4).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--agency-tilt-y", `${(x * 5).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--agency-lift", "-5px");
  }, []);

  const reset = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.style.setProperty("--agency-tilt-x", "0deg");
    event.currentTarget.style.setProperty("--agency-tilt-y", "0deg");
    event.currentTarget.style.setProperty("--agency-lift", "0px");
    event.currentTarget.style.setProperty("--agency-scale", "1");
  }, []);

  const press = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.style.setProperty("--agency-scale", "0.985");
    event.currentTarget.style.setProperty("--agency-lift", "-1px");
  }, []);

  const release = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.style.setProperty("--agency-scale", "1");
    event.currentTarget.style.setProperty(
      "--agency-lift",
      event.pointerType === "touch" ? "0px" : "-5px",
    );
  }, []);

  return (
    <button
      type="button"
      onClick={onCreate}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      onPointerDown={press}
      onPointerUp={release}
      disabled={disabled}
      className="group relative min-w-0 overflow-hidden rounded-[1.75rem] p-4 text-left text-white shadow-[0_24px_70px_-32px_rgba(23,27,33,0.52)] outline-none ring-1 ring-white/12 transition-[filter,box-shadow] duration-300 focus-visible:ring-2 focus-visible:ring-cyan-200/55 disabled:cursor-not-allowed disabled:opacity-55 sm:p-5"
      style={
        {
          "--agency-tilt-x": "0deg",
          "--agency-tilt-y": "0deg",
          "--agency-lift": "0px",
          "--agency-scale": "1",
          background: "linear-gradient(135deg, #174d61 0%, #1e647d 50%, #28343b 100%)",
          transform:
            "perspective(900px) rotateX(var(--agency-tilt-x)) rotateY(var(--agency-tilt-y)) translateY(var(--agency-lift)) scale(var(--agency-scale))",
          transformStyle: "preserve-3d",
          transition:
            "transform 230ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 230ms ease, filter 230ms ease",
        } as CSSProperties
      }
    >
      <span className="pointer-events-none absolute -right-12 -top-16 size-52 rounded-full bg-cyan-200/12 blur-3xl" />
      <span className="pointer-events-none absolute bottom-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-cyan-100/35 to-transparent" />

      <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0" style={{ transform: "translateZ(22px)" }}>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-50/78 ring-1 ring-white/12">
            <HousePlus className="size-3.5" />
            Entrada de carteira
          </div>
          <h2 className="text-xl font-black tracking-tight sm:text-2xl">Novo agenciamento</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/68">
            Cadastre um imovel captado e acompanhe fotos, placa, site e validacao.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2 sm:w-fit" style={{ transform: "translateZ(16px)" }}>
          <CreateChip icon={Camera} label="Fotos" />
          <CreateChip icon={MapPinned} label="Placa" />
          <CreateChip icon={HardDrive} label="Drive" />
          <CreateChip icon={ClipboardCheck} label="Site" />
        </div>
      </div>

      <span
        className="relative z-10 mt-5 inline-flex items-center gap-2 rounded-2xl bg-white/13 px-3 py-2 text-xs font-bold text-white ring-1 ring-white/12 transition-all group-hover:bg-white/18"
        style={{ transform: "translateZ(18px)" }}
      >
        <Plus className="size-4" />
        Abrir formulario
      </span>
    </button>
  );
}

function CreateChip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="grid min-w-0 place-items-center rounded-2xl bg-white/10 px-2.5 py-3 text-center ring-1 ring-white/12">
      <Icon className="size-4 text-cyan-100" />
      <span className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/58">
        {label}
      </span>
    </span>
  );
}
