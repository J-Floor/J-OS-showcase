// The server build of solid-js/web, imported directly by csp.test.ts so the
// test runs the same generateHydrationScript the prerender does.
declare module "solid-js/web/dist/server.js" {
	export { generateHydrationScript } from "solid-js/web";
}
