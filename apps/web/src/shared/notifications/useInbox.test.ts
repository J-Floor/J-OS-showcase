import { ConvexError } from "convex/values";
import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

const { markRead, markAllRead, toasterCreate, rows } = vi.hoisted(() => ({
	markRead: vi.fn(),
	markAllRead: vi.fn(),
	toasterCreate: vi.fn(),
	rows: [
		{ _id: "n1", read: false },
		{ _id: "n2", read: false },
	],
}));

vi.mock("convex-solidjs", () => ({
	useMutation: (reference: string) => ({
		mutateAsync: reference === "markRead" ? markRead : markAllRead,
	}),
}));
vi.mock("../../../convex/_generated/api", () => ({
	api: {
		notify: { inbox: { markRead: "markRead", markAllRead: "markAllRead" } },
	},
}));
vi.mock("../data/useFlooredLog.ts", () => ({
	useFlooredLog: () => ({
		rows: () => rows,
		failed: () => false,
		canLoadMore: () => false,
		loading: () => false,
		loadFailed: () => false,
		loadMore: () => Promise.resolve(),
	}),
}));
vi.mock("../toaster.ts", () => ({ toaster: { create: toasterCreate } }));

import { useInbox } from "./useInbox.ts";

afterEach(() => {
	markRead.mockReset();
	markAllRead.mockReset();
	toasterCreate.mockReset();
});

function inbox() {
	return createRoot(() => {
		const [open] = createSignal(true);
		return useInbox(open);
	});
}

test("a refused mark-as-read rolls the row back and toasts the server's message", async () => {
	markRead.mockRejectedValue(
		new ConvexError({ code: "Forbidden", message: "You can't do that." })
	);
	const { markRead: mark, rows: shown } = inbox();
	mark("n1" as never);
	expect(shown()?.[0].read).toBe(true);
	await vi.waitFor(() => {
		expect(toasterCreate).toHaveBeenCalledWith({
			type: "error",
			title: "You can't do that.",
		});
	});
	expect(shown()?.[0].read).toBe(false);
});

test("a failure with no server message toasts the fallback", async () => {
	markAllRead.mockRejectedValue(new Error("boom"));
	const { markAllRead: markAll } = inbox();
	markAll();
	await vi.waitFor(() => {
		expect(toasterCreate).toHaveBeenCalledWith({
			type: "error",
			title: "Could not mark everything as read.",
		});
	});
});

test("a successful mark keeps the row read and shows no toast", async () => {
	markRead.mockResolvedValue(null);
	const { markRead: mark, rows: shown } = inbox();
	mark("n1" as never);
	await vi.waitFor(() => {
		expect(markRead).toHaveBeenCalledOnce();
	});
	expect(shown()?.[0].read).toBe(true);
	expect(toasterCreate).not.toHaveBeenCalled();
});
