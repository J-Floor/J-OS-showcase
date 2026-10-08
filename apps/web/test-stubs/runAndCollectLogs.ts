import type { convexTest } from "convex-test";
import { vi } from "vitest";

// Runs `action`, then drives every function it scheduled (and anything those
// schedule in turn) to completion, and returns the console.log lines they
// produced. There is no RESEND_API_KEY in tests, so notification emails fall
// back to a console.log.
//
// Not `t.finishAllScheduledFunctions`: it gives each scheduled function a fixed
// budget of 10,000 event-loop ticks, and loading the function's module (a
// dynamic import vite transforms on first use) can outlast that on a busy CI
// runner. Awaiting the in-flight functions has no such budget.
export async function runAndCollectLogs(
	t: ReturnType<typeof convexTest>,
	action: () => Promise<unknown>
): Promise<string[]> {
	vi.useFakeTimers();
	const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	try {
		await action();
		do {
			vi.runAllTimers();
			await t.finishInProgressScheduledFunctions();
		} while (vi.getTimerCount() > 0);
		return logSpy.mock.calls.map((c) => c.map((a) => String(a)).join(" "));
	} finally {
		logSpy.mockRestore();
		vi.useRealTimers();
	}
}
