// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { err, ok, type Result } from "neverthrow";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { Doc } from "../../../convex/_generated/dataModel";
import { tvMessages } from "../../../convex/lib/errors/tv.ts";
import { TV_LIMITS } from "../../../convex/lib/tv/constants.ts";
import type { ClientError } from "../../lib/call.ts";

const convexMock = vi.hoisted(() => ({
	url: undefined as string | null | undefined,
	mutate: vi.fn<(name: string, args: unknown) => Promise<unknown>>(),
}));

// `api` references are proxies that are not `===`-stable: route by name.
vi.mock("convex-solidjs", async () => {
	const { getFunctionName } = await import("convex/server");
	return {
		useQuery: () => ({
			data: () => convexMock.url,
			error: () => {},
			isLoading: () => false,
		}),
		useMutation: (reference: Parameters<typeof getFunctionName>[0]) => ({
			mutateAsync: (args: unknown) =>
				convexMock.mutate(getFunctionName(reference), args),
		}),
	};
});

import { EventPicture } from "./EventPicture.tsx";

const EVENT = { _id: "event1", name: "Open House" } as Doc<"events">;

beforeEach(() => {
	convexMock.url = undefined;
	convexMock.mutate.mockReset();
	convexMock.mutate.mockImplementation((name) =>
		Promise.resolve(
			name === "events:generateEventPictureUploadUrl"
				? "https://upload.example.com/u"
				: null
		)
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() =>
			Promise.resolve(
				new Response(JSON.stringify({ storageId: "stor1" }), {
					status: 200,
				})
			)
		)
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

/** A promise settled from outside, for holding a request open. */
function deferred<T>() {
	const settle: { resolve?: (value: T) => void } = {};
	const promise = new Promise<T>((done) => {
		settle.resolve = done;
	});
	return {
		promise,
		resolve(value: T) {
			settle.resolve?.(value);
		},
	};
}

type Answer = Result<unknown, ClientError>;

/** A save that answers each attempt with `result`. */
function answering(result: Answer) {
	return vi.fn((...[, onAttempt]: [unknown, ((answer: Answer) => void)?]) => {
		onAttempt?.(result);
	});
}

function renderPicture(
	isEditing: boolean,
	onPatch: (...args: never[]) => unknown = answering(ok(null))
) {
	const [isEditingSignal] = createSignal(isEditing);
	render(() => (
		<EventPicture
			event={() => EVENT}
			isEditing={isEditingSignal}
			onPatch={onPatch as never}
		/>
	));
	return onPatch;
}

function choose(file: File) {
	fireEvent.change(screen.getByLabelText("Event picture file"), {
		target: { files: [file] },
	});
}

function png(): File {
	return new File(["x"], "poster.png", { type: "image/png" });
}

test("shows the picture with the event name as alt text", () => {
	convexMock.url = "https://files.example.com/pic.png";
	renderPicture(false);
	const image = screen.getByRole("img", { name: "Open House" });
	expect(image.getAttribute("src")).toBe("https://files.example.com/pic.png");
});

test("read-only without a picture shows no file input", () => {
	convexMock.url = null;
	renderPicture(false);
	expect(screen.queryByLabelText("Event picture file")).toBeNull();
});

test("choosing a PNG uploads it and patches pictureId", async () => {
	const onPatch = renderPicture(true);
	choose(png());
	await waitFor(() => {
		expect(onPatch).toHaveBeenCalledWith(
			{ pictureId: "stor1" },
			expect.any(Function)
		);
	});
	expect(fetch).toHaveBeenCalledWith(
		"https://upload.example.com/u",
		expect.objectContaining({ method: "POST" })
	);
});

test("an image the server refuses discards the upload", async () => {
	renderPicture(
		true,
		answering(err({ code: "TvImageInvalid", message: "Not an image." }))
	);
	choose(png());
	await waitFor(() => {
		expect(convexMock.mutate).toHaveBeenCalledWith(
			"events:discardEventPictureUpload",
			{ fileId: "stor1" }
		);
	});
});

test("a save that did not get through keeps the upload", async () => {
	const onPatch = renderPicture(
		true,
		answering(err({ code: "Unknown", message: "Could not save." }))
	);
	choose(png());
	await waitFor(() => {
		expect(onPatch).toHaveBeenCalled();
	});
	await Promise.resolve();
	expect(convexMock.mutate).not.toHaveBeenCalledWith(
		"events:discardEventPictureUpload",
		expect.anything()
	);
});

test("an image over the size limit is refused before any upload", () => {
	const onPatch = renderPicture(true);
	const big = png();
	Object.defineProperty(big, "size", {
		value: TV_LIMITS.imageMaxBytes + 1,
	});
	choose(big);
	expect(screen.getByText(tvMessages.TvImageInvalid)).toBeInTheDocument();
	expect(fetch).not.toHaveBeenCalled();
	expect(onPatch).not.toHaveBeenCalled();
});

test("a pick made while an upload runs is ignored and the controls are disabled", async () => {
	const gate = deferred<Response>();
	vi.stubGlobal(
		"fetch",
		vi.fn(() => gate.promise)
	);
	const onPatch = renderPicture(true);
	choose(png());
	await waitFor(() => {
		expect(fetch).toHaveBeenCalledTimes(1);
	});
	expect(screen.getByRole("button", { name: /picture/ })).toBeDisabled();
	expect(screen.getByLabelText("Event picture file")).toBeDisabled();
	choose(png());
	await Promise.resolve();
	expect(fetch).toHaveBeenCalledTimes(1);
	gate.resolve(
		new Response(JSON.stringify({ storageId: "stor1" }), { status: 200 })
	);
	await waitFor(() => {
		expect(onPatch).toHaveBeenCalledTimes(1);
	});
	await waitFor(() => {
		expect(screen.getByLabelText("Event picture file")).toBeEnabled();
	});
});

test("a file of another type is refused before any upload", () => {
	const onPatch = renderPicture(true);
	choose(new File(["x"], "doc.pdf", { type: "application/pdf" }));
	expect(screen.getByText(/PNG, JPEG, WebP or GIF/)).toBeInTheDocument();
	expect(fetch).not.toHaveBeenCalled();
	expect(onPatch).not.toHaveBeenCalled();
});

test("Remove picture patches pictureId to null", () => {
	convexMock.url = "https://files.example.com/pic.png";
	const onPatch = renderPicture(true);
	fireEvent.click(screen.getByRole("button", { name: "Remove picture" }));
	expect(onPatch).toHaveBeenCalledWith({ pictureId: null }, undefined);
});

test("a picture renders inside the preview container with Replace and Remove", () => {
	convexMock.url = "https://files.example.com/pic.png";
	renderPicture(true);
	const image = screen.getByRole("img", { name: "Open House" });
	const replace = screen.getByRole("button", { name: "Replace picture" });
	// The image sits in its own wrapper, apart from the buttons beside it.
	expect(image.parentElement).not.toContainElement(replace);
	expect(replace).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Remove picture" })
	).toBeInTheDocument();
});

test("no picture shows the hint and no image", () => {
	convexMock.url = null;
	renderPicture(false);
	expect(screen.getByText("No picture")).toBeInTheDocument();
	expect(screen.queryByRole("img")).toBeNull();
});

test("while the URL loads there is neither an image nor the hint", () => {
	convexMock.url = undefined;
	renderPicture(false);
	expect(screen.queryByRole("img")).toBeNull();
	expect(screen.queryByText("No picture")).toBeNull();
});
