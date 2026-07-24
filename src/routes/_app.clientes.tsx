import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/clientes")({
  beforeLoad: () => {
    throw redirect({ to: "/atendimentos" });
  },
  component: () => null,
});
