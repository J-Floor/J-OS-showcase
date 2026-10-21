// @vitest-environment happy-dom
import { createRoot } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";

const { verify } = vi.hoisted(() => ({ verify: vi.fn() }));

vi.mock("convex/browser", () => ({
	ConvexClient: class {
		setAuth = vi.fn();
	},
}));

function noSession() {
	return { data: null };
}

vi.mock("./auth.ts", () => ({
	authClient: {
		useSession: () => noSession,
		crossDomain: { oneTimeToken: { verify } },
		getSession: vi.fn(() => Promise.resolve()),
		updateSession: vi.fn(),
		convex: { token: vi.fn() },
	},
}));

afterEach(() => {
	verify.mockReset();
	vi.resetModules();
	window.history.replaceState({}, "", "/");
});

async function exchange(response: unknown) {
	window.history.replaceState({}, "", "/?ott=abc");
	if (response instanceof Error) verify.mockRejectedValue(response);
	else verify.mockResolvedValue(response);
	const module = await import("./convex.ts");
	const dispose = createRoot((disposeRoot) => {
		module.bindConvexAuth();
		return disposeRoot;
	});
	await vi.waitFor(() => {
		expect(module.ottPending()).toBe(false);
	});
	dispose();
	return module;
}

it("a link better-auth refuses is reported as failed", async () => {
	const module = await exchange({ error: { message: "expired" } });
	expect(module.ottFailed()).toBe(true);
});

it("a link whose exchange fails is reported as failed", async () => {
	const module = await exchange(new Error("offline"));
	expect(module.ottFailed()).toBe(true);
});

it("a link that exchanges is not reported as failed", async () => {
	const module = await exchange({ data: { session: { token: "t" } } });
	expect(module.ottFailed()).toBe(false);
});
