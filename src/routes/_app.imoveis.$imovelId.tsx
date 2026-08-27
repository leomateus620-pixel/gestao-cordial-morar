import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/imoveis/$imovelId")({
  component: () => <Outlet />,
});
