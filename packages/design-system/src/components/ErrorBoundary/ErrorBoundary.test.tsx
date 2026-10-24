import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary.tsx";

function Boom(): never {
	throw new Error("kaboom");
}

function boom(): never {
	throw new Error("kaboom");
}

/** Throws while `explode` is true, else shows "recovered". */
function MaybeBoom(props: { explode: boolean }) {
	return <span>{props.explode ? boom() : "recovered"}</span>;
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

	it("shows the default screen without a fallback", () => {
		render(() => (
			<ErrorBoundary logError={false}>
				<Boom />
			</ErrorBoundary>
		));
		expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
		expect(screen.getByText("kaboom")).toBeInTheDocument();
	});

	it("re-renders the children when resetKey changes after an error", () => {
		const [explode, setExplode] = createSignal(true);
		const [key, setKey] = createSignal("/a");
		render(() => (
			<ErrorBoundary logError={false} resetKey={key()}>
				<MaybeBoom explode={explode()} />
			</ErrorBoundary>
		));
		expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
		setExplode(false);
		setKey("/b");
		expect(screen.getByText("recovered")).toBeInTheDocument();
		expect(screen.queryByText("Something went wrong.")).toBeNull();
	});

	it("renders a custom fallback whose reset retries the children", () => {
		const [explode, setExplode] = createSignal(true);
		const onError = vi.fn();
		render(() => (
			<ErrorBoundary
				logError={false}
				onError={onError}
				fallback={(error, reset) => (
					<button type="button" onClick={reset}>
						{error instanceof Error ? error.message : "?"} retry
					</button>
				)}
			>
				<MaybeBoom explode={explode()} />
			</ErrorBoundary>
		));
		expect(screen.queryByText("Something went wrong.")).toBeNull();
		expect(onError).toHaveBeenCalledTimes(1);
		setExplode(false);
		fireEvent.click(screen.getByRole("button", { name: "kaboom retry" }));
		expect(screen.getByText("recovered")).toBeInTheDocument();
	});
});
