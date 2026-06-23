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
  detail: string;
  signal: string;
  icon: LucideIcon;
  accent: string;
  glow: string;
  priority?: boolean;
};

const AUTO_SHOWCASE_DWELL_MS = 3600;
const AUTO_SHOWCASE_DWELL_MS_COMPACT = 4400;
const RESUME_AFTER_TOUCH_MS = 900;
const FEATURE_REPEAT_COUNT = 3;

const loginFeatures: LoginFeature[] = [
  {
    title: "Agenda",
    text: "Compromissos, visitas e rotinas comerciais em uma visão clara.",
    eyebrow: "Prioridade operacional",
    detail: "Calendário central",
    signal: "Foco do dia",
    icon: CalendarClock,
    accent: "#5FAFC7",
    glow: "rgba(95, 175, 199, 0.34)",
    priority: true,
  },
  {
    title: "Corretores",
    text: "Equipe organizada por atuação, agenda e relacionamento.",
    eyebrow: "Equipe comercial",
    detail: "Atuação integrada",
    signal: "Equipe em campo",
    icon: UsersRound,
    accent: "#2B7FA3",
    glow: "rgba(43, 127, 163, 0.3)",
  },
  {
    title: "Atendimento",
    text: "Fluxo de atendimento do primeiro contato até o fechamento.",
    eyebrow: "Relacionamento",
    detail: "Jornada comercial",
    signal: "Contato ativo",
    icon: Headphones,
    accent: "#D9782D",
    glow: "rgba(217, 120, 45, 0.28)",
  },
  {
    title: "Clientes",
    text: "Base comercial estruturada para relacionamento e conversão.",
    eyebrow: "Carteira",
    detail: "Base qualificada",
    signal: "Relacionamento",
    icon: ClipboardCheck,
    accent: "#F0A86D",
    glow: "rgba(240, 168, 109, 0.24)",
  },
  {
    title: "Agenciamento",
    text: "Captação e gestão de imóveis com processo padronizado.",
    eyebrow: "Captação",
    detail: "Imóveis em fluxo",
    signal: "Processo padrão",
    icon: Home,
    accent: "#1E647D",
    glow: "rgba(30, 100, 125, 0.3)",
  },
  {
    title: "Relatórios",
    text: "Indicadores para acompanhar operação, carteira e resultados.",
    eyebrow: "Inteligência",
    detail: "Leitura executiva",
    signal: "Indicadores",
    icon: BarChart3,
    accent: "#B95F20",
    glow: "rgba(185, 95, 32, 0.28)",
  },
];

const FEATURE_COUNT = loginFeatures.length;
const FEATURE_BASE_INDEX = FEATURE_COUNT;
const renderedFeatures = Array.from(
  { length: FEATURE_COUNT * FEATURE_REPEAT_COUNT },
  (_, index) => ({
    feature: loginFeatures[index % FEATURE_COUNT],
    featureIndex: index % FEATURE_COUNT,
    renderIndex: index,
  }),
);

type LoginFeatureShowcaseProps = {
  className?: string;
};

type DragState = {
  pointerId: number;
  startX: number;
  startPosition: number;
  moved: boolean;
};

