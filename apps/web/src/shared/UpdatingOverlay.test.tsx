// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test } from "vitest";

import { APP_ROOT_ID } from "../lib/constants.ts";
import { setUpdatingForTest } from "../lib/pwaUpdates.ts";

import { UpdatingOverlay } from "./UpdatingOverlay.tsx";

let appRoot: HTMLDivElement;

beforeEach(() => {
	setUpdatingForTest(false);
	appRoot = document.createElement("div");
	appRoot.id = APP_ROOT_ID;
	document.body.append(appRoot);
});
afterEach(() => {
	cleanup();
	appRoot.remove();
});

test("hidden while no update is installing", () => {
	render(() => <UpdatingOverlay />);
	expect(screen.queryByText("Updating the app…")).not.toBeInTheDocument();
});

test("shown while an update installs, as a status", async () => {
	render(() => <UpdatingOverlay />);
	setUpdatingForTest(true);
	expect(await screen.findByRole("status")).toHaveTextContent(
		"Updating the app…"
	);
});

test("hides again when the update flag clears", async () => {
	render(() => <UpdatingOverlay />);
	setUpdatingForTest(true);
	await screen.findByText("Updating the app…");
	setUpdatingForTest(false);
	expect(screen.queryByText("Updating the app…")).not.toBeInTheDocument();
});

test("a missing app root does not throw", async () => {
	appRoot.remove();
	render(() => <UpdatingOverlay />);
	setUpdatingForTest(true);
	expect(await screen.findByRole("status")).toBeInTheDocument();
});

test("the app root is inert while the overlay shows", async () => {
	render(() => <UpdatingOverlay />);
	expect(appRoot).not.toHaveAttribute("inert");
	setUpdatingForTest(true);
	await screen.findByText("Updating the app…");
	expect(appRoot).toHaveAttribute("inert");
	setUpdatingForTest(false);
	expect(appRoot).not.toHaveAttribute("inert");
});
