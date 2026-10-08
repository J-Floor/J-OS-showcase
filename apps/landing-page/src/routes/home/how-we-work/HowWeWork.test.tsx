// @vitest-environment jsdom
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { HowWeWork } from "./HowWeWork.tsx";

describe("HowWeWork", () => {
	it("renders the principle card titles", async () => {
		render(() => <HowWeWork />);
		expect(await screen.findByText("Start With Action")).toBeTruthy();
		expect(await screen.findByText("Ship, Learn, Repeat")).toBeTruthy();
	});
});
