import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { NotificationExperienceProvider } from "@/components/notifications/NotificationExperienceProvider";

export const Route = createFileRoute("/_app")({
  component: () => (
    <NotificationExperienceProvider>
      <AppShell />
    </NotificationExperienceProvider>
  ),
});
