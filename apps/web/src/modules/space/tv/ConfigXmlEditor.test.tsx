// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { ConvexError } from "convex/values";
import { useQuery } from "convex-solidjs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api } from "../../../../convex/_generated/api";
import { tvMessages } from "../../../../convex/lib/errors/tv.ts";
import { TV_PACK_LIMITS } from "../../../../convex/lib/tv/constants.ts";
import { ConfirmProvider } from "../../../shared/confirm.tsx";

import { ConfigXmlEditor } from "./ConfigXmlEditor.tsx";

// `convex-solidjs` is stubbed: queries answer from signals the test sets by
// function name, mutations and actions record their (name, args). `api`
// references are proxies that are not `===`-stable, so everything routes by
// function name.
const convexMock = vi.hoisted(() => ({
	set: vi.fn<(name: string, value: unknown) => void>(),
	mutate: vi.fn<(name: string, args: unknown) => Promise<unknown>>(() =>
		Promise.resolve(null)
	),
}));

vi.mock("convex-solidjs", async () => {
	const { getFunctionName } = await import("convex/server");
	const { createSignal } = await import("solid-js");
	const signals = new Map<string, ReturnType<typeof createSignal<unknown>>>();
	function signalFor(name: string) {
		const existing = signals.get(name);
		if (existing) return existing;
		const created = createSignal<unknown>(undefined);
		signals.set(name, created);
		return created;
	}
	convexMock.set.mockImplementation((name, value) => {
		signalFor(name)[1](() => value);
	});
	function runner(reference: Parameters<typeof getFunctionName>[0]) {
		return {
			mutateAsync: (args: unknown) =>
				convexMock.mutate(getFunctionName(reference), args),
		};
	}
	return {
		useQuery: (reference: Parameters<typeof getFunctionName>[0]) => ({
			data: signalFor(getFunctionName(reference))[0],
			error: () => {},
			isLoading: () => false,
		}),
		useMutation: runner,
		useAction: runner,
	};
});

const XML = '<tv version="1" transition="fade">\n</tv>\n';

function packState(overrides: object = {}) {
	return {
		xml: XML,
		version: 4,
		packVersion: 4,
		packUrl: null,
		isAwaitingMigration: false,
		...overrides,
	};
}

beforeEach(() => {
	convexMock.mutate.mockReset();
	convexMock.set("tvContent:getPackState", packState());
});
afterEach(cleanup);

/** TvTab reads the pack state once and hands it down; this does the same. */
function Harness() {
	const state = useQuery(api.tvContent.getPackState, {});
	return <ConfigXmlEditor state={state.data} />;
}

function editor(): HTMLElement {
	return screen.getByRole("textbox", { name: "config.xml" });
}

test("shows the saved XML and saves an edit with the version it was based on", async () => {
	convexMock.mutate.mockResolvedValue({ ok: true, version: 5 });
	render(() => <Harness />);
	expect(editor()).toHaveValue(XML);
	fireEvent.input(editor(), {
		target: { value: '<tv version="1" transition="none"/>' },
	});
	fireEvent.click(screen.getByRole("button", { name: "Save config.xml" }));
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith(
			"tvContent:saveConfigXml",
			{
				xml: '<tv version="1" transition="none"/>',
				expectedVersion: 4,
			}
		);
	});
});

test("lists the problems the server found and keeps the draft", async () => {
	convexMock.mutate.mockResolvedValue({
		ok: false,
		problems: ['Line 2: Slide "b": type must be image or html.'],
	});
	render(() => <Harness />);
	fireEvent.input(editor(), { target: { value: "<tv" } });
	fireEvent.click(screen.getByRole("button", { name: "Save config.xml" }));
	expect(
		await screen.findByText(
			'Line 2: Slide "b": type must be image or html.'
		)
	).toBeInTheDocument();
	expect(editor()).toHaveValue("<tv");
});

test("a refusal (stale version) shows its message and keeps the draft", async () => {
	convexMock.mutate.mockRejectedValue(
		new ConvexError({
			code: "TvConfigStale",
			message: tvMessages.TvConfigStale,
		})
	);
	render(() => <Harness />);
	fireEvent.input(editor(), { target: { value: "<tv/>" } });
	fireEvent.click(screen.getByRole("button", { name: "Save config.xml" }));
	expect(await screen.findByRole("alert")).toHaveTextContent(
		tvMessages.TvConfigStale
	);
	expect(editor()).toHaveValue("<tv/>");
	fireEvent.click(await screen.findByRole("button", { name: "Load latest" }));
	await waitFor(() => {
		expect(editor()).toHaveValue(XML);
	});
});

