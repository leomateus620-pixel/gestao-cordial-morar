import {
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  Headphones,
  Home,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { cn } from "@/lib/utils";

type LoginFeature = {
  title: string;
  text: string;
  eyebrow: string;
  icon: LucideIcon;
  accent: string;
  glow: string;
  priority?: boolean;
};

const AUTO_SHOWCASE_DURATION_MS = 4000;

const loginFeatures: LoginFeature[] = [
  {
    title: "Agenda",
    text: "Compromissos, visitas e rotinas comerciais em uma visão clara.",
    eyebrow: "Prioridade operacional",
    icon: CalendarClock,
    accent: "#5FAFC7",
    glow: "rgba(95, 175, 199, 0.28)",
    priority: true,
  },
  {
    title: "Corretores",
    text: "Equipe organizada por atuação, agenda e relacionamento.",
    eyebrow: "Equipe comercial",
    icon: UsersRound,
    accent: "#2B7FA3",
    glow: "rgba(43, 127, 163, 0.24)",
  },
  {
    title: "Atendimento",
    text: "Fluxo de atendimento do primeiro contato até o fechamento.",
    eyebrow: "Relacionamento",
    icon: Headphones,
    accent: "#D9782D",
    glow: "rgba(217, 120, 45, 0.24)",
  },
  {
    title: "Clientes",
    text: "Base comercial estruturada para relacionamento e conversão.",
    eyebrow: "Carteira ativa",
    icon: ClipboardCheck,
    accent: "#F0A86D",
    glow: "rgba(240, 168, 109, 0.22)",
  },
  {
    title: "Agenciamento",
    text: "Captação e gestão de imóveis com processo padronizado.",
    eyebrow: "Captação",
    icon: Home,
    accent: "#1E647D",
    glow: "rgba(30, 100, 125, 0.24)",
  },
  {
    title: "Relatórios",
    text: "Indicadores para acompanhar operação, carteira e resultados.",
    eyebrow: "Gestão visual",
    icon: BarChart3,
    accent: "#B95F20",
    glow: "rgba(185, 95, 32, 0.24)",
  },
];

type LoginFeatureShowcaseProps = {
  className?: string;
};

export function LoginFeatureShowcase({ className }: LoginFeatureShowcaseProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const frameRef = useRef<number | null>(null);
  const animateRef = useRef<FrameRequestCallback | null>(null);
  const positionRef = useRef(0);
  const velocityRef = useRef(0);
  const targetPositionRef = useRef(0);
  const activeIndexRef = useRef(0);
  const autoStartRef = useRef(0);
  const pausedRef = useRef(false);
  const pausedAtRef = useRef<number | null>(null);
  const pausedTotalRef = useRef(0);
  const autoFinishedRef = useRef(false);

  const applyPosition = useCallback((position: number) => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const firstCard = cardRefs.current[0];

    if (!viewport || !track || !firstCard || typeof window === "undefined") return;

    const viewportWidth = viewport.getBoundingClientRect().width;
    const cardWidth = firstCard.getBoundingClientRect().width;
    const styles = window.getComputedStyle(track);
    const gap = Number.parseFloat(styles.columnGap || styles.gap) || 12;
    const offset = viewportWidth / 2 - cardWidth / 2 - position * (cardWidth + gap);

    track.style.transform = `translate3d(${offset.toFixed(2)}px, 0, 0)`;
  }, []);

  const queueFrame = useCallback(() => {
    if (prefersReducedMotion) {
      positionRef.current = targetPositionRef.current;
      velocityRef.current = 0;
      applyPosition(positionRef.current);
      return;
    }

    if (frameRef.current === null && animateRef.current) {
      frameRef.current = window.requestAnimationFrame(animateRef.current);
    }
  }, [applyPosition, prefersReducedMotion]);

  const pauseShowcase = useCallback(() => {
    if (pausedRef.current || autoFinishedRef.current) return;
    pausedRef.current = true;
    pausedAtRef.current = performance.now();
  }, []);

  const resumeShowcase = useCallback(() => {
    if (!pausedRef.current) return;

    pausedRef.current = false;
    if (pausedAtRef.current !== null) {
      pausedTotalRef.current += performance.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    queueFrame();
  }, [queueFrame]);

  const moveToFeature = useCallback(
    (index: number) => {
      autoFinishedRef.current = true;
      targetPositionRef.current = index;
      setActiveIndex(index);
      activeIndexRef.current = index;
      queueFrame();
    },
    [queueFrame],
  );

  useEffect(() => {
    const measure = () => applyPosition(positionRef.current);
    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    if (viewportRef.current) observer.observe(viewportRef.current);
    if (trackRef.current) observer.observe(trackRef.current);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [applyPosition]);

  useEffect(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    positionRef.current = 0;
    velocityRef.current = 0;
    targetPositionRef.current = 0;
    activeIndexRef.current = 0;
    setActiveIndex(0);
    applyPosition(0);

    if (prefersReducedMotion) return;

    autoStartRef.current = performance.now();
    pausedTotalRef.current = 0;
    pausedAtRef.current = null;
    pausedRef.current = false;
    autoFinishedRef.current = false;

    const animate: FrameRequestCallback = (timestamp) => {
      frameRef.current = null;

      if (!autoFinishedRef.current && !pausedRef.current) {
        const elapsed = timestamp - autoStartRef.current - pausedTotalRef.current;
        const progress = Math.min(Math.max(elapsed / AUTO_SHOWCASE_DURATION_MS, 0), 1);
        targetPositionRef.current = easeInOut(progress) * (loginFeatures.length - 1);
        if (progress >= 1) autoFinishedRef.current = true;
      }

      const target = targetPositionRef.current;
      const distance = target - positionRef.current;
      velocityRef.current = (velocityRef.current + distance * 0.14) * 0.74;
      positionRef.current += velocityRef.current;

      if (Math.abs(distance) < 0.001 && Math.abs(velocityRef.current) < 0.001) {
        positionRef.current = target;
        velocityRef.current = 0;
      }

      applyPosition(positionRef.current);

      const nextActiveIndex = Math.min(
        loginFeatures.length - 1,
        Math.max(0, Math.round(positionRef.current)),
      );
      if (nextActiveIndex !== activeIndexRef.current) {
        activeIndexRef.current = nextActiveIndex;
        setActiveIndex(nextActiveIndex);
      }

      const shouldContinue =
        !autoFinishedRef.current ||
        Math.abs(target - positionRef.current) > 0.001 ||
        Math.abs(velocityRef.current) > 0.001;

      if (shouldContinue) {
        frameRef.current = window.requestAnimationFrame(animate);
      }
    };

    animateRef.current = animate;
    frameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [applyPosition, prefersReducedMotion]);

  const progress = ((activeIndex + 1) / loginFeatures.length) * 100;

  return (
    <section
      className={cn("login-feature-showcase", className)}
      aria-label="Principais recursos do Gestão Cordial & Morar"
      onPointerMove={pauseShowcase}
      onPointerLeave={resumeShowcase}
      onFocusCapture={pauseShowcase}
      onBlurCapture={resumeShowcase}
      onTouchStart={pauseShowcase}
      onTouchEnd={resumeShowcase}
    >
      <div className="mx-auto max-w-[19.5rem] text-center sm:max-w-[23.5rem]">
        <p className="login-feature-kicker text-[11px] font-bold uppercase tracking-[0.22em] text-[#F0A86D]/88">
          Operação imobiliária em movimento
        </p>
        <p className="mt-2 text-balance text-xs leading-5 text-[#F5F1EB]/64 sm:text-[13px] lg:text-sm">
          Agenda, corretores, atendimentos e relatórios integrados em uma experiência única.
        </p>
      </div>

      <div
        ref={viewportRef}
        className="login-feature-viewport mt-4"
        role="group"
        aria-roledescription="carrossel"
      >
        <div ref={trackRef} className="login-feature-track">
          {loginFeatures.map((feature, index) => (
            <Feature3DCard
              key={feature.title}
              refCallback={(node) => {
                cardRefs.current[index] = node;
              }}
              feature={feature}
              active={activeIndex === index}
              motionEnabled={!prefersReducedMotion}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3">
        <div
          className="h-1 w-24 overflow-hidden rounded-full bg-white/12 ring-1 ring-white/10"
          aria-hidden="true"
        >
          <span
            className="block h-full rounded-full bg-gradient-to-r from-[#5FAFC7] via-[#F0A86D] to-[#D9782D] transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          {loginFeatures.map((feature, index) => (
            <button
              key={feature.title}
              type="button"
              className={cn(
                "size-1.5 rounded-full transition-all duration-300",
                activeIndex === index ? "w-4 bg-[#F5F1EB]" : "bg-[#F5F1EB]/28",
              )}
              aria-label={`Mostrar ${feature.title}`}
              aria-current={activeIndex === index ? "true" : undefined}
              onClick={() => moveToFeature(index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

type Feature3DCardProps = {
  feature: LoginFeature;
  active: boolean;
  motionEnabled: boolean;
  refCallback: (node: HTMLElement | null) => void;
};

const Feature3DCard = memo(function Feature3DCard({
  feature,
  active,
  motionEnabled,
  refCallback,
}: Feature3DCardProps) {
  const Icon = feature.icon;

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!motionEnabled || event.pointerType === "touch") return;
      if (window.matchMedia("(max-width: 768px)").matches) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;

      event.currentTarget.style.setProperty("--feature-tilt-x", `${(-y * 7).toFixed(2)}deg`);
      event.currentTarget.style.setProperty("--feature-tilt-y", `${(x * 8).toFixed(2)}deg`);
      event.currentTarget.style.setProperty("--feature-parallax-x", `${(x * 8).toFixed(2)}px`);
      event.currentTarget.style.setProperty("--feature-parallax-y", `${(y * 6).toFixed(2)}px`);
      event.currentTarget.style.setProperty("--feature-soft-x", `${(-x * 7).toFixed(2)}px`);
      event.currentTarget.style.setProperty("--feature-soft-y", `${(-y * 5).toFixed(2)}px`);
      event.currentTarget.style.setProperty("--feature-shine-x", `${(50 + x * 38).toFixed(2)}%`);
      event.currentTarget.style.setProperty("--feature-shine-y", `${(44 + y * 34).toFixed(2)}%`);
      event.currentTarget.style.setProperty("--feature-lift", "-5px");
      event.currentTarget.style.setProperty("--feature-scale", feature.priority ? "1.018" : "1.012");
    },
    [feature.priority, motionEnabled],
  );

  const resetMotion = useCallback((event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--feature-tilt-x", "0deg");
    event.currentTarget.style.setProperty("--feature-tilt-y", "0deg");
    event.currentTarget.style.setProperty("--feature-parallax-x", "0px");
    event.currentTarget.style.setProperty("--feature-parallax-y", "0px");
    event.currentTarget.style.setProperty("--feature-soft-x", "0px");
    event.currentTarget.style.setProperty("--feature-soft-y", "0px");
    event.currentTarget.style.setProperty("--feature-shine-x", "50%");
    event.currentTarget.style.setProperty("--feature-shine-y", "44%");
    event.currentTarget.style.setProperty("--feature-lift", "0px");
    event.currentTarget.style.setProperty("--feature-scale", "1");
  }, []);

  const pressCard = useCallback((event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--feature-scale", "0.99");
    event.currentTarget.style.setProperty("--feature-lift", "-1px");
  }, []);

  const releaseCard = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      event.currentTarget.style.setProperty("--feature-scale", feature.priority ? "1.018" : "1.012");
      event.currentTarget.style.setProperty(
        "--feature-lift",
        event.pointerType === "touch" ? "0px" : "-5px",
      );
    },
    [feature.priority],
  );

  return (
    <article
      ref={refCallback}
      className={cn(
        "login-feature-card group relative shrink-0 overflow-hidden rounded-[1.35rem] p-4 text-left",
        active && "is-active",
        feature.priority && "login-feature-card--priority",
      )}
      style={
        {
          "--feature-accent": feature.accent,
          "--feature-glow": feature.glow,
          "--feature-tilt-x": "0deg",
          "--feature-tilt-y": "0deg",
          "--feature-parallax-x": "0px",
          "--feature-parallax-y": "0px",
          "--feature-soft-x": "0px",
          "--feature-soft-y": "0px",
          "--feature-shine-x": "50%",
          "--feature-shine-y": "44%",
          "--feature-lift": "0px",
          "--feature-scale": "1",
        } as CSSProperties
      }
      onPointerMove={handlePointerMove}
      onPointerLeave={resetMotion}
      onPointerCancel={resetMotion}
      onPointerDown={pressCard}
      onPointerUp={releaseCard}
    >
      <span className="login-feature-card-glow" aria-hidden="true" />
      <span className="login-feature-card-line" aria-hidden="true" />

      <div className="login-feature-card-layer relative z-10 flex items-start justify-between gap-3">
        <span className="login-feature-icon grid size-11 shrink-0 place-items-center rounded-2xl text-white">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        {feature.priority && (
          <span className="rounded-full bg-[#F0A86D]/14 px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[#F7C08B] ring-1 ring-[#F0A86D]/24">
            Foco
          </span>
        )}
      </div>

      <div className="login-feature-card-copy relative z-10 mt-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#F5F1EB]/48">
          {feature.eyebrow}
        </p>
        <h3 className="mt-1 text-lg font-black tracking-tight text-white">{feature.title}</h3>
        <p className="mt-2 text-[12px] leading-5 text-[#F5F1EB]/66">{feature.text}</p>
      </div>

      <div className="login-feature-card-meta relative z-10 mt-4 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#F5F1EB]/50">
        <span className="size-1.5 rounded-full" style={{ backgroundColor: feature.accent }} />
        <span>Sistema integrado</span>
      </div>
    </article>
  );
});

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

function easeInOut(progress: number) {
  return progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}
