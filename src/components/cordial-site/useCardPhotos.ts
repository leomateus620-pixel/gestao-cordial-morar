import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PublicMedia, PublicProperty } from "@/lib/cordial-site/contract";
import type { SiteBrand } from "@/lib/cordial-site/brand";
import { requestCardGallery } from "@/lib/cordial-site/card-gallery";
import {
  DEFAULT_CARD_SIZES,
  preloadCardImage,
  takeSpeculativeSlot,
} from "@/lib/cordial-site/card-photo-preload";

export type GalleryState = "idle" | "loading" | "ready" | "error";

/**
 * Shared in-card photo navigation: gallery fetched on intent, the next photo is decoded before
 * it replaces the current one, and stale responses (fast clicks, card changes) are ignored.
 */
export function useCardPhotos(
  p: PublicProperty,
  brand: SiteBrand,
  rootRef: RefObject<HTMLElement | null>,
  sizes = DEFAULT_CARD_SIZES,
) {
  const [images, setImages] = useState<PublicMedia[]>(p.cover ? [p.cover] : []);
  const [index, setIndex] = useState(0);
  const [galleryState, setGalleryState] = useState<GalleryState>("idle");
  const [switching, setSwitching] = useState(false);
  const [failed, setFailed] = useState(false);
  const galleryKey = `${brand}:${p.id}:${p.cover?.id ?? "no-cover"}:${p.cover?.version ?? ""}`;
  const keyRef = useRef(galleryKey);
  keyRef.current = galleryKey;
  const photosRef = useRef<PublicMedia[] | null>(null);
  const request = useRef<{ key: string; promise: Promise<PublicMedia[]> } | null>(null);
  const generation = useRef(0);
  const indexRef = useRef(0);
  indexRef.current = index;
  const alive = useRef(true);
  const enabled = p.photoCount > 1;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    photosRef.current = null;
    request.current = null;
    generation.current++;
    setImages(p.cover ? [p.cover] : []);
    setIndex(0);
    setGalleryState("idle");
    setSwitching(false);
    setFailed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryKey]);

  const ensurePhotos = useCallback(async (): Promise<PublicMedia[]> => {
    if (photosRef.current) return photosRef.current;
    if (request.current?.key === galleryKey) return request.current.promise;
    const captured = galleryKey;
    setGalleryState("loading");
    const promise = requestCardGallery(p.id, brand).then(
      (photos) => {
        if (alive.current && keyRef.current === captured) {
          photosRef.current = photos;
          setImages(photos);
          setGalleryState("ready");
        }
        return photos;
      },
      (error) => {
        if (alive.current && keyRef.current === captured) setGalleryState("error");
        if (request.current?.key === captured) request.current = null;
        throw error;
      },
    );
    request.current = { key: captured, promise };
    return promise;
  }, [brand, p.id, galleryKey]);

  /** Fetch the list and decode the neighbour; urgent work jumps the queue. */
  const prepare = useCallback(
    (urgent = false, from = indexRef.current) => {
      if (!enabled) return;
      ensurePhotos()
        .then((photos) => {
          const next = photos[(from + 1) % photos.length];
          if (next && photos.length > 1) return preloadCardImage(next, brand, sizes, urgent);
        })
        .catch(() => {});
    },
    [enabled, ensurePhotos, brand, sizes],
  );

  const move = useCallback(
    async (delta: number) => {
      if (!enabled) return;
      const gen = ++generation.current;
      const captured = keyRef.current;
      setSwitching(true);
      setFailed(false);
      try {
        const photos = await ensurePhotos();
        if (gen !== generation.current || keyRef.current !== captured || !photos.length) return;
        const target = (indexRef.current + delta + photos.length) % photos.length;
        await preloadCardImage(photos[target], brand, sizes, true);
        if (!alive.current || gen !== generation.current || keyRef.current !== captured) return;
        indexRef.current = target;
        setIndex(target);
        setSwitching(false);
        const after = photos[(target + delta + photos.length) % photos.length];
        if (after) void preloadCardImage(after, brand, sizes).catch(() => {});
      } catch {
        if (alive.current && gen === generation.current) {
          setSwitching(false);
          setFailed(true);
        }
      }
    },
    [enabled, ensurePhotos, brand, sizes],
  );

  // Touch-only devices: after the page settles, prepare the first neighbour of a few visible cards.
  useEffect(() => {
    const el = rootRef.current;
    if (!enabled || !el || !matchMedia("(hover: none)").matches) return;
    let observer: IntersectionObserver | null = null;
    let idle = 0;
    const arm = () => {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer?.disconnect();
            if (takeSpeculativeSlot()) prepare(false);
          }
        },
        { threshold: 0.6 },
      );
      observer.observe(el);
    };
    const start = () => {
      idle = window.setTimeout(arm, 1200);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      clearTimeout(idle);
      observer?.disconnect();
    };
  }, [enabled, rootRef, prepare, galleryKey]);

  // Swipe: horizontal gesture changes the photo, vertical scroll stays native (touch-action: pan-y).
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const swipeHandlers = enabled
    ? {
        style: { touchAction: "pan-y" as const },
        onPointerDown: (e: React.PointerEvent) => {
          if (e.pointerType !== "touch") return;
          if (e.target instanceof Element && e.target.closest("button")) return;
          touch.current = { x: e.clientX, y: e.clientY };
          swiped.current = false;
          prepare(true);
        },
        onPointerUp: (e: React.PointerEvent) => {
          const start = touch.current;
          touch.current = null;
          if (
            start &&
            Math.abs(e.clientX - start.x) > 45 &&
            Math.abs(e.clientX - start.x) > Math.abs(e.clientY - start.y) * 1.4
          ) {
            swiped.current = true;
            void move(e.clientX < start.x ? 1 : -1);
          }
        },
        onPointerCancel: () => {
          touch.current = null;
        },
        onPointerEnter: (e: React.PointerEvent) => {
          if (e.pointerType === "mouse") prepare(true);
        },
        onClickCapture: (e: React.MouseEvent) => {
          if (swiped.current) {
            if (e.detail !== 0) {
              e.preventDefault();
              e.stopPropagation();
            }
            swiped.current = false;
          }
        },
      }
    : {};

  return {
    images,
    index,
    media: images[index] ?? p.cover,
    galleryState,
    switching,
    failed,
    enabled,
    ensurePhotos,
    prepare,
    move,
    swipeHandlers,
  };
}
