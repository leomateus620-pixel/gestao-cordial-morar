import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PublicMedia, PublicProperty } from "@/lib/cordial-site/contract";
import type { SiteBrand } from "@/lib/cordial-site/brand";
import {
  requestCardGallery,
  SpeculativeDropped,
  type CardGalleryHint,
} from "@/lib/cordial-site/card-gallery";
import {
  DEFAULT_CARD_SIZES,
  PreloadDropped,
  canSpeculatePhotos,
  preloadCardImage,
  takeSpeculativeSlot,
} from "@/lib/cordial-site/card-photo-preload";

export type GalleryState = "idle" | "loading" | "ready" | "error";
const dropped = (e: unknown) => e instanceof SpeculativeDropped || e instanceof PreloadDropped;
const wrapPhoto = (index: number, length: number) => ((index % length) + length) % length;

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
  galleryHint?: Promise<CardGalleryHint | null>,
  featured = false,
  featuredReady = false,
) {
  const enabled = p.photoCount > 1;
  const measured = useMeasuredSizes(rootRef, enabled && !sizesOption);
  const sizes = sizesOption ?? measured ?? DEFAULT_CARD_SIZES;
  const sizePolicy = useRef({ sizes, cover: sizesOption ?? DEFAULT_CARD_SIZES });
  sizePolicy.current = { sizes, cover: sizesOption ?? DEFAULT_CARD_SIZES };
  const [images, setImages] = useState<PublicMedia[]>(p.cover ? [p.cover] : []);
  const [index, setIndex] = useState(0);
  const [galleryState, setGalleryState] = useState<GalleryState>("idle");
  const [switching, setSwitching] = useState(false);
  const [failed, setFailed] = useState(false);
  const galleryKey = `${brand}:${p.id}:${p.cover?.id ?? "no-cover"}:${p.cover?.version ?? ""}:${p.cover?.enhancement ?? ""}:${p.photoCount}`;
  const keyRef = useRef(galleryKey);
  keyRef.current = galleryKey;
  const [displayKey, setDisplayKey] = useState(galleryKey);
  const photosRef = useRef<PublicMedia[] | null>(null);
  const request = useRef<{ key: string; promise: Promise<PublicMedia[]> } | null>(null);
  const generation = useRef(0);
  const sizeFor = useCallback(
    (i: number) => (i === 0 ? sizePolicy.current.cover : sizePolicy.current.sizes),
    [],
  );
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
    setDisplayKey(galleryKey);
    setImages(p.cover ? [p.cover] : []);
    setIndex(0);
    setGalleryState("idle");
    setSwitching(false);
    setFailed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryKey]);

  const acceptGallery = useCallback(
    (list: PublicMedia[], cover: PublicMedia | null) => {
      const photos = cover ? [cover, ...list.filter((photo) => photo.id !== cover.id)] : list;
      if (alive.current && keyRef.current === galleryKey) {
        photosRef.current = photos;
        setImages(photos);
        setGalleryState("ready");
      }
      return photos;
    },
    [galleryKey],
  );

  const cover = p.cover;
  const matchingHint = useCallback(
    (hint: CardGalleryHint | null) =>
      hint?.propertyId === p.id &&
      cover &&
      (hint.coverRevision === `${cover.id}:${cover.version}:${cover.enhancement ?? ""}` ||
        (!cover.enhancement && hint.coverRevision === `${cover.id}:${cover.version}`)) &&
      hint.items.some(
        (photo) =>
          photo.id === cover.id &&
          photo.version === cover.version &&
          photo.enhancement === cover.enhancement,
      )
        ? hint.items
        : null,
    [p.id, cover],
  );
  useEffect(() => {
    if (!galleryHint || !cover || !canSpeculatePhotos()) return;
    let current = true;
    void galleryHint
      .then((hint) => {
        if (current && !request.current && !photosRef.current && matchingHint(hint))
          acceptGallery(matchingHint(hint)!, cover);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [acceptGallery, cover, galleryHint, matchingHint]);

  const ensurePhotos = useCallback(
    async (urgent = true): Promise<PublicMedia[]> => {
      if (photosRef.current) return photosRef.current;
      if (request.current?.key === galleryKey) {
        if (urgent) {
          setGalleryState("loading");
          if (!featured || !galleryHint)
            void requestCardGallery(p.id, brand, true, galleryKey).catch(() => {}); // promote
        }
        return request.current.promise;
      }
      const captured = galleryKey;
      if (urgent) setGalleryState("loading");
      const metadata =
        featured && galleryHint
          ? galleryHint
              .catch(() => null)
              .then(
                (hint) => matchingHint(hint) ?? requestCardGallery(p.id, brand, urgent, galleryKey),
              )
          : requestCardGallery(p.id, brand, urgent, galleryKey);
      const promise = metadata.then(
        (list) => acceptGallery(list, cover),
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
    [acceptGallery, brand, cover, p.id, galleryKey, featured, galleryHint, matchingHint],
  );

  const warmWindow = useCallback(
    (photos: PublicMedia[], at: number, direction: -1 | 1) => {
      if (!featured || !canSpeculatePhotos()) return;
      // Five ahead plus the reverse neighbour cover repeated clicks and direction changes.
      // The active card's window passes idle work for the other featured cards.
      const targets = new Set(
        [direction, direction * 2, direction * 3, direction * 4, direction * 5, -direction].map(
          (offset) => wrapPhoto(at + offset, photos.length),
        ),
      );
      targets.delete(at);
      for (const target of targets)
        void preloadCardImage(
          photos[target],
          brand,
          sizeFor(target),
          false,
          "card",
          "intent",
        ).catch(() => {});
    },
    [featured, brand, sizeFor],
  );

  /** Fetch the list and decode the neighbour in the given direction. */
  const prepare = useCallback(
    (direction: -1 | 1) => {
      if (!enabled || !canSpeculatePhotos()) return;
      ensurePhotos(false)
        .then((photos) => {
          if (
            !alive.current ||
            keyRef.current !== galleryKey ||
            photos.length < 2 ||
            !canSpeculatePhotos() ||
            requested.current !== shown.current
          )
            return;
          const at = wrapPhoto(shown.current + direction, photos.length);
          if (featured) {
            warmWindow(photos, shown.current, direction);
            return;
          }
          return preloadCardImage(photos[at], brand, sizeFor(at));
        })
        .catch(() => {});
    },
    [enabled, ensurePhotos, brand, galleryKey, sizeFor, featured, warmWindow],
  );

  const move = useCallback(
    async (delta: number) => {
      if (!enabled) return;
      const gen = ++generation.current;
      requested.current += delta;
      setSwitching(true);
      setFailed(false);
      try {
        const photos = await ensurePhotos(true);
        if (!alive.current || gen !== generation.current || keyRef.current !== galleryKey) return;
        if (photos.length < 2) {
          // The published count and its gallery can change between requests.
          photosRef.current = null;
          request.current = null;
          throw new Error("Outras fotos não estão disponíveis.");
        }
        // Count every click, including the clicks that arrived before we knew the list length.
        const target = wrapPhoto(requested.current, photos.length);
        requested.current = target;
        if (target !== shown.current) {
          const photoSizes = sizeFor(target);
          const decoded = preloadCardImage(photos[target], brand, photoSizes, true);
          // Begin the following images while the requested one is in flight.
          warmWindow(photos, target, delta < 0 ? -1 : 1);
          await decoded;
          if (!alive.current || gen !== generation.current || keyRef.current !== galleryKey) return;
          // A layout change during decode may select another responsive candidate.
          if (photoSizes !== sizeFor(target)) {
            await preloadCardImage(photos[target], brand, sizeFor(target), true);
          }
        }
        if (!alive.current || gen !== generation.current || keyRef.current !== galleryKey) return;
        shown.current = target;
        setIndex(target);
        setSwitching(false);
        prepare(delta < 0 ? -1 : 1);
      } catch {
        if (alive.current && gen === generation.current && keyRef.current === galleryKey) {
          requested.current = shown.current; // keep the photo on screen, arrow retries
          setSwitching(false);
          setFailed(true);
        }
      }
    },
    [enabled, ensurePhotos, brand, galleryKey, prepare, sizeFor, warmWindow],
  );

  // The five home highlights have their own budget. Start only after the opening
  // hero has settled, including offscreen cards, so scrolling doesn't start a cold gallery.
  useEffect(() => {
    if (!featured || !featuredReady || !enabled) return;
    let cancelled = false;
    const warm = async () => {
      if (!canSpeculatePhotos()) return;
      try {
        const photos = await ensurePhotos(false);
        if (photos.length < 2) return;
        const warmed = new Set<number>([shown.current]);
        for (const offset of [1, 2, 3, 4, 5, -1]) {
          if (cancelled || keyRef.current !== galleryKey || !canSpeculatePhotos()) return;
          const target = wrapPhoto(shown.current + offset, photos.length);
          if (!warmed.has(target)) {
            warmed.add(target);
            await preloadCardImage(
              photos[target],
              brand,
              sizeFor(target),
              false,
              "card",
              "featured",
            );
          }
        }
      } catch {
        /* Navigation retries a failed speculative read/download. */
      }
    };
    void warm();
    document.addEventListener("visibilitychange", warm);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", warm);
    };
  }, [featured, featuredReady, enabled, ensurePhotos, galleryKey, brand, sizeFor, sizes]);

  // Start metadata for a few visible cards while their covers load. Only download a
  // neighbour once the cover is ready, so it doesn't compete with the first paint.
  useEffect(() => {
    const el = rootRef.current;
    if (featured || !enabled || !el || typeof IntersectionObserver === "undefined") return;
    let selected = false;
    let visible = false;
    const warm = () => {
      const img = el.querySelector("img");
      if (!selected || !visible || !img?.complete || !img.naturalWidth) return;
      prepare(1);
      el.removeEventListener("load", warm, true);
      observer.disconnect();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5);
        if (visible && !selected) {
          if (!takeSpeculativeSlot()) {
            observer.disconnect();
            return;
          }
          selected = true;
          if (galleryHint) {
            // A single lead card can prepare its adjacent image while the cover downloads.
            void galleryHint
              .finally(() => {
                if (visible && el.isConnected && keyRef.current === galleryKey) prepare(1);
              })
              .catch(() => {});
            observer.disconnect();
            el.removeEventListener("load", warm, true);
            return;
          }
          void ensurePhotos(false).catch(() => {});
        }
        warm();
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    el.addEventListener("load", warm, true);
    return () => {
      visible = false;
      observer.disconnect();
      el.removeEventListener("load", warm, true);
    };
  }, [enabled, rootRef, ensurePhotos, prepare, galleryKey, galleryHint, featured]);

  // Swipe: horizontal gesture changes the photo, vertical scroll stays native (touch-action: pan-y).
  const touch = useRef<{ x: number; y: number; direction?: -1 | 1 } | null>(null);
  const swiped = useRef(false);
  const swipeHandlers = enabled
    ? {
        style: { touchAction: "pan-y" as const },
        onPointerDown: (e: React.PointerEvent) => {
          if (e.pointerType !== "touch") return;
          if (e.target instanceof Element && e.target.closest("button")) return;
          touch.current = { x: e.clientX, y: e.clientY };
          swiped.current = false;
        },
        onPointerMove: (e: React.PointerEvent) => {
          const start = touch.current;
          if (!start || start.direction) return;
          const dx = e.clientX - start.x;
          if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(e.clientY - start.y) * 1.4) {
            start.direction = dx < 0 ? 1 : -1;
            prepare(start.direction);
          }
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
          swiped.current = false;
        },
        onClickCapture: (e: React.MouseEvent) => {
          if (swiped.current) {
            const onButton = e.target instanceof Element && e.target.closest("button");
            if (e.detail !== 0 && !onButton) {
              e.preventDefault();
              e.stopPropagation();
            }
            swiped.current = false;
          }
        },
      }
    : {};

  return {
    images: displayKey === galleryKey ? images : p.cover ? [p.cover] : [],
    index: displayKey === galleryKey ? index : 0,
    media: (displayKey === galleryKey ? images[index] : null) ?? p.cover,
    // Cover keeps the default policy (already downloaded); other photos use the measured width,
    // the same string used to preload them, so the browser reuses the download.
    imageSizes: sizeFor(displayKey === galleryKey ? index : 0),
    galleryState: displayKey === galleryKey ? galleryState : "idle",
    switching: displayKey === galleryKey && switching,
    failed: displayKey === galleryKey && failed,
    enabled,
    ensurePhotos,
    prepare,
    move,
    swipeHandlers,
  };
}
