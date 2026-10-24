import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, test } from "vitest";

import { ICONS } from "../../icons.ts";

import { SwapIconButton } from "./SwapIconButton.tsx";

describe("SwapIconButton", () => {
	test("shows the idle glyph at rest, not marked as a success", () => {
		render(() => (
			<SwapIconButton
				tooltipLabel="Copy"
				idleIcon="content_copy"
				success={false}
			/>
		));
		const button = screen.getByRole("button", { name: "Copy" });
		expect(button).toHaveTextContent("content_copy");
		expect(button).not.toHaveAttribute("data-success");
	});

	test("swaps to the default check while success is true, and back", () => {
		const [success, setSuccess] = createSignal(false);
		render(() => (
			<SwapIconButton
				tooltipLabel="Copy"
				idleIcon="content_copy"
				success={success()}
			/>
		));
		const button = screen.getByRole("button", { name: "Copy" });
		setSuccess(true);
		expect(button).toHaveTextContent(ICONS.check);
		expect(button).toHaveAttribute("data-success", "");
		setSuccess(false);
		expect(button).toHaveTextContent("content_copy");
		expect(button).not.toHaveAttribute("data-success");
	});

	test("a successIcon replaces the default check", () => {
		render(() => (
			<SwapIconButton
				tooltipLabel="Download"
				idleIcon="download"
				successIcon="download_done"
				success
			/>
		));
		expect(
			screen.getByRole("button", { name: "Download" })
		).toHaveTextContent("download_done");
	});
});
