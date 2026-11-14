import { useCallback, useEffect, useRef, useState } from "react";
import type { SiteBrand } from "@/lib/cordial-site/brand";
import type { PublicMedia } from "@/lib/cordial-site/contract";
import { canSpeculatePhotos, preloadCardImage } from "@/lib/cordial-site/card-photo-preload";

type GallerySize = "card" | "full";
type PendingPhoto = { index: number; status: "loading" | "failed" };

const photoKey = (photo: PublicMedia | undefined) => (photo ? `${photo.id}:${photo.version}` : "");
const clampIndex = (index: number, length: number) => Math.max(0, Math.min(index, length - 1));
const wrapIndex = (index: number, length: number) => ((index % length) + length) % length;

export function useGalleryPhotos({
  images,
  brand,
  sizes,
  size,
  active = true,
  initialIndex = 0,
}: {
  images: PublicMedia[];
  brand: SiteBrand;
  sizes: string;
  size: GallerySize;
  active?: boolean;
  initialIndex?: number;
}) {
  const [selection, setSelection] = useState(initialIndex);
  const [readyKey, setReadyKey] = useState("");
  const [pending, setPending] = useState<PendingPhoto | null>(null);
  const selected = useRef(initialIndex);
  const intent = useRef<number | null>(null);
  const generation = useRef(0);
  const index = clampIndex(selection, images.length);
  const current = images[index];
  const variant = `${brand}:${size}:${sizes}`;
  const currentKey = current ? `${variant}:${photoKey(current)}` : "";
  const latest = useRef({ active, images, variant, brand, sizes, size });
  latest.current = { active, images, variant, brand, sizes, size };
  const invalidate = useCallback(() => {
    generation.current++;
    intent.current = null;
  }, []);

  // A surface change or closing the dialog invalidates outstanding navigation.
  useEffect(() => {
    setPending(null);
    return invalidate;
  }, [active, images, invalidate, variant]);

  const selectImmediately = useCallback(
    (target: number) => {
      invalidate();
      selected.current = target;
      setPending(null);
      setSelection(target);
    },
    [invalidate],
  );

  const goTo = useCallback(
    async (target: number) => {
      const { active, images, variant, brand, sizes, size } = latest.current;
      const next = images[target];
      if (!active || !next) return;
      const request = ++generation.current;
      intent.current = target;
      if (target === clampIndex(selected.current, images.length)) {
        intent.current = null;
        setPending(null);
        return;
      }
      setPending(null);
      const isCurrent = () =>
        generation.current === request &&
        latest.current.active &&
        latest.current.variant === variant &&
        photoKey(latest.current.images[target]) === photoKey(next);
      const showLoading = window.setTimeout(() => {
        if (isCurrent()) setPending({ index: target, status: "loading" });
      }, 150);
      try {
        await preloadCardImage(next, brand, sizes, true, size);
        if (!isCurrent()) return;
        selectImmediately(target);
      } catch {
        if (!isCurrent()) return;
        intent.current = null;
        setPending({ index: target, status: "failed" });
      } finally {
        window.clearTimeout(showLoading);
      }
    },
    [selectImmediately],
  );

  const move = (direction: number) => {
    if (images.length < 2) return;
    const from = clampIndex(intent.current ?? selected.current, images.length);
    void goTo(wrapIndex(from + direction, images.length));
  };

  const isReady = Boolean(currentKey && readyKey === currentKey);
  useEffect(() => {
    if (!active || !isReady || images.length < 2 || !canSpeculatePhotos()) return;
    const next = wrapIndex(index + 1, images.length);
    const previous = wrapIndex(index - 1, images.length);
    let current = true;
    const warm = async () => {
      await preloadCardImage(images[next], brand, sizes, false, size).catch(() => {});
      if (current && intent.current === null && previous !== next && canSpeculatePhotos())
        await preloadCardImage(images[previous], brand, sizes, false, size).catch(() => {});
    };
    void warm();
    return () => {
      current = false;
    };
  }, [active, brand, images, index, isReady, size, sizes]);

  return {
    index,
    current,
    pending,
    move,
    goTo,
    selectImmediately,
    onImageReady: () => setReadyKey(currentKey),
    retry: () => {
      if (pending?.status === "failed") void goTo(pending.index);
    },
  };
}
