// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { state, mutateAsync, navigate } = vi.hoisted(
	(): {
		state: { person: Record<string, unknown> | undefined };
		mutateAsync: ReturnType<typeof vi.fn>;
		navigate: ReturnType<typeof vi.fn>;
	} => ({
		state: { person: undefined },
		mutateAsync: vi.fn(),
		navigate: vi.fn(),
	})
);

// `onboarding.getState` hands out the person.
vi.mock("convex-solidjs", () => {
	return {
		useQuery: () => ({
			data: () => ({ person: state.person }),
			isLoading: () => false,
			error: () => undefined,
		}),
		useMutation: () => ({
			mutate: mutateAsync,
			mutateAsync,
			isLoading: () => false,
			data: () => undefined,
			error: () => undefined,
			reset: vi.fn(),
		}),
	};
});

vi.mock("@solidjs/router", () => ({ useNavigate: () => navigate }));

import { DoorsIntro } from "./DoorsIntro.tsx";

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

const OPEN_DOOR_MEMBER = { tier: "member", stage: "active", stageSince: 0 };

afterEach(cleanup);
beforeEach(() => {
	state.person = undefined;
	mutateAsync.mockReset();
	mutateAsync.mockResolvedValue(null);
	navigate.mockReset();
});

test("shows an existing member how the doors open, without the Wi-Fi", async () => {
	state.person = { ...OPEN_DOOR_MEMBER };
	render(() => <DoorsIntro />);
	expect(await screen.findByText("Getting in")).toBeInTheDocument();
	expect(screen.getByText("Downstairs")).toBeInTheDocument();
	expect(screen.getByText("Upstairs (4th floor)")).toBeInTheDocument();
	expect(screen.getByText("Doors")).toBeInTheDocument();
	expect(screen.queryByText(/wi-?fi/i)).not.toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Go to Doors" })
	).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
});

test("shows to board, who have no onboarding record", async () => {
	state.person = { tier: "board", stage: "active", stageSince: 0 };
	render(() => <DoorsIntro />);
	expect(await screen.findByText("Getting in")).toBeInTheDocument();
});

test("shows to a guest inside their access window", async () => {
	state.person = {
		tier: "guest",
		stage: "active",
		stageSince: 0,
		accessUntil: Date.now() + 86_400_000,
	};
	render(() => <DoorsIntro />);
	expect(await screen.findByText("Getting in")).toBeInTheDocument();
});

test("never shows to someone the door is closed to", async () => {
	state.person = { ...OPEN_DOOR_MEMBER, door: { override: "force_off" } };
	render(() => <DoorsIntro />);
	await new Promise((r) => setTimeout(r, 0));
	expect(screen.queryByText("Getting in")).toBeNull();
});

test("never shows again once seen", async () => {
	state.person = { ...OPEN_DOOR_MEMBER, doorsIntroSeenAt: 1 };
	render(() => <DoorsIntro />);
	await new Promise((r) => setTimeout(r, 0));
	expect(screen.queryByText("Getting in")).toBeNull();
});

test("Got it marks it seen and closes it", async () => {
	state.person = { ...OPEN_DOOR_MEMBER };
	render(() => <DoorsIntro />);
	fireEvent.click(await screen.findByRole("button", { name: "Got it" }));
	expect(mutateAsync).toHaveBeenCalledWith({});
	await waitFor(() => {
		expect(screen.queryByText("Getting in")).toBeNull();
	});
	expect(navigate).not.toHaveBeenCalled();
});

test("Go to Doors marks it seen and opens Space → Access", async () => {
	state.person = { ...OPEN_DOOR_MEMBER };
	render(() => <DoorsIntro />);
	fireEvent.click(await screen.findByRole("button", { name: "Go to Doors" }));
	expect(mutateAsync).toHaveBeenCalledWith({});
	expect(navigate).toHaveBeenCalledWith("/space?tab=access");
});

test("Escape closes it for this session without marking it seen", async () => {
	state.person = { ...OPEN_DOOR_MEMBER };
	render(() => <DoorsIntro />);
	await screen.findByRole("dialog");
	// zag registers its Escape listener on the document after mount.
	await new Promise((r) => setTimeout(r, 50));
	fireEvent.keyDown(document.activeElement ?? document.body, {
		key: "Escape",
	});
	await waitFor(() => {
		expect(screen.queryByText("Getting in")).toBeNull();
	});
	expect(mutateAsync).not.toHaveBeenCalled();
	expect(navigate).not.toHaveBeenCalled();
});

test("a failed save still closes it and is not an unhandled rejection", async () => {
	mutateAsync.mockRejectedValue(new Error("offline"));
	state.person = { ...OPEN_DOOR_MEMBER };
	render(() => <DoorsIntro />);
	fireEvent.click(await screen.findByRole("button", { name: "Got it" }));
	expect(mutateAsync).toHaveBeenCalledWith({});
	await waitFor(() => {
		expect(screen.queryByText("Getting in")).toBeNull();
	});
});
