// @vitest-environment jsdom
import { render } from "@solidjs/testing-library";
import { children, type JSX } from "solid-js";
import { describe, expect, test } from "vitest";

import { Icon } from "../components/Icon/Icon.tsx";
import { IconButton } from "../components/IconButton/IconButton.tsx";
import { Kbd } from "../components/Kbd/Kbd.tsx";

import { adornmentsOf } from "./adornments.ts";

/** Resolves `content` the way Button and Chip do, and reports its adornments. */
function adornmentsOfContent(content: () => JSX.Element): {
	hasPrefix: boolean;
	hasSuffix: boolean;
} {
	let result = { hasPrefix: false, hasSuffix: false };
	render(() => {
		const resolved = children(content);
		result = adornmentsOf(resolved.toArray());
		return <span>{resolved()}</span>;
	});
	return result;
}

describe("adornmentsOf", () => {
	test("an Icon first child is a prefix", () => {
		expect(
			adornmentsOfContent(() => (
				<>
					<Icon>add</Icon>
					Label
				</>
			))
		).toEqual({ hasPrefix: true, hasSuffix: false });
	});

	test("a Kbd last child is a suffix", () => {
		expect(
			adornmentsOfContent(() => (
				<>
					Label
					<Kbd shortcut="D" />
				</>
			))
		).toEqual({ hasPrefix: false, hasSuffix: true });
	});

	test("a single child is never both", () => {
		expect(adornmentsOfContent(() => <Icon>add</Icon>)).toEqual({
			hasPrefix: true,
			hasSuffix: false,
		});
	});

	test("a plain label has neither", () => {
		expect(adornmentsOfContent(() => "Label")).toEqual({
			hasPrefix: false,
			hasSuffix: false,
		});
	});

	test("a trailing IconButton is a suffix, past the empty marker its tooltip leaves", () => {
		expect(
			adornmentsOfContent(() => (
				<>
					Label
					<IconButton tooltipLabel="Remove">close</IconButton>
				</>
			))
		).toEqual({ hasPrefix: false, hasSuffix: true });
	});

	test("a disabled IconButton, wrapped for its reason tooltip, is still a suffix", () => {
		expect(
			adornmentsOfContent(() => (
				<>
					Label
					<IconButton
						tooltipLabel="Remove"
						disabled
						disabledReason="Locked"
					>
						close
					</IconButton>
				</>
			))
		).toEqual({ hasPrefix: false, hasSuffix: true });
	});

	test("a hidden inline Kbd leaves no suffix", () => {
		expect(
			adornmentsOfContent(() => (
				<>
					Label
					<Kbd inline shortcut="D" />
				</>
			))
		).toEqual({ hasPrefix: false, hasSuffix: false });
	});

	test("an icon inside the label is not an adornment", () => {
		expect(
			adornmentsOfContent(() => (
				<span>
					Label <Icon>add</Icon> more
				</span>
			))
		).toEqual({ hasPrefix: false, hasSuffix: false });
	});
});
