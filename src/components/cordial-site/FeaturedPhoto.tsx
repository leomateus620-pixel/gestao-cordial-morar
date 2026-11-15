import { useEffect, useState } from "react";
import type { PublicMedia } from "@/lib/cordial-site/contract";
import { PropertyImage } from "./PropertyCard";

type Frame = { media: PublicMedia | null; sizes: string };
const identity = ({ media, sizes }: Frame) =>
  `${media?.id}:${media?.version}:${media?.enhancement ?? ""}:${sizes}`;

/** Keep the outgoing pixels until the decoded replacement has actually loaded in the DOM. */
export function FeaturedPhoto({
  media,
  sizes,
  alt,
  fetchPriority,
}: Frame & {
  alt: string;
  fetchPriority: "auto" | "low";
}) {
  const next = { media, sizes };
  const [frame, setFrame] = useState<{
    current: Frame;
    previous: Frame | null;
    ready: boolean;
    previousReady: boolean;
  }>({
    current: next,
    previous: null,
    ready: false,
    previousReady: false,
  });
  const key = identity(next);
  if (identity(frame.current) !== key) {
    setFrame({
      current: next,
      previous: frame.current,
      ready: Boolean(frame.previous && identity(frame.previous) === key && frame.previousReady),
      previousReady: frame.ready,
    });
  }
  useEffect(() => {
    if (!frame.ready || !frame.previous) return;
    const timer = window.setTimeout(
      () =>
        setFrame((value) =>
          identity(value.current) === key ? { ...value, previous: null } : value,
        ),
      150,
    );
    return () => window.clearTimeout(timer);
  }, [frame.ready, frame.previous, key]);
  return (
    <>
      {[frame.current, ...(frame.previous ? [frame.previous] : [])].map((photo, i) => (
        <span
          key={identity(photo)}
          aria-hidden={i === 1 ? true : undefined}
          className={`cs-featured-photo-layer ${i === 1 ? `cs-featured-photo-outgoing ${frame.ready ? "is-releasing" : ""}` : ""}`}
        >
          <PropertyImage
            media={photo.media}
            sizes={photo.sizes}
            alt={i === 0 ? alt : ""}
            priority={Boolean(frame.previous)}
            fetchPriority={fetchPriority}
            className={i === 0 ? "cs-featured-photo-current" : ""}
            onImageReady={() =>
              setFrame((value) => {
                const loaded = identity(photo);
                if (identity(value.current) === loaded && !value.ready)
                  return { ...value, ready: true };
                if (value.previous && identity(value.previous) === loaded && !value.previousReady)
                  return { ...value, previousReady: true };
                return value;
              })
            }
          />
        </span>
      ))}
    </>
  );
}
