import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PublicMedia, PublicProperty } from "@/lib/cordial-site/contract";
import type { SiteBrand } from "@/lib/cordial-site/brand";
import { requestCardGallery, SpeculativeDropped } from "@/lib/cordial-site/card-gallery";
import {
  DEFAULT_CARD_SIZES,
  PreloadDropped,
  preloadCardImage,
  preloadIdle,
  takeSpeculativeSlot,
} from "@/lib/cordial-site/card-photo-preload";

export type GalleryState = "idle" | "loading" | "ready" | "error";
const dropped = (e: unknown) => e instanceof SpeculativeDropped || e instanceof PreloadDropped;

/** Real rendered width of the photo box, so cards pick thumb/card instead of oversized files. */
function useMeasuredSizes(rootRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const [sizes, setSizes] = useState<string | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!enabled || !el || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      // Bucket to 40px so small layout shifts do not change the candidate.
      if (w > 0) setSizes(`${Math.ceil(w / 40) * 40}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rootRef, enabled]);
  return sizes;
}

/**
 * Shared in-card photo navigation: the displayed photo is separate from the requested one;
 * the next photo is decoded before it replaces the current one (photo + counter together),
 * the latest intent wins and stale responses (fast clicks, new search, card change) are ignored.
 */
export function useCardPhotos(
  p: PublicProperty,
  brand: SiteBrand,
  rootRef: RefObject<HTMLElement | null>,
  sizesOption?: string,
) {
  const enabled = p.photoCount > 1;
  const measured = useMeasuredSizes(rootRef, enabled && !sizesOption);
  const sizes = sizesOption ?? measured ?? DEFAULT_CARD_SIZES;
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;
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
  const shown = useRef(0);
  const requested = useRef(0);
  const alive = useRef(true);

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
    shown.current = requested.current = 0;
    setImages(p.cover ? [p.cover] : []);
    setIndex(0);
    setGalleryState("idle");
    setSwitching(false);
    setFailed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryKey]);

  const ensurePhotos = useCallback(
    async (urgent = true): Promise<PublicMedia[]> => {
      if (photosRef.current) return photosRef.current;
      if (request.current?.key === galleryKey) {
        if (urgent) void requestCardGallery(p.id, brand, true).catch(() => {}); // promote
        return request.current.promise;
      }
      const captured = galleryKey;
      if (urgent) setGalleryState("loading");
      const promise = requestCardGallery(p.id, brand, urgent).then(
        (photos) => {
          if (alive.current && keyRef.current === captured) {
            photosRef.current = photos;
            setImages(photos);
            setGalleryState("ready");
          }
          return photos;
        },
        (error) => {
          if (request.current?.key === captured) request.current = null;
          if (alive.current && keyRef.current === captured && !dropped(error))
            setGalleryState("error");
          throw error;
        },
      );
      request.current = { key: captured, promise };
      return promise;
    },
    [brand, p.id, galleryKey],
  );

  /** Fetch the list and decode the neighbour in the given direction. */
  const prepare = useCallback(
    (urgent = false, direction = 1) => {
      if (!enabled) return;
      ensurePhotos(urgent)
        .then((photos) => {
          if (photos.length < 2) return;
          const at = (requested.current + direction + photos.length) % photos.length;
          return preloadCardImage(photos[at], brand, sizesRef.current, urgent);
        })
        .catch(() => {});
    },
    [enabled, ensurePhotos, brand],
  );

  const move = useCallback(
    async (delta: number) => {
      if (!enabled) return;
      const gen = ++generation.current;
      const captured = keyRef.current;
      setSwitching(true);
      setFailed(false);
      try {
        const photos = await ensurePhotos(true);
        if (gen !== generation.current || keyRef.current !== captured || !photos.length) return;
        // Latest intent wins: count from the last requested photo, not the one on screen.
        const target = (requested.current + delta + photos.length) % photos.length;
        requested.current = target;
        await preloadCardImage(photos[target], brand, sizesRef.current, true);
        if (!alive.current || gen !== generation.current || keyRef.current !== captured) return;
        shown.current = target;
        setIndex(target);
        setSwitching(false);
        const ahead = photos[(target + delta + photos.length) % photos.length];
        if (ahead) void preloadCardImage(ahead, brand, sizesRef.current).catch(() => {});
        const behind = photos[(target - delta + photos.length) % photos.length];
        if (behind && preloadIdle())
          void preloadCardImage(behind, brand, sizesRef.current).catch(() => {});
      } catch {
        if (alive.current && gen === generation.current) {
          requested.current = shown.current; // keep the photo on screen, arrow retries
          setSwitching(false);
          setFailed(true);
        }
      }
    },
    [enabled, ensurePhotos, brand],
  );

  // Once the card is visible AND its own cover is on screen, prepare the 2nd photo for a
  // small number of cards (budget per results scope). No timers, no hover needed.
  useEffect(() => {
    const el = rootRef.current;
    if (!enabled || !el || typeof IntersectionObserver === "undefined") return;
    let done = false;
    let cleanupImg: (() => void) | null = null;
    const whenCoverReady = (run: () => void) => {
      const img = el.querySelector("img");
      if (!img || (img.complete && img.naturalWidth > 0)) return run();
      const onLoad = () => run();
      img.addEventListener("load", onLoad, { once: true });
      cleanupImg = () => img.removeEventListener("load", onLoad);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (done || !entries.some((e) => e.isIntersecting)) return;
        done = true;
        observer.disconnect();
        whenCoverReady(() => {
          if (alive.current && takeSpeculativeSlot()) prepare(false);
        });
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cleanupImg?.();
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
    // Cover keeps the default policy (already downloaded); other photos use the measured width,
    // the same string used to preload them, so the browser reuses the download.
    imageSizes: index === 0 && !sizesOption ? DEFAULT_CARD_SIZES : sizes,
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
