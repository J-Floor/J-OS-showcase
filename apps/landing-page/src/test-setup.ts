// Shared Vitest setup for the landing-page app (wired via vite.config `test.setupFiles`).
// 1. Registers @testing-library/jest-dom matchers (toBeInTheDocument,
//    toHaveAttribute, …) on Vitest's `expect`, and their TypeScript types.
// 2. Unmounts every rendered Solid component after each test, so a file with
//    multiple render() calls does not leak duplicate DOM nodes into the next.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@solidjs/testing-library";
import { afterEach } from "vitest";

afterEach(() => {
	cleanup();
});
