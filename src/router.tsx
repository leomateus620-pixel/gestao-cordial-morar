import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { rewritePublicInput, rewritePublicOutput } from "./lib/cordial-site/routing";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    rewrite: {
      input: ({ url }) => rewritePublicInput(url),
      output: ({ url }) => rewritePublicOutput(url),
    },
  });

  return router;
};
