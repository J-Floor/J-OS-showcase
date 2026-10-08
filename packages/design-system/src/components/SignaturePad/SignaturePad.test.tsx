// @vitest-environment jsdom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

import { SignaturePad } from "./SignaturePad.tsx";

test("renders the label and a clear control", () => {
	render(() => <SignaturePad label="Sign here" onChange={vi.fn()} />);
	expect(screen.getByText("Sign here")).toBeInTheDocument();
	// Clear control is a button (ark ClearTrigger renders a <button>).
	expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
});
