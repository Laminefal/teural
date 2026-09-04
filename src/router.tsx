import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Offline-first: toutes les lectures/écritures passent par IndexedDB, donc
  // React Query ne doit jamais mettre en pause une requête ou une mutation
  // lorsque le navigateur est hors ligne (comportement par défaut en v5).
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { networkMode: "always", retry: 0 },
      mutations: { networkMode: "always", retry: 0 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
