// @vitest-environment happy-dom
import { createRoot } from "solid-js";
import { expect, it, vi } from "vitest";

const setAuth = vi.fn();
const sessionStore = vi.hoisted(() => {
	const holder: { set: (data: unknown) => void } = { set: () => {} };
	return holder;
});

vi.mock("convex/browser", () => ({
	ConvexClient: class {
		setAuth = setAuth;
	},
}));

vi.mock("./auth.ts", async () => {
	const { createStore: create, reconcile: rec } =
		await import("solid-js/store");
	const [state, setState] = create<{ value: { data: unknown } }>({
		value: { data: null },
	});
	function readSession() {
		return state.value;
	}
	sessionStore.set = (data) => {
		setState("value", rec({ data }));
	};
	return {
		authClient: {
			// better-auth's Solid store: same object identity, fields reconciled in place.
			useSession: () => readSession,
			oneTimeToken: { verify: vi.fn() },
			convex: { token: vi.fn() },
		},
	};
});

const { bindConvexAuth } = await import("./convex.ts");

it("rebinds Convex auth when the session changes in place", () => {
	const dispose = createRoot((disposeRoot) => {
		bindConvexAuth();
		return disposeRoot;
	});
	expect(setAuth).toHaveBeenCalledTimes(1);
	sessionStore.set({ user: { id: "u1" } });
	expect(setAuth).toHaveBeenCalledTimes(2);
	sessionStore.set(null);
	expect(setAuth).toHaveBeenCalledTimes(3);
	dispose();
});
