import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { redirectHomeAfterLoad } from "./windowRedirect.ts";

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});
it("leaves only after the page has loaded and the delay has passed", () => {
	const go = vi.fn();
	vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
	redirectHomeAfterLoad(go, 400);
	vi.advanceTimersByTime(1000);
	expect(go).not.toHaveBeenCalled();
	dispatchEvent(new Event("load"));
	vi.advanceTimersByTime(399);
	expect(go).not.toHaveBeenCalled();
	vi.advanceTimersByTime(1);
	expect(go).toHaveBeenCalledOnce();
});
it("redirects after the delay when the page already loaded", () => {
	const go = vi.fn();
	vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
	redirectHomeAfterLoad(go, 400);
	vi.advanceTimersByTime(400);
	expect(go).toHaveBeenCalledOnce();
});
it("cancels when cleaned up", () => {
	const go = vi.fn();
	vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
	redirectHomeAfterLoad(go, 400)();
	vi.advanceTimersByTime(1000);
	expect(go).not.toHaveBeenCalled();
});
