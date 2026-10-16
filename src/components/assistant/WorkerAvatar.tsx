import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import type { AgentBot } from "@/lib/agent/bots";
import { cn } from "@/lib/utils";

export function WorkerAvatar({
  bot,
  size = 56,
  working = false,
  className,
}: {
  bot: Pick<AgentBot, "name" | "shape" | "color">;
  size?: number;
  working?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const avatar = useRef<SVGSVGElement>(null);
  const frame = useRef(0);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastReaction = useRef(0);
  const lastSpin = useRef(0);
  const [reaction, setReaction] = useState<"idle" | "greet" | "spin">("idle");

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(reactionTimer.current);
      clearTimeout(releaseTimer.current);
    },
    [],
  );

  function followPointer(event: PointerEvent<SVGSVGElement>) {
    const { clientX, clientY } = event;
    const target = event.currentTarget;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (!target.isConnected) return;
      const bounds = target.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, ((clientX - bounds.left) / bounds.width) * 2 - 1));
      const y = Math.max(-1, Math.min(1, ((clientY - bounds.top) / bounds.height) * 2 - 1));
      target.style.setProperty("--worker-look-x", `${x * 3.3}px`);
      target.style.setProperty("--worker-look-y", `${y * 2.5}px`);
      target.style.setProperty("--worker-tilt", `${x * 7}deg`);
      target.style.setProperty("--worker-lift", "-2px");
    });
  }

  function settle() {
    cancelAnimationFrame(frame.current);
    const target = avatar.current;
    if (!target) return;
    for (const property of ["--worker-look-x", "--worker-look-y", "--worker-tilt", "--worker-lift"])
      target.style.removeProperty(property);
  }

  function greet(deliberate = false) {
    const now = Date.now();
    if (!deliberate && now - lastReaction.current < 280) return;
    lastReaction.current = now;
    const spin = deliberate && now - lastSpin.current > 820;
    if (spin) lastSpin.current = now;
    clearTimeout(reactionTimer.current);
    setReaction(spin ? "spin" : "greet");
    reactionTimer.current = setTimeout(() => setReaction("idle"), spin ? 820 : 520);
  }
  const shapes = {
    tile: <rect x="18" y="18" width="65" height="65" rx="22" transform="rotate(-9 50 50)" />,
    heart: <path d="M50 22C31 4 9 28 19 47L33 76Q50 94 67 76L81 47C92 26 67 4 50 22Z" />,
    hexagon: (
      <path d="M41 13Q50 8 59 13L78 25Q87 30 87 41V63Q87 74 78 79L59 90Q50 94 41 89L22 78Q13 73 13 62V40Q13 29 22 24Z" />
    ),
    drop: <path d="M50 9C40 9 15 46 15 64C15 98 85 98 85 64C85 46 60 9 50 9Z" />,
    pill: <rect x="14" y="25" width="74" height="52" rx="26" transform="rotate(-12 50 50)" />,
    star: (
      <path d="M41 14Q50 3 59 14L66 29L83 31Q98 34 89 48L77 61L79 79Q79 96 64 89L49 81L33 89Q17 95 20 78L23 60L11 47Q2 34 18 31L35 29Z" />
    ),
    cloud: (
      <path d="M27 36C22 12 54 6 64 27C90 18 103 56 80 69C79 91 47 96 37 80C13 88 1 49 27 36Z" />
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 106"
      role="img"
      aria-label={`Mascote ${bot.name}`}
      ref={avatar}
      onPointerEnter={(event) => {
        clearTimeout(releaseTimer.current);
        followPointer(event);
        if (event.pointerType !== "touch") greet();
      }}
      onPointerMove={followPointer}
      onPointerDown={(event) => {
        clearTimeout(releaseTimer.current);
        followPointer(event);
        greet(true);
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "touch") releaseTimer.current = setTimeout(settle, 180);
      }}
      onPointerLeave={settle}
      onPointerCancel={settle}
      className={cn(
        "worker-avatar shrink-0 overflow-visible",
        working && "worker-working",
        className,
      )}
    >
      <defs>
        <linearGradient id={`${id}body`} x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="white" stopOpacity=".65" />
          <stop offset=".35" stopColor={bot.color} />
          <stop offset="1" stopColor={bot.color} />
        </linearGradient>
        <radialGradient id={`${id}shine`}>
          <stop stopColor="white" stopOpacity=".65" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse
        className="worker-shadow"
        cx="50"
        cy="96"
        rx="25"
        ry="4"
        fill={bot.color}
        opacity=".13"
      />
      {/* Keep the pointer target mounted so its parent still receives the click. */}
      <g className="worker-reaction" data-reaction={reaction}>
        <g className="worker-character">
          <g className="worker-body" fill={`url(#${id}body)`} stroke={bot.color} strokeWidth=".7">
            {shapes[bot.shape]}
          </g>
          <ellipse
            cx="34"
            cy="30"
            rx="16"
            ry="10"
            fill={`url(#${id}shine)`}
            transform="rotate(-20 34 30)"
          />
          <g className="worker-face">
            <g className="worker-eyes" fill="#253842">
              <ellipse cx="41" cy="52" rx="3.2" ry="5.1" />
              <ellipse cx="59" cy="52" rx="3.2" ry="5.1" />
            </g>
            <path
              d="M46 64Q50 67 54 64"
              fill="none"
              stroke="#253842"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity=".4"
            />
          </g>
        </g>
      </g>
    </svg>
  );
}
