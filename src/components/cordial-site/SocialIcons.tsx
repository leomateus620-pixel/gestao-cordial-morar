import type { SVGProps } from "react";

export function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
      {...props}
    >
      <path d="M20.5 11.7a8.5 8.5 0 0 1-12.7 7.4L3 20.5l1.4-4.6a8.5 8.5 0 1 1 16.1-4.2Z" />
      <path d="M8.2 7.7c-.6.2-.9.8-.8 1.5.3 3 3 5.8 6 6.5.8.2 1.9-.3 2.3-1 .1-.3.1-.6-.2-.8l-1.9-.9c-.2-.1-.4 0-.5.1l-.7.8c-1.6-.6-2.9-1.8-3.5-3.3l.7-.8c.2-.2.2-.4.1-.6L8.9 8c-.2-.3-.4-.4-.7-.3Z" />
    </svg>
  );
}
export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r=".9" fill="currentColor" stroke="none" />
    </svg>
  );
}
