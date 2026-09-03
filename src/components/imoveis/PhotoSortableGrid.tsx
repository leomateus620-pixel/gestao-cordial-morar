import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Reordenação de fotos por arrastar e soltar, sem dependência externa.
 * Funciona com mouse, toque e teclado (setas). O item arrastado segue o
 * ponteiro por transform (sem re-render) e os vizinhos deslizam com FLIP.
 */
const DRAG_THRESHOLD_PX = 6;
const FLIP_MS = 180;
const EDGE_SCROLL_PX = 56;
const EDGE_SCROLL_SPEED = 14;

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return list;
  next.splice(to, 0, item);
  return next;
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type SortableItemProps = {
  "data-sort-index": number;
  draggable: false;
  ref: (node: HTMLElement | null) => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  style: React.CSSProperties;
  tabIndex: number;
  "aria-grabbed": boolean | undefined;
};

export function usePhotoSorting<T extends { id: string }>({
  items,
  onReorder,
  onDragEnd,
  enabled = true,
}: {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  /** Chamado uma única vez ao soltar, para agrupar efeitos colaterais. */
  onDragEnd?: () => void;
  enabled?: boolean;
}) {
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingRef = useRef(false);
  const dragIdRef = useRef<string | null>(null);
  const startRef = useRef<{ x: number; y: number; index: number } | null>(null);
  const grabOffsetRef = useRef({ x: 0, y: 0 });
  const pointerRef = useRef({ x: 0, y: 0 });
  const orderRef = useRef(order);
  orderRef.current = order;

  // Elementos vivos por id — base para FLIP e para mover o item arrastado.
  const nodesRef = useRef(new Map<string, HTMLElement>());
  const rectsRef = useRef(new Map<string, DOMRect>());
  const scrollFrameRef = useRef<number | null>(null);

  const incomingKey = items.map((i) => i.id).join(",");
  useEffect(() => {
    if (draggingRef.current) return;
    setOrder(items.map((i) => i.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingKey]);

  const positionDragged = useCallback(() => {
    const id = dragIdRef.current;
    if (!id) return;
    const node = nodesRef.current.get(id);
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const current = new DOMMatrixReadOnly(getComputedStyle(node).transform);
    const baseLeft = rect.left - current.m41;
    const baseTop = rect.top - current.m42;
    const dx = pointerRef.current.x - grabOffsetRef.current.x - baseLeft;
    const dy = pointerRef.current.y - grabOffsetRef.current.y - baseTop;
    node.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.06)`;
  }, []);

  // FLIP: anima os vizinhos até o novo lugar após cada troca de posição.
  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();
    const next = new Map<string, DOMRect>();
    for (const [id, node] of nodesRef.current) {
      if (!node.isConnected) continue;
      const before = rectsRef.current.get(id);
      if (id === dragIdRef.current) {
        next.set(id, node.getBoundingClientRect());
        continue;
      }
      const after = node.getBoundingClientRect();
      next.set(id, after);
      if (!before || reduced) continue;
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      node.animate(
        [{ transform: `translate3d(${dx}px, ${dy}px, 0)` }, { transform: "translate3d(0,0,0)" }],
        { duration: FLIP_MS, easing: "cubic-bezier(0.2, 0, 0, 1)" },
      );
    }
    rectsRef.current = next;
    if (draggingRef.current) positionDragged();
  }, [order, positionDragged]);

  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as T[];

  const commit = useCallback(() => {
    const next = orderRef.current;
    const original = items.map((i) => i.id);
    if (next.length === original.length && next.every((id, i) => id === original[i])) return;
    onReorder(next);
  }, [items, onReorder]);

  const moveTo = useCallback((from: number, to: number) => {
    setOrder((current) => {
      if (to < 0 || to >= current.length || from === to) return current;
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
      return arrayMove(current, from, to);
    });
  }, []);

  /** Rola a faixa sozinha quando o arraste chega perto das bordas. */
  const autoScroll = useCallback(() => {
    scrollFrameRef.current = null;
    if (!draggingRef.current) return;
    const id = dragIdRef.current;
    const node = id ? nodesRef.current.get(id) : null;
    const scroller = node?.parentElement;
    if (scroller && scroller.scrollWidth > scroller.clientWidth + 4) {
      const box = scroller.getBoundingClientRect();
      const x = pointerRef.current.x;
      if (x < box.left + EDGE_SCROLL_PX) scroller.scrollLeft -= EDGE_SCROLL_SPEED;
      else if (x > box.right - EDGE_SCROLL_PX) scroller.scrollLeft += EDGE_SCROLL_SPEED;
    }
    positionDragged();
    scrollFrameRef.current = requestAnimationFrame(autoScroll);
  }, [positionDragged]);

  const stopDrag = useCallback(() => {
    const id = dragIdRef.current;
    const node = id ? nodesRef.current.get(id) : null;
    if (node) {
      node.style.transform = "";
      node.style.zIndex = "";
      node.style.transition = "";
    }
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = null;
    draggingRef.current = false;
    dragIdRef.current = null;
    startRef.current = null;
    setDraggingId(null);
    if (typeof document !== "undefined") document.body.style.userSelect = "";
  }, []);

  useEffect(() => stopDrag, [stopDrag]);

  const getItemProps = useCallback(
    (index: number): SortableItemProps => ({
      "data-sort-index": index,
      draggable: false,
      tabIndex: enabled ? 0 : -1,
      "aria-grabbed": enabled ? draggingId === orderRef.current[index] : undefined,
      style: enabled ? { touchAction: "none", willChange: "transform" } : {},
      ref: (node: HTMLElement | null) => {
        const id = orderRef.current[index];
        if (!id) return;
        if (node) nodesRef.current.set(id, node);
      },
      onPointerDown: (event) => {
        if (!enabled || event.button !== 0) return;
        startRef.current = { x: event.clientX, y: event.clientY, index };
        pointerRef.current = { x: event.clientX, y: event.clientY };
        const rect = event.currentTarget.getBoundingClientRect();
        grabOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      },
      onPointerMove: (event) => {
        const start = startRef.current;
        if (!enabled || !start) return;
        pointerRef.current = { x: event.clientX, y: event.clientY };
        if (!draggingRef.current) {
          const moved =
            Math.abs(event.clientX - start.x) > DRAG_THRESHOLD_PX ||
            Math.abs(event.clientY - start.y) > DRAG_THRESHOLD_PX;
          if (!moved) return;
          draggingRef.current = true;
          dragIdRef.current = orderRef.current[start.index] ?? null;
          setDraggingId(dragIdRef.current);
          document.body.style.userSelect = "none";
          const node = event.currentTarget as HTMLElement;
          node.style.zIndex = "30";
          event.currentTarget.setPointerCapture?.(event.pointerId);
          scrollFrameRef.current = requestAnimationFrame(autoScroll);
        }
        positionDragged();
        const currentIndex = orderRef.current.findIndex((id) => id === dragIdRef.current);
        const fromIndex = currentIndex >= 0 ? currentIndex : start.index;
        const element = document.elementFromPoint(event.clientX, event.clientY);
        const target = element?.closest("[data-sort-index]") as HTMLElement | null;
        if (!target) return;
        const toIndex = Number(target.dataset["sortIndex"]);
        if (Number.isNaN(toIndex) || toIndex === fromIndex) return;
        moveTo(fromIndex, toIndex);
      },
      onPointerUp: (event) => {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        const wasDragging = draggingRef.current;
        stopDrag();
        if (!wasDragging) return;
        commit();
        onDragEnd?.();
      },
      onPointerCancel: () => stopDrag(),
      onKeyDown: (event) => {
        if (!enabled) return;
        const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        if (!delta) return;
        event.preventDefault();
        moveTo(index, index + delta);
        // Teclado grava imediatamente: cada seta é uma decisão do usuário.
        setTimeout(() => {
          commit();
          onDragEnd?.();
        }, 0);
      },
    }),
    [enabled, draggingId, moveTo, commit, autoScroll, positionDragged, stopDrag, onDragEnd],
  );

  return { ordered, draggingId, getItemProps, moveTo, commit };
}
