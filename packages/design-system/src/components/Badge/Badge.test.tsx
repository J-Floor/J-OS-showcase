import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

afterEach(cleanup);

import { Badge } from "./Badge.tsx";

test("renders its label", () => {
	render(() => <Badge>Outstanding</Badge>);
	expect(screen.getByText("Outstanding")).toBeInTheDocument();
});

test("exposes the status on the wrapper so tokens resolve", () => {
	const { container } = render(() => <Badge status="error">Blocked</Badge>);
	expect(container.querySelector('[data-status="error"]')).not.toBeNull();
});

test("defaults to neutral", () => {
	const { container } = render(() => <Badge>Idle</Badge>);
	expect(container.querySelector('[data-status="neutral"]')).not.toBeNull();
});

test("keeps a caller's class alongside its own", () => {
	const { container } = render(() => <Badge class="mine">Idle</Badge>);
	expect(container.querySelector("span.mine")).not.toBeNull();
});

test.each(["success", "error", "warning", "info", "neutral"] as const)(
	"renders data-status=%s for every accepted tone",
	(status) => {
		const { container } = render(() => (
			<Badge status={status}>Tone {status}</Badge>
		));
		expect(
			container.querySelector(`[data-status="${status}"]`)
		).not.toBeNull();
	}
);
