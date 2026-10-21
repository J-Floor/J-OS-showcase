import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorScreen } from "./ErrorScreen.tsx";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("ErrorScreen", () => {
	it("shows the fixed heading and the given message", () => {
		render(() => <ErrorScreen message="kaboom" onRetry={() => {}} />);
		expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
		expect(screen.getByText("kaboom")).toBeInTheDocument();
	});

	it("calls onRetry when Retry is pressed", () => {
		const onRetry = vi.fn();
		render(() => <ErrorScreen message="kaboom" onRetry={onRetry} />);
		fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("goes back in history when Go back is pressed", () => {
		const back = vi
			.spyOn(window.history, "back")
			.mockImplementation(() => {});
		const onRetry = vi.fn();
		render(() => <ErrorScreen message="kaboom" onRetry={onRetry} />);
		fireEvent.click(screen.getByRole("button", { name: /Go back/ }));
		expect(back).toHaveBeenCalledTimes(1);
		expect(onRetry).not.toHaveBeenCalled();
	});
});
