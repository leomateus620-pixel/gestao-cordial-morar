import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reordenação de fotos por arrastar e soltar, sem dependência externa.
 * Funciona com mouse, toque e teclado (setas), e só começa a arrastar
 * depois de um pequeno movimento — assim o clique normal continua valendo.
 */
const DRAG_THRESHOLD_PX = 6;

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return list;
  next.splice(to, 0, item);
  return next;
}

export type SortableItemProps = {
  "data-sort-index": number;
  draggable: false;
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
  enabled = true,
}: {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  enabled?: boolean;
}) {
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingRef = useRef(false);
  const dragIdRef = useRef<string | null>(null);
  const startRef = useRef<{ x: number; y: number; index: number } | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;

  const incomingKey = items.map((i) => i.id).join(",");
  useEffect(() => {
    if (draggingRef.current) return;
    setOrder(items.map((i) => i.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingKey]);

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
      return arrayMove(current, from, to);
    });
  }, []);

  const getItemProps = useCallback(
    (index: number): SortableItemProps => ({
      "data-sort-index": index,
      draggable: false,
      tabIndex: enabled ? 0 : -1,
      "aria-grabbed": enabled ? draggingId === orderRef.current[index] : undefined,
      style: enabled ? { touchAction: "none" } : {},
      onPointerDown: (event) => {
        if (!enabled || event.button !== 0) return;
        startRef.current = { x: event.clientX, y: event.clientY, index };
      },
      onPointerMove: (event) => {
        const start = startRef.current;
        if (!enabled || !start) return;
        if (!draggingRef.current) {
          const moved =
            Math.abs(event.clientX - start.x) > DRAG_THRESHOLD_PX ||
            Math.abs(event.clientY - start.y) > DRAG_THRESHOLD_PX;
          if (!moved) return;
          draggingRef.current = true;
          dragIdRef.current = orderRef.current[start.index] ?? null;
          setDraggingId(dragIdRef.current);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }
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
        startRef.current = null;
        if (!draggingRef.current) return;
        draggingRef.current = false;
        dragIdRef.current = null;
        setDraggingId(null);
        commit();
      },
      onPointerCancel: () => {
        startRef.current = null;
        draggingRef.current = false;
        dragIdRef.current = null;
        setDraggingId(null);
      },
      onKeyDown: (event) => {
        if (!enabled) return;
        const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        if (!delta) return;
        event.preventDefault();
        moveTo(index, index + delta);
        // Teclado grava imediatamente: cada seta é uma decisão do usuário.
        setTimeout(commit, 0);
      },
    }),
    [enabled, draggingId, moveTo, commit],
  );

  return { ordered, draggingId, getItemProps, moveTo, commit };
}
