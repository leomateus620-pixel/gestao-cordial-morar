import type { PropertyImageProcessingStatus } from "@/types/property";

export const IMAGE_PROCESSING_BLOCKING_STATUSES: readonly PropertyImageProcessingStatus[] = [
  "pending",
  "processing",
  "failed_retryable",
  "failed_permanent",
  "failed",
];

export function isImageProcessingBlocking(status: string | null | undefined): boolean {
  return IMAGE_PROCESSING_BLOCKING_STATUSES.includes(status as PropertyImageProcessingStatus);
}

export function canPublishPropertyImage(image: {
  processing_status: string | null;
  processed_storage_path: string | null;
}): boolean {
  return image.processing_status === "legacy" ||
    (image.processing_status === "ready" && Boolean(image.processed_storage_path));
}