export function LoginFeatureShowcase({ className }: LoginFeatureShowcaseProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const isCompact = useIsCompactViewport();
  const isCompactRef = useRef(isCompact);
  isCompactRef.current = isCompact;
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeRenderIndex, setActiveRenderIndex] = useState(FEATURE_BASE_INDEX);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLSpanElement | null>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const frameRef = useRef<number | null>(null);
  const animateRef = useRef<FrameRequestCallback | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const positionRef = useRef(FEATURE_BASE_INDEX);
  const velocityRef = useRef(0);
  const targetPositionRef = useRef(FEATURE_BASE_INDEX);
  const cardStepRef = useRef(1);
  const activeIndexRef = useRef(0);
  const activeRenderIndexRef = useRef(FEATURE_BASE_INDEX);
  const slideStartedAtRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const hoveringRef = useRef(false);
  const draggingRef = useRef(false);
  const dragStateRef = useRef<DragState | null>(null);

  const setProgress = useCallback((progress: number) => {
    progressRef.current?.style.setProperty("--feature-progress", `${Math.round(progress * 100)}%`);
  }, []);

  const updateActiveFromPosition = useCallback((position: number) => {
    const renderIndex = Math.round(position);
    const featureIndex = getFeatureIndex(renderIndex);

    if (featureIndex !== activeIndexRef.current) {
      activeIndexRef.current = featureIndex;
      setActiveIndex(featureIndex);
    }

    if (renderIndex !== activeRenderIndexRef.current) {
      activeRenderIndexRef.current = renderIndex;
      setActiveRenderIndex(renderIndex);
    }
  }, []);

  const applyPosition = useCallback(
    (position: number) => {
      const viewport = viewportRef.current;
      const track = trackRef.current;
      const firstCard = cardRefs.current[FEATURE_BASE_INDEX] ?? cardRefs.current[0];

      if (!viewport || !track || !firstCard || typeof window === "undefined") return;

      const viewportWidth = viewport.getBoundingClientRect().width;
      const cardWidth = firstCard.offsetWidth;
      const styles = window.getComputedStyle(track);
      const gap = Number.parseFloat(styles.columnGap || styles.gap) || 14;
      const cardStep = cardWidth + gap;
      cardStepRef.current = cardStep;

      const offset = viewportWidth / 2 - cardWidth / 2 - position * cardStep;
      track.style.transform = `translate3d(${offset.toFixed(2)}px, 0, 0)`;

      cardRefs.current.forEach((node, index) => {
        if (!node) return;

        const compact = isCompactRef.current;
        const distance = index - position;
        const absDistance = Math.abs(distance);
        const softDistance = Math.min(absDistance, 2.6);
        const depth = compact ? 28 - softDistance * 22 : 56 - softDistance * 42;
        const sideLift = softDistance * (compact ? 4 : 8);
        const sideRotate = compact
          ? clamp(-distance * 3, -7, 7)
          : clamp(-distance * 7, -15, 15);
        const scale = clamp(
          (compact ? 1.02 : 1.03) - softDistance * (compact ? 0.08 : 0.105),
          compact ? 0.82 : 0.76,
          compact ? 1.03 : 1.04,
        );
        const opacity = clamp(1 - softDistance * (compact ? 0.32 : 0.36), 0.16, 1);
        const blur = compact
          ? Math.max(0, absDistance - 0.5) * 0.6
          : Math.max(0, absDistance - 0.38) * 1.35;
        const saturate = compact ? 1 : clamp(1.08 - softDistance * 0.12, 0.78, 1.08);
        const brightness = compact ? 1 : clamp(1.04 - softDistance * 0.09, 0.76, 1.05);

        node.style.setProperty("--feature-carousel-scale", scale.toFixed(3));
        node.style.setProperty("--feature-depth", `${depth.toFixed(2)}px`);
        node.style.setProperty("--feature-side-y", `${sideLift.toFixed(2)}px`);
        node.style.setProperty("--feature-side-rotate", `${sideRotate.toFixed(2)}deg`);
        node.style.setProperty("--feature-opacity", opacity.toFixed(3));
        node.style.setProperty("--feature-blur", `${blur.toFixed(2)}px`);
        node.style.setProperty("--feature-saturate", saturate.toFixed(3));
        node.style.setProperty("--feature-brightness", brightness.toFixed(3));
        node.style.zIndex = String(100 - Math.round(absDistance * 10));
      });

      updateActiveFromPosition(position);
    },
    [updateActiveFromPosition],
  );

  const queueFrame = useCallback(() => {
    if (prefersReducedMotion) {
      positionRef.current = targetPositionRef.current;
      velocityRef.current = 0;
      applyPosition(positionRef.current);
      setProgress(1);
      return;
    }

    if (frameRef.current === null && animateRef.current) {
      frameRef.current = window.requestAnimationFrame(animateRef.current);
    }
  }, [applyPosition, prefersReducedMotion, setProgress]);

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  const pauseShowcase = useCallback(() => {
    if (prefersReducedMotion || pausedRef.current) return;

    clearResumeTimer();
    pausedRef.current = true;
    pausedAtRef.current = performance.now();
  }, [clearResumeTimer, prefersReducedMotion]);

  const resumeShowcase = useCallback(
    (delay = 420) => {
      if (prefersReducedMotion) return;

      clearResumeTimer();
      resumeTimerRef.current = window.setTimeout(() => {
        resumeTimerRef.current = null;
        if (!pausedRef.current || draggingRef.current) return;

        const now = performance.now();
        if (pausedAtRef.current !== null) {
          slideStartedAtRef.current += now - pausedAtRef.current;
          pausedAtRef.current = null;
        }

        pausedRef.current = false;
        queueFrame();
      }, delay);
    },
    [clearResumeTimer, prefersReducedMotion, queueFrame],
  );

  const moveToRenderIndex = useCallback(
    (renderIndex: number) => {
      targetPositionRef.current = renderIndex;
      slideStartedAtRef.current = performance.now();
      setProgress(0);
      queueFrame();
    },
    [queueFrame, setProgress],
  );

  const moveToFeature = useCallback(
    (featureIndex: number) => {
      const renderIndex = closestRenderIndexForFeature(featureIndex, positionRef.current);
      moveToRenderIndex(renderIndex);
    },
    [moveToRenderIndex],
  );

  const handlePointerEnter = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse") {
        hoveringRef.current = true;
        pauseShowcase();
      }
    },
    [pauseShowcase],
  );

  const handlePointerLeave = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse") {
        hoveringRef.current = false;
        if (!draggingRef.current) resumeShowcase(520);
      }
    },
    [resumeShowcase],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;

      pauseShowcase();
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startPosition: positionRef.current,
        moved: false,
      };
      draggingRef.current = false;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [pauseShowcase],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId || prefersReducedMotion) return;

      const deltaX = event.clientX - dragState.startX;
      if (Math.abs(deltaX) < 3 && !dragState.moved) return;

      dragState.moved = true;
      draggingRef.current = true;
      const nextPosition = dragState.startPosition - deltaX / cardStepRef.current;

      positionRef.current = nextPosition;
      targetPositionRef.current = nextPosition;
      velocityRef.current = 0;
      setProgress(0);
      applyPosition(nextPosition);
    },
    [applyPosition, prefersReducedMotion, setProgress],
  );

  const finishDrag = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      dragStateRef.current = null;

      const nextTarget = normalizeRenderTarget(Math.round(positionRef.current));
      draggingRef.current = false;
      targetPositionRef.current = nextTarget;
      slideStartedAtRef.current = performance.now();
      setProgress(0);
      queueFrame();

      if (event.pointerType === "mouse" && hoveringRef.current) return;
      resumeShowcase(event.pointerType === "touch" ? RESUME_AFTER_TOUCH_MS : 500);
    },
    [queueFrame, resumeShowcase, setProgress],
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

    positionRef.current = FEATURE_BASE_INDEX;
    velocityRef.current = 0;
    targetPositionRef.current = FEATURE_BASE_INDEX;
    activeIndexRef.current = 0;
    activeRenderIndexRef.current = FEATURE_BASE_INDEX;
    slideStartedAtRef.current = performance.now();
    pausedAtRef.current = null;
    pausedRef.current = false;
    hoveringRef.current = false;
    draggingRef.current = false;
    dragStateRef.current = null;
    setActiveIndex(0);
    setActiveRenderIndex(FEATURE_BASE_INDEX);
    setProgress(prefersReducedMotion ? 1 : 0);
    applyPosition(FEATURE_BASE_INDEX);

    if (prefersReducedMotion) return;

    const animate: FrameRequestCallback = (timestamp) => {
      frameRef.current = null;

      const target = targetPositionRef.current;
      const distance = target - positionRef.current;
      const isSettled = Math.abs(distance) < 0.002 && Math.abs(velocityRef.current) < 0.002;
      const wasMoving = !isSettled;

      if (!pausedRef.current && !draggingRef.current && isSettled) {
        const dwell = isCompactRef.current
          ? AUTO_SHOWCASE_DWELL_MS_COMPACT
          : AUTO_SHOWCASE_DWELL_MS;
        const elapsed = timestamp - slideStartedAtRef.current;
        const progress = Math.min(Math.max(elapsed / dwell, 0), 1);
        setProgress(progress);

        if (progress >= 1) {
          targetPositionRef.current = target + 1;
          slideStartedAtRef.current = timestamp;
          setProgress(0);
        }
      }

      const nextTarget = targetPositionRef.current;
      const nextDistance = nextTarget - positionRef.current;
      velocityRef.current = (velocityRef.current + nextDistance * 0.12) * 0.82;
      positionRef.current += velocityRef.current;

      if (Math.abs(nextDistance) < 0.004 && Math.abs(velocityRef.current) < 0.004) {
        positionRef.current = nextTarget;
        velocityRef.current = 0;
      }

      const settledAfterMove =
        Math.abs(targetPositionRef.current - positionRef.current) < 0.002 &&
        Math.abs(velocityRef.current) < 0.002;

      if (settledAfterMove && !draggingRef.current) {
        if (wasMoving) {
          slideStartedAtRef.current = timestamp;
          setProgress(0);
        }

        const normalizedTarget = normalizeRenderTarget(targetPositionRef.current);
        if (normalizedTarget !== targetPositionRef.current) {
          const shift = normalizedTarget - targetPositionRef.current;
          targetPositionRef.current = normalizedTarget;
          positionRef.current += shift;
        }
      }

      applyPosition(positionRef.current);

      const shouldContinue =
        !pausedRef.current ||
        draggingRef.current ||
        Math.abs(targetPositionRef.current - positionRef.current) > 0.002 ||
        Math.abs(velocityRef.current) > 0.002;

      if (shouldContinue) {
        frameRef.current = window.requestAnimationFrame(animate);
      }
    };

    animateRef.current = animate;
    frameRef.current = window.requestAnimationFrame(animate);

    return () => {
      clearResumeTimer();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [applyPosition, clearResumeTimer, prefersReducedMotion, setProgress]);

  return (
    <section
      className={cn("login-feature-showcase", className)}
      aria-label="Principais recursos do Gestão Cordial & Morar"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocusCapture={pauseShowcase}
      onBlurCapture={() => resumeShowcase(520)}
    >
      <div className="login-feature-copy mx-auto max-w-[20.5rem] text-center sm:max-w-[24rem]">
        <p className="login-feature-kicker text-[11px] font-bold uppercase text-[#F0A86D]/90">
          Operação imobiliária em movimento
        </p>
        <p className="login-feature-subtitle mt-2 text-balance text-xs leading-5 text-[#F5F1EB]/68 sm:text-[13px] lg:text-sm">
          Agenda, corretores, atendimentos e relatórios integrados em uma experiência única.
        </p>
      </div>

      <div
        ref={viewportRef}
        className="login-feature-viewport mt-4"
        role="group"
        aria-roledescription="carrossel"
        aria-label="Apresentação automática das áreas do sistema"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <div ref={trackRef} className="login-feature-track">
          {renderedFeatures.map(({ feature, featureIndex, renderIndex }) => (
            <Feature3DCard
              key={`${feature.title}-${renderIndex}`}
              refCallback={(node) => {
                cardRefs.current[renderIndex] = node;
              }}
              feature={feature}
              active={activeRenderIndex === renderIndex}
              ariaHidden={activeRenderIndex !== renderIndex}
              motionEnabled={!prefersReducedMotion}
              renderIndex={renderIndex}
              featureIndex={featureIndex}
            />
          ))}
        </div>
      </div>

      <div className="login-feature-controls mt-3" aria-label="Progresso da vitrine">
        <div className="login-feature-progress-track" aria-hidden="true">
          <span ref={progressRef} className="login-feature-progress-fill" />
        </div>
        <div className="login-feature-pips" aria-label="Selecionar recurso em destaque">
          {loginFeatures.map((feature, index) => (
            <button
              key={feature.title}
              type="button"
              className={cn("login-feature-pip", activeIndex === index && "is-active")}
              aria-label={`Mostrar ${feature.title}`}
              aria-current={activeIndex === index ? "true" : undefined}
              onClick={() => moveToFeature(index)}
            >
              <span className="sr-only">{feature.title}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

type Feature3DCardProps = {
  feature: LoginFeature;
  active: boolean;
  ariaHidden: boolean;
  motionEnabled: boolean;
  renderIndex: number;
  featureIndex: number;
  refCallback: (node: HTMLElement | null) => void;
};

const Feature3DCard = memo(function Feature3DCard({
  feature,
  active,
  ariaHidden,
  motionEnabled,
  renderIndex,
  featureIndex,
  refCallback,
}: Feature3DCardProps) {
  const Icon = feature.icon;

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!motionEnabled || event.pointerType !== "mouse" || !active) return;
      if (window.matchMedia("(max-width: 640px)").matches) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;

      event.currentTarget.style.setProperty("--feature-tilt-x", `${(-y * 5.5).toFixed(2)}deg`);
      event.currentTarget.style.setProperty("--feature-tilt-y", `${(x * 6.5).toFixed(2)}deg`);
      event.currentTarget.style.setProperty("--feature-parallax-x", `${(x * 9).toFixed(2)}px`);
      event.currentTarget.style.setProperty("--feature-parallax-y", `${(y * 7).toFixed(2)}px`);
      event.currentTarget.style.setProperty("--feature-soft-x", `${(-x * 8).toFixed(2)}px`);
      event.currentTarget.style.setProperty("--feature-soft-y", `${(-y * 6).toFixed(2)}px`);
      event.currentTarget.style.setProperty("--feature-shine-x", `${(50 + x * 34).toFixed(2)}%`);
      event.currentTarget.style.setProperty("--feature-shine-y", `${(42 + y * 30).toFixed(2)}%`);
      event.currentTarget.style.setProperty("--feature-lift", "-6px");
      event.currentTarget.style.setProperty(
        "--feature-hover-scale",
        feature.priority ? "1.018" : "1.012",
      );
    },
    [active, feature.priority, motionEnabled],
  );

  const resetMotion = useCallback((event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--feature-tilt-x", "0deg");
    event.currentTarget.style.setProperty("--feature-tilt-y", "0deg");
    event.currentTarget.style.setProperty("--feature-parallax-x", "0px");
    event.currentTarget.style.setProperty("--feature-parallax-y", "0px");
    event.currentTarget.style.setProperty("--feature-soft-x", "0px");
    event.currentTarget.style.setProperty("--feature-soft-y", "0px");
    event.currentTarget.style.setProperty("--feature-shine-x", "50%");
    event.currentTarget.style.setProperty("--feature-shine-y", "42%");
    event.currentTarget.style.setProperty("--feature-lift", "0px");
    event.currentTarget.style.setProperty("--feature-hover-scale", "1");
  }, []);

  const pressCard = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!active) return;
      event.currentTarget.style.setProperty("--feature-hover-scale", "0.992");
      event.currentTarget.style.setProperty("--feature-lift", "-1px");
    },
    [active],
  );

  const releaseCard = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!active || event.pointerType === "touch") {
        resetMotion(event);
        return;
      }

      event.currentTarget.style.setProperty(
        "--feature-hover-scale",
        feature.priority ? "1.018" : "1.012",
      );
      event.currentTarget.style.setProperty("--feature-lift", "-6px");
    },
    [active, feature.priority, resetMotion],
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
          "--feature-shine-y": "42%",
          "--feature-lift": "0px",
          "--feature-hover-scale": "1",
          "--feature-carousel-scale": active ? "1.03" : "0.92",
          "--feature-depth": active ? "56px" : "0px",
          "--feature-side-y": active ? "0px" : "8px",
          "--feature-side-rotate": "0deg",
          "--feature-opacity": active ? "1" : "0.5",
          "--feature-blur": active ? "0px" : "1px",
          "--feature-saturate": active ? "1.08" : "0.9",
          "--feature-brightness": active ? "1.04" : "0.88",
        } as CSSProperties
      }
      aria-hidden={ariaHidden}
      data-feature-index={featureIndex}
      data-render-index={renderIndex}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetMotion}
      onPointerCancel={resetMotion}
      onPointerDown={pressCard}
      onPointerUp={releaseCard}
    >
      <span className="login-feature-card-ambient" aria-hidden="true" />
      <span className="login-feature-card-noise" aria-hidden="true" />
      <span className="login-feature-card-line" aria-hidden="true" />

      <div className="login-feature-card-layer relative z-10 flex items-start justify-between gap-3">
        <span className="login-feature-icon grid size-11 shrink-0 place-items-center rounded-2xl text-white">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span
          className={cn("login-feature-badge", feature.priority && "login-feature-badge--priority")}
        >
          {feature.priority ? "Foco" : feature.signal}
        </span>
      </div>

      <div className="login-feature-card-copy relative z-10 mt-4">
        <p className="login-feature-card-eyebrow">{feature.eyebrow}</p>
        <h3 className="login-feature-card-title">{feature.title}</h3>
        <p className="login-feature-card-text">{feature.text}</p>
      </div>

      <div className="login-feature-card-footer relative z-10 mt-4">
        <span className="login-feature-status">
          <span className="login-feature-status-dot" aria-hidden="true" />
          {feature.detail}
        </span>
        <span className="login-feature-mini-bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
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

function useIsCompactViewport() {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsCompact(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isCompact;
}

function getFeatureIndex(index: number) {
  return ((index % FEATURE_COUNT) + FEATURE_COUNT) % FEATURE_COUNT;
}

function closestRenderIndexForFeature(featureIndex: number, currentPosition: number) {
  let closest = featureIndex;
  let shortestDistance = Number.POSITIVE_INFINITY;

  for (
    let renderIndex = featureIndex;
    renderIndex < FEATURE_COUNT * FEATURE_REPEAT_COUNT;
    renderIndex += FEATURE_COUNT
  ) {
    const distance = Math.abs(renderIndex - currentPosition);
    if (distance < shortestDistance) {
      shortestDistance = distance;
      closest = renderIndex;
    }
  }

  return closest;
}

function normalizeRenderTarget(index: number) {
  if (index >= FEATURE_BASE_INDEX + FEATURE_COUNT) return index - FEATURE_COUNT;
  if (index < FEATURE_BASE_INDEX) return index + FEATURE_COUNT;
  return index;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
