import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

const MOVE_MS = 180;
const DRAG_THRESHOLD = 6;
const SCROLL_EDGE = 56;

type Point = { x: number; y: number };
type Slot = { id: string; rect: DOMRect };
type Gesture = {
  id: string;
  pointer: number;
  handle: HTMLElement;
  card: HTMLElement;
  start: Point;
  point: Point;
  origin: Point;
  scroller: HTMLElement;
  viewport: { left: number; top: number; right: number; bottom: number };
  scrollX: boolean;
  scrollY: boolean;
  slots: Slot[];
  target: string | null;
  active: boolean;
};

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getScrollContainer(node: HTMLElement) {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (
      (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) ||
      (/(auto|scroll)/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth)
    )
      return parent;
  }
  return document.scrollingElement as HTMLElement;
}

function scrollSpeed(value: number, start: number, end: number) {
  if (value < start + SCROLL_EDGE) return -Math.min(20, (start + SCROLL_EDGE - value) / 3);
  if (value > end - SCROLL_EDGE) return Math.min(20, (value - end + SCROLL_EDGE) / 3);
  return 0;
}

function findTarget(slots: Slot[], point: Point) {
  let closest: string | null = null;
  let best = Infinity;
  for (const { id, rect } of slots) {
    if (
      point.x >= rect.left &&
      point.x <= rect.right &&
      point.y >= rect.top &&
      point.y <= rect.bottom
    )
      return id;
    const distance = Math.hypot(
      point.x - (rect.left + rect.width / 2),
      point.y - (rect.top + rect.height / 2),
    );
    if (distance < best && distance <= Math.hypot(rect.width, rect.height) * 0.65) {
      best = distance;
      closest = id;
    }
  }
  return closest;
}

function cardFor(cell: HTMLElement | undefined) {
  return cell?.querySelector<HTMLElement>("[data-photo-card]");
}

