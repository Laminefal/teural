// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        devOptions: { enabled: false },
        manifest: {
          name: "Teural — Gestion de boutique",
          short_name: "Teural",
          description: "Gérez votre boutique: stock, ventes, dépenses, dettes — même hors ligne.",
          lang: "fr",
          start_url: "/dashboard",
          scope: "/",
          display: "standalone",
          background_color: "#0b1220",
          theme_color: "#047857",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          navigateFallback: "/dashboard",
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//, /^\/_serverFn\//],
          runtimeCaching: [
            {
              urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "teural-pages",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 30 },
              },
            },
            {
              urlPattern: ({ url, request }: { url: URL; request: Request }) =>
                url.origin === self.location.origin && request.destination !== "document" &&
                /\.(?:js|css|woff2|png|svg|ico)$/.test(url.pathname),
              handler: "CacheFirst",
              options: {
                cacheName: "teural-assets",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
              handler: "CacheFirst",
              options: { cacheName: "teural-fonts", expiration: { maxEntries: 30 } },
            },
          ],
        },
      }),
    ],
  },
});
