import { createFileRoute, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { NotificationExperienceProvider } from "@/components/notifications/NotificationExperienceProvider";
import { SystemUnavailable } from "@/components/shared/SystemUnavailable";

function AppError({ reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <SystemUnavailable
      onRetry={() => {
        void router.invalidate();
        reset();
      }}
    />
  );
}

export const Route = createFileRoute("/_app")({
  component: () => (
    <NotificationExperienceProvider>
      <AppShell />
    </NotificationExperienceProvider>
  ),
  errorComponent: AppError,
});
