// @vitest-environment jsdom
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, test } from "vitest";

import { Icon } from "../Icon/Icon.tsx";

import { Chip } from "./Chip.tsx";

describe("Chip", () => {
	test("renders its label", () => {
		render(() => <Chip>Fintech</Chip>);
		expect(screen.getByText("Fintech")).toBeInTheDocument();
	});
	test("marks a trailing Icon as a suffix", () => {
		const { container } = render(() => (
			<Chip>
				Fintech
				<Icon>close</Icon>
			</Chip>
		));
		expect(
			container.querySelector('[data-suffix="true"]')
		).toBeInTheDocument();
	});
	test("no suffix when there is only a label", () => {
		const { container } = render(() => <Chip>Fintech</Chip>);
		expect(container.querySelector('[data-suffix="true"]')).toBeNull();
	});
});
