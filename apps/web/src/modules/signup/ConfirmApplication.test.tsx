// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";
afterEach(cleanup);

const mutateAsync = vi.fn(() =>
	Promise.resolve({ status: "verified" as const })
);
vi.mock("convex-solidjs", () => ({
	useAction: () => ({ mutateAsync }),
}));
vi.mock("@solidjs/router", () => ({
	useSearchParams: () => [{ token: "tok" }],
}));

import { ConfirmApplication } from "./ConfirmApplication.tsx";

test("confirms on mount and shows success", async () => {
	render(() => <ConfirmApplication />);
	await vi.waitFor(() => {
		expect(mutateAsync).toHaveBeenCalledWith({ token: "tok" });
	});
	expect(
		await screen.findByText(/application confirmed/i)
	).toBeInTheDocument();
});
