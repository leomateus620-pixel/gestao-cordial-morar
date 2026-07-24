import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/clientes/$clienteId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/atendimentos",
      search: { id: undefined, clienteId: params.clienteId },
    });
  },
  component: () => null,
});
