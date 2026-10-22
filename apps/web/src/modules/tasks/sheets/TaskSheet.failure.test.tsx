// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { ConvexError } from "convex/values";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

afterEach(() => {
	cleanup();
	mutate.mockReset();
});

beforeAll(() => {
	if (!("ResizeObserver" in globalThis)) {
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	}
	if (
		!(Element.prototype as { hasPointerCapture?: unknown })
			.hasPointerCapture
	) {
		Element.prototype.hasPointerCapture = () => false;
	}
});

vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutate }),
	useQuery: () => ({ data: () => {} }),
}));
vi.mock("../../../../../convex/_generated/api", () => ({ api: {} }));

import { TaskSheet } from "./TaskSheet.tsx";

const REFUSED = new ConvexError({
	code: "Forbidden",
	message: "You can't do that.",
});

test("a refused create shows the reason in the sheet and keeps it open", async () => {
	mutate.mockRejectedValue(REFUSED);
	const onOpenChange = vi.fn();
	render(() => (
		<TaskSheet open onOpenChange={onOpenChange} people={[]} projects={[]} />
	));
	fireEvent.input(screen.getByLabelText(/Title/), {
		target: { value: "Write the report" },
	});
	fireEvent.click(screen.getByRole("button", { name: /Create task/ }));
	expect(await screen.findByText("You can't do that.")).toBeInTheDocument();
	expect(onOpenChange).not.toHaveBeenCalled();
});

test("a failure without a server message shows the fallback", async () => {
	mutate.mockRejectedValue(new Error("boom"));
	render(() => (
		<TaskSheet open onOpenChange={() => {}} people={[]} projects={[]} />
	));
	fireEvent.input(screen.getByLabelText(/Title/), {
		target: { value: "Write the report" },
	});
	fireEvent.click(screen.getByRole("button", { name: /Create task/ }));
	expect(
		await screen.findByText("Could not create that.")
	).toBeInTheDocument();
	expect(screen.queryByText("boom")).not.toBeInTheDocument();
});