/** As células guardam a geometria da grade. Apenas os cartões internos recebem transform. */
export function usePhotoSorting({
  ids,
  onMove,
  enabled = true,
}: {
  ids: string[];
  onMove: (id: string, destination: number) => boolean | void;
  enabled?: boolean;
}) {
  const cells = useRef(new Map<string, HTMLElement>());
  const animations = useRef(new Map<string, Animation>());
  const before = useRef<Map<string, DOMRect> | null>(null);
  const restoreFocus = useRef<{ id: string; control: string; show: boolean } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef<number>(0);
  const [drag, setDrag] = useState<{ id: string; target: string | null } | null>(null);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const orderKey = ids.join(",");

  function captureMove(id: string, control: string, show: boolean) {
    restoreFocus.current = { id, control, show };
    if (reducedMotion()) return;
    before.current = new Map();
    for (const [key, cell] of cells.current) {
      const card = cardFor(cell);
      if (card) before.current.set(key, card.getBoundingClientRect());
    }
  }

  useLayoutEffect(() => {
    const old = before.current;
    before.current = null;
    if (old && !reducedMotion()) {
      const moves: { key: string; card: HTMLElement; x: number; y: number }[] = [];
      for (const [key, rect] of old) {
        const cell = cells.current.get(key);
        const card = cardFor(cell);
        if (!cell || !card) continue;
        // Mede as células, que não herdam o transform animado dos cartões.
        const next = cell.getBoundingClientRect();
        moves.push({ key, card, x: rect.left - next.left, y: rect.top - next.top });
      }
      for (const { key, card, x, y } of moves) {
        animations.current.get(key)?.cancel();
        if (Math.abs(x) + Math.abs(y) < 1 || !card.animate) continue;
        const motion = card.animate(
          [{ transform: `translate3d(${x}px,${y}px,0)` }, { transform: "translate3d(0,0,0)" }],
          { duration: MOVE_MS, easing: "cubic-bezier(0.2,0,0,1)" },
        );
        animations.current.set(key, motion);
        motion.onfinish = () => {
          if (animations.current.get(key) === motion) animations.current.delete(key);
        };
      }
    }
    const focus = restoreFocus.current;
    restoreFocus.current = null;
    if (focus) {
      const cell = cells.current.get(focus.id);
      cell
        ?.querySelector<HTMLElement>(`[data-photo-control="${focus.control}"]`)
        ?.focus({ preventScroll: true });
      if (focus.show) cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [orderKey]);

  function measureSlots(ids: string[]): Slot[] {
    return ids.flatMap((id) => {
      const cell = cells.current.get(id);
      return cell ? [{ id, rect: cell.getBoundingClientRect() }] : [];
    });
  }

  function draw(active: Gesture, scroll: boolean) {
    const { scroller, viewport, point } = active;
    if (
      scroll &&
      point.y >= viewport.top - SCROLL_EDGE &&
      point.y <= viewport.bottom + SCROLL_EDGE &&
      point.x >= viewport.left - SCROLL_EDGE &&
      point.x <= viewport.right + SCROLL_EDGE
    ) {
      if (active.scrollX)
        scroller.scrollLeft += scrollSpeed(point.x, viewport.left, viewport.right);
      if (active.scrollY) scroller.scrollTop += scrollSpeed(point.y, viewport.top, viewport.bottom);
    }
    const x = point.x + scroller.scrollLeft - active.origin.x;
    const y = point.y + scroller.scrollTop - active.origin.y;
    active.card.style.transform = `translate3d(${x - active.start.x}px,${y - active.start.y}px,0)`;
    const target = findTarget(active.slots, { x, y });
    if (active.target !== target) {
      active.target = target;
      setDrag({ id: active.id, target });
    }
  }

  function animatePointer() {
    const active = gesture.current;
    if (!active?.active) return;
    draw(active, true);
    frame.current = requestAnimationFrame(animatePointer);
  }

  const stop = useCallback(() => {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    active.card.style.transform = "";
    if (active.handle.hasPointerCapture?.(active.pointer)) {
      active.handle.releasePointerCapture(active.pointer);
    }
    if (active.active) setDrag(null);
  }, []);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !gesture.current) return;
      event.preventDefault();
      stop();
    }
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("keydown", onEscape);
      stop();
    };
  }, [stop]);

  function animateMove(id: string, control: string, action: () => boolean | void, show = false) {
    captureMove(id, control, show);
    if (action() !== false) return true;
    before.current = null;
    restoreFocus.current = null;
    return false;
  }

  function move(id: string, destination: number, control: string, show = false) {
    const current = idsRef.current;
    if (destination < 0 || destination >= current.length || current[destination] === id) return;
    animateMove(id, control, () => onMove(id, destination), show);
  }

  function getItemProps(id: string) {
    return {
      ref: (node: HTMLElement | null) => {
        if (node) cells.current.set(id, node);
        else cells.current.delete(id);
      },
      "data-photo-key": id,
    };
  }

  function getHandleProps(id: string) {
    return {
      "data-photo-control": "handle",
      style: { touchAction: "none" },
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (!enabled || !event.isPrimary || event.button !== 0 || gesture.current) return;
        const cell = cells.current.get(id);
        const card = cardFor(cell);
        if (!cell || !card) return;
        const scroller = getScrollContainer(cell);
        const viewport =
          scroller === document.scrollingElement
            ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
            : scroller.getBoundingClientRect();
        const point = { x: event.clientX, y: event.clientY };
        gesture.current = {
          id,
          pointer: event.pointerId,
          handle: event.currentTarget,
          card,
          scroller,
          viewport,
          start: point,
          point,
          origin: { x: scroller.scrollLeft, y: scroller.scrollTop },
          scrollX: scroller.scrollWidth > scroller.clientWidth,
          scrollY: scroller.scrollHeight > scroller.clientHeight,
          slots: measureSlots(idsRef.current),
          target: id,
          active: false,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const active = gesture.current;
        if (!active || active.pointer !== event.pointerId) return;
        active.point = { x: event.clientX, y: event.clientY };
        if (active.active) return;
        if (
          Math.hypot(active.point.x - active.start.x, active.point.y - active.start.y) <
          DRAG_THRESHOLD
        )
          return;
        active.active = true;
        animations.current.get(id)?.cancel();
        setDrag({ id, target: id });
        frame.current = requestAnimationFrame(animatePointer);
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        const active = gesture.current;
        if (!active || active.pointer !== event.pointerId) return;
        if (active.active) {
          active.point = { x: event.clientX, y: event.clientY };
          draw(active, false);
          const destination = active.target ? idsRef.current.indexOf(active.target) : -1;
          // O quadro de origem ainda inclui a posição visual da foto arrastada.
          move(id, destination, "handle");
        }
        stop();
      },
      onPointerCancel: (event: PointerEvent<HTMLElement>) => {
        if (gesture.current?.pointer === event.pointerId) stop();
      },
      onLostPointerCapture: (event: PointerEvent<HTMLElement>) => {
        if (gesture.current?.pointer === event.pointerId) stop();
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (!enabled || gesture.current) return;
        const index = idsRef.current.indexOf(id);
        if (index < 0) return;
        let delta = 0;
        if (event.key === "ArrowLeft") delta = -1;
        if (event.key === "ArrowRight") delta = 1;
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          const slots = measureSlots(idsRef.current);
          const columns = slots.filter(
            ({ rect }) => Math.abs(rect.top - (slots[0]?.rect.top ?? 0)) < 4,
          ).length;
          delta = event.key === "ArrowUp" ? -columns : columns;
        }
        if (!delta) return;
        event.preventDefault();
        move(id, Math.max(0, Math.min(idsRef.current.length - 1, index + delta)), "handle", true);
      },
    };
  }

  return {
    getItemProps,
    getHandleProps,
    animateMove,
    move,
    draggingId: drag?.id ?? null,
    targetId: drag?.target ?? null,
  };
}
