import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary.tsx";

function Boom(): never {
	throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
	it("calls onError with the caught error", () => {
		const onError = vi.fn();
		render(() => (
			<ErrorBoundary logError={false} onError={onError}>
				<Boom />
			</ErrorBoundary>
		));
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
		expect((onError.mock.calls[0][0] as Error).message).toBe("kaboom");
	});

	it("shows the fallback without onError", () => {
		render(() => (
			<ErrorBoundary logError={false}>
				<Boom />
			</ErrorBoundary>
		));
		expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
		expect(screen.getByText("kaboom")).toBeInTheDocument();
	});
});
