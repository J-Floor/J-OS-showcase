// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test } from "vitest";

import { APP_ROOT_ID } from "../lib/constants.ts";
import {
	setUpdateProgressForTest,
	setUpdatingForTest,
} from "../lib/pwaUpdates.ts";

import { UpdatingOverlay } from "./UpdatingOverlay.tsx";

let appRoot: HTMLDivElement;

beforeEach(() => {
	setUpdatingForTest(false);
	setUpdateProgressForTest(undefined);
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

test("spinner until the first progress message", async () => {
	render(() => <UpdatingOverlay />);
	setUpdatingForTest(true);
	await screen.findByRole("status", { name: "Updating the app" });
	expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});

test("shows done of total as a progress bar", async () => {
	render(() => <UpdatingOverlay />);
	setUpdatingForTest(true);
	setUpdateProgressForTest({ done: 3, total: 12 });
	const bar = await screen.findByRole("progressbar");
	expect(bar).toHaveAttribute("aria-valuenow", "3");
	expect(bar).toHaveAttribute("aria-valuemax", "12");
	expect(screen.getByText("Updating the app…")).toBeInTheDocument();
});

test("says Restarting when every file is in", async () => {
	render(() => <UpdatingOverlay />);
	setUpdatingForTest(true);
	setUpdateProgressForTest({ done: 12, total: 12 });
	expect(await screen.findByText("Restarting…")).toBeInTheDocument();
	expect(screen.queryByText("Updating the app…")).not.toBeInTheDocument();
});

test("says Restarting when there was nothing to download", async () => {
	render(() => <UpdatingOverlay />);
	setUpdatingForTest(true);
	setUpdateProgressForTest({ done: 0, total: 0 });
	expect(await screen.findByText("Restarting…")).toBeInTheDocument();
});

test("an open bar follows each new report, then says Restarting", async () => {
	render(() => <UpdatingOverlay />);
	setUpdatingForTest(true);
	setUpdateProgressForTest({ done: 3, total: 12 });
	const bar = await screen.findByRole("progressbar");
	setUpdateProgressForTest({ done: 7, total: 12 });
	expect(bar).toHaveAttribute("aria-valuenow", "7");
	expect(screen.getByRole("progressbar")).toBe(bar);
	setUpdateProgressForTest({ done: 12, total: 12 });
	expect(bar).toHaveAttribute("aria-valuenow", "12");
	expect(screen.getByText("Restarting…")).toBeInTheDocument();
});
