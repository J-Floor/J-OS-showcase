// @vitest-environment happy-dom
import { Accordion } from "@j-os/design-system";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { SheetSection } from "./SheetSection.tsx";

afterEach(cleanup);

test("shows its title, subtitle and content", () => {
	render(() => (
		<Accordion.Root multiple defaultValue={["requests"]}>
			<SheetSection value="requests" title="Requests" subtitle="3">
				<span>A request</span>
			</SheetSection>
		</Accordion.Root>
	));
	expect(screen.getByText("Requests")).toBeInTheDocument();
	expect(screen.getByText("3")).toBeInTheDocument();
	expect(screen.getByText("A request")).toBeInTheDocument();
});