test("discard returns to the saved XML; save is off without changes", () => {
	render(() => <Harness />);
	expect(
		screen.getByRole("button", { name: "Save config.xml" })
	).toBeDisabled();
	fireEvent.input(editor(), { target: { value: "<tv/>" } });
	fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
	expect(editor()).toHaveValue(XML);
});

test("a refetch while typing keeps the draft, says the config changed and holds the save", async () => {
	render(() => <Harness />);
	fireEvent.input(editor(), { target: { value: "<tv half" } });
	convexMock.set(
		"tvContent:getPackState",
		packState({ xml: "<tv changed/>", version: 5 })
	);
	expect(editor()).toHaveValue("<tv half");
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"The TV config changed since you started editing."
	);
	expect(
		screen.getByRole("button", { name: "Save config.xml" })
	).toBeDisabled();
	expect(convexMock.mutate).not.toHaveBeenCalled();
	fireEvent.click(await screen.findByRole("button", { name: "Load latest" }));
	await waitFor(() => {
		expect(editor()).toHaveValue("<tv changed/>");
	});
});

test("a refetch with no draft shows the new XML", () => {
	render(() => <Harness />);
	convexMock.set(
		"tvContent:getPackState",
		packState({ xml: "<tv changed/>", version: 5 })
	);
	expect(editor()).toHaveValue("<tv changed/>");
});

test("a saved draft gives way to the saved XML, even when the server wrote it differently", async () => {
	convexMock.mutate.mockResolvedValue({ ok: true, version: 5 });
	render(() => <Harness />);
	fireEvent.input(editor(), { target: { value: "<tv   saved/>" } });
	fireEvent.click(screen.getByRole("button", { name: "Save config.xml" }));
	await waitFor(() => {
		expect(
			screen.getByRole("button", { name: "Discard changes" })
		).toBeDisabled();
	});
	// The query is behind the save: the field shows what was written.
	expect(editor()).toHaveValue("<tv   saved/>");
	convexMock.set(
		"tvContent:getPackState",
		packState({ xml: "<tv saved/>", version: 5 })
	);
	// The draft was reset, so the query's own text shows.
	expect(editor()).toHaveValue("<tv saved/>");
});

test("typing is off until the config has loaded, so a draft cannot start without its version", () => {
	convexMock.set("tvContent:getPackState", undefined);
	render(() => <Harness />);
	expect(editor()).toBeDisabled();
});

test("a text over the size limit is flagged and cannot be saved", async () => {
	render(() => <Harness />);
	fireEvent.input(editor(), {
		target: { value: "x".repeat(TV_PACK_LIMITS.configMaxBytes + 1) },
	});
	expect(
		await screen.findByText(/Too long: 65,537 of 65,536 bytes/)
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Save config.xml" })
	).toBeDisabled();
});

test("Load latest asks before it throws away edits that differ from the saved XML", async () => {
	render(() => (
		<ConfirmProvider>
			<Harness />
		</ConfirmProvider>
	));
	fireEvent.input(editor(), { target: { value: "<tv mine/>" } });
	convexMock.set(
		"tvContent:getPackState",
		packState({ xml: "<tv theirs/>", version: 5 })
	);
	fireEvent.click(await screen.findByRole("button", { name: "Load latest" }));
	fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
	await waitFor(() => {
		expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
	});
	expect(editor()).toHaveValue("<tv mine/>");
	fireEvent.click(screen.getByRole("button", { name: "Load latest" }));
	fireEvent.click(
		await screen.findByRole("button", { name: "Discard my text" })
	);
	await waitFor(() => {
		expect(editor()).toHaveValue("<tv theirs/>");
	});
});

test("while the legacy slides are being moved the editor is off", () => {
	convexMock.set(
		"tvContent:getPackState",
		packState({ isAwaitingMigration: true })
	);
	render(() => <Harness />);
	expect(editor()).toBeDisabled();
	expect(
		screen.getByRole("button", { name: "Save config.xml" })
	).toBeDisabled();
});
