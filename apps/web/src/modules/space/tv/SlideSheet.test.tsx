// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { ConvexError } from "convex/values";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { tvMessages } from "../../../../convex/lib/errors/tv.ts";
import { TV_LIMITS } from "../../../../convex/lib/tv/constants.ts";

import { SlideSheet } from "./SlideSheet.tsx";

// `convex-solidjs` is stubbed: queries answer from signals the test sets by
// function name, mutations record their (name, args). `api` references are
// proxies that are not `===`-stable, so everything routes by function name.
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
		const [read, write] = createSignal<unknown>(undefined);
		const created: ReturnType<typeof createSignal<unknown>> = [read, write];
		signals.set(name, created);
		return created;
	}
	convexMock.set.mockImplementation((name, value) => {
		signalFor(name)[1](() => value);
	});
	return {
		useQuery: (reference: Parameters<typeof getFunctionName>[0]) => ({
			data: signalFor(getFunctionName(reference))[0],
			error: () => {},
			isLoading: () => false,
		}),
		useMutation: (reference: Parameters<typeof getFunctionName>[0]) => ({
			mutateAsync: (args: unknown) =>
				convexMock.mutate(getFunctionName(reference), args),
		}),
	};
});

const UPLOAD_URL = "https://upload.example.com/one-shot";
const fetchMock = vi.fn();

const HTML_SLIDE = {
	_id: "slide-a",
	title: "Welcome",
	kind: "html",
	durationSec: 20,
	enabled: true,
	fromEvent: false,
	eventName: undefined,
	isMissing: false,
};

const HTML_URL = "https://files.example.com/slide-a.html";

/** Serves slide HTML files by URL; any other fetch is a one-shot upload. */
function serveFiles(files: Record<string, string>) {
	fetchMock.mockImplementation((url: string) =>
		Promise.resolve(
			url in files
				? { ok: true, text: () => Promise.resolve(files[url]) }
				: {
						ok: true,
						json: () => Promise.resolve({ storageId: "storage-1" }),
					}
		)
	);
}

function serveHtml(text: string) {
	serveFiles({ [HTML_URL]: text });
}

/** Answers the mutations a save makes; `createSlide` can be made to refuse. */
function answerMutations(refuseCreate?: keyof typeof tvMessages) {
	convexMock.mutate.mockImplementation((name) => {
		if (name === "tv:generateUploadUrl") return Promise.resolve(UPLOAD_URL);
		if (name === "tvContent:addConfigSlide" && refuseCreate !== undefined)
			return Promise.reject(
				new ConvexError({
					code: refuseCreate,
					message: tvMessages[refuseCreate],
				})
			);
		return Promise.resolve(null);
	});
}

beforeEach(() => {
	convexMock.mutate.mockReset();
	answerMutations();
	fetchMock.mockReset();
	fetchMock.mockResolvedValue({
		ok: true,
		json: () => Promise.resolve({ storageId: "storage-1" }),
	});
	vi.stubGlobal("fetch", fetchMock);
	convexMock.set("tvContent:listConfigSlides", [HTML_SLIDE]);
	convexMock.set("tvContent:getConfigSlide", undefined);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function renderSheet(slideId?: string) {
	const onOpenChange = vi.fn();
	render(() => (
		<SlideSheet open onOpenChange={onOpenChange} slideId={slideId} />
	));
	return { onOpenChange };
}

/** The text boxes by name: "HTML" is also the name of a type radio. */
function field(label: string): HTMLElement {
	return screen.getByRole("textbox", { name: label });
}

function typeInto(label: string, value: string) {
	fireEvent.input(field(label), { target: { value } });
}

/** Picks a file; for an image, waits until the sheet shows it as chosen
 *  (the file is read asynchronously). */
async function chooseImage(file: File) {
	fireEvent.change(screen.getByLabelText("Slide file"), {
		target: { files: [file] },
	});
	await screen.findByText(file.name);
}

function chooseFile(file: File) {
	fireEvent.change(screen.getByLabelText("Slide file"), {
		target: { files: [file] },
	});
}

function call(name: string) {
	return convexMock.mutate.mock.calls.filter(([called]) => called === name);
}

test("an open slide is looked up live: a renamed slide shows its new title", async () => {
	renderSheet("slide-a");
	expect(
		await screen.findByRole("heading", { name: "Welcome" })
	).toBeInTheDocument();
	convexMock.set("tvContent:listConfigSlides", [
		{ ...HTML_SLIDE, title: "Welcome back" },
	]);
	expect(
		await screen.findByRole("heading", { name: "Welcome back" })
	).toBeInTheDocument();
});

test("html mode uploads the pasted text as an HTML file, then adds the slide", async () => {
	const { onOpenChange } = renderSheet();
	fireEvent.click(screen.getByRole("radio", { name: "HTML" }));
	await screen.findByRole("textbox", { name: "HTML" });
	typeInto("Title", "Hello");
	typeInto("HTML", "<h1>Hi</h1>");
	fireEvent.click(screen.getByRole("button", { name: "Add slide" }));
	await waitFor(() => {
		expect(call("tvContent:addConfigSlide")).toEqual([
			[
				"tvContent:addConfigSlide",
				{
					title: "Hello",
					kind: "html",
					fileId: "storage-1",
					durationSec: TV_LIMITS.durationDefault,
				},
			],
		]);
	});
	const [url, init] = fetchMock.mock.calls[0] as [
		string,
		{ body: File; headers: Record<string, string> },
	];
	expect(url).toBe(UPLOAD_URL);
	expect(init.headers).toEqual({ "Content-Type": "text/html" });
	expect(init.body.name).toBe("slide.html");
	expect(await init.body.text()).toBe("<h1>Hi</h1>");
	await waitFor(() => {
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});

test("choosing an .html file switches to HTML and fills the text", async () => {
	renderSheet();
	expect(screen.queryByRole("textbox", { name: "HTML" })).toBeNull();
	chooseFile(
		new File(["<p>from a file</p>"], "page.html", { type: "text/html" })
	);
	await waitFor(() => {
		expect(field("HTML")).toHaveValue("<p>from a file</p>");
	});
});

test("an image is uploaded to the one-shot URL, then the slide points at it", async () => {
	renderSheet();
	const image = new File(["png"], "poster.png", { type: "image/png" });
	await chooseImage(image);
	typeInto("Title", "Poster");
	fireEvent.click(screen.getByRole("button", { name: "Add slide" }));
	await waitFor(() => {
		expect(call("tvContent:addConfigSlide")).toHaveLength(1);
	});
	expect(fetchMock).toHaveBeenCalledWith(UPLOAD_URL, {
		method: "POST",
		headers: { "Content-Type": "image/png" },
		body: image,
	});
	expect(call("tvContent:addConfigSlide")[0]?.[1]).toEqual({
		title: "Poster",
		kind: "image",
		fileId: "storage-1",
		durationSec: TV_LIMITS.durationDefault,
	});
	expect(call("tv:discardUpload")).toHaveLength(0);
});

test("a refused slide shows the server's message and discards the upload", async () => {
	answerMutations("TvTooManySlides");
	const { onOpenChange } = renderSheet();
	await chooseImage(new File(["png"], "poster.png", { type: "image/png" }));
	typeInto("Title", "Poster");
	fireEvent.click(screen.getByRole("button", { name: "Add slide" }));
	expect(await screen.findByRole("alert")).toHaveTextContent(
		tvMessages.TvTooManySlides
	);
	expect(call("tv:discardUpload")).toEqual([
		["tv:discardUpload", { fileId: "storage-1" }],
	]);
	expect(onOpenChange).not.toHaveBeenCalled();
});

test("a refused html slide shows its message and discards the new upload", async () => {
	answerMutations("TvSlideInvalid");
	renderSheet();
	fireEvent.click(screen.getByRole("radio", { name: "HTML" }));
	await screen.findByRole("textbox", { name: "HTML" });
	typeInto("Title", "Hello");
	typeInto("HTML", "<p>x</p>");
	fireEvent.click(screen.getByRole("button", { name: "Add slide" }));
	expect(await screen.findByRole("alert")).toHaveTextContent(
		tvMessages.TvSlideInvalid
	);
	expect(call("tv:discardUpload")).toEqual([
		["tv:discardUpload", { fileId: "storage-1" }],
	]);
});

test("an oversize image is refused before anything is uploaded", async () => {
	renderSheet();
	chooseFile(
		new File([new Uint8Array(TV_LIMITS.imageMaxBytes + 1)], "huge.png", {
			type: "image/png",
		})
	);
	expect(await screen.findByRole("alert")).toHaveTextContent(
		tvMessages.TvImageInvalid
	);
	typeInto("Title", "Huge");
	fireEvent.click(screen.getByRole("button", { name: "Add slide" }));
	await waitFor(() => {
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});
	expect(call("tv:generateUploadUrl")).toHaveLength(0);
	expect(fetchMock).not.toHaveBeenCalled();
});

test("an SVG is refused", async () => {
	renderSheet();
	chooseFile(new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }));
	expect(await screen.findByRole("alert")).toBeInTheDocument();
	expect(call("tv:generateUploadUrl")).toHaveLength(0);
});

test("editing an html slide loads its file into the draft and saves a changed text as a new file", async () => {
	serveHtml("<p>old</p>");
	convexMock.set("tvContent:getConfigSlide", {
		...HTML_SLIDE,
		url: HTML_URL,
	});
	const { onOpenChange } = renderSheet("slide-a");
	await waitFor(() => {
		expect(field("HTML")).toHaveValue("<p>old</p>");
	});
	expect(field("Title")).toHaveValue("Welcome");
	typeInto("HTML", "<p>new</p>");
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => {
		expect(call("tvContent:updateConfigSlide")).toEqual([
			[
				"tvContent:updateConfigSlide",
				{
					id: "slide-a",
					title: "Welcome",
					durationSec: 20,
					fileId: "storage-1",
				},
			],
		]);
	});
	const upload = fetchMock.mock.calls.find(([url]) => url === UPLOAD_URL) as
		| [string, { body: File }]
		| undefined;
	expect(await upload?.[1].body.text()).toBe("<p>new</p>");
	await waitFor(() => {
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});

test("editing only the title of an html slide uploads nothing", async () => {
	serveHtml("<p>old</p>");
	convexMock.set("tvContent:getConfigSlide", {
		...HTML_SLIDE,
		url: HTML_URL,
	});
	renderSheet("slide-a");
	await waitFor(() => {
		expect(field("HTML")).toHaveValue("<p>old</p>");
	});
	typeInto("Title", "Hello");
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => {
		expect(call("tvContent:updateConfigSlide")).toEqual([
			[
				"tvContent:updateConfigSlide",
				{ id: "slide-a", title: "Hello", durationSec: 20 },
			],
		]);
	});
	expect(call("tv:generateUploadUrl")).toHaveLength(0);
});

test("an html file that cannot be loaded is explained and saving the title does not blank the file", async () => {
	fetchMock.mockRejectedValue(new Error("offline"));
	convexMock.set("tvContent:getConfigSlide", {
		...HTML_SLIDE,
		url: HTML_URL,
	});
	renderSheet("slide-a");
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Could not load the slide's HTML. Try again."
	);
	typeInto("Title", "Hello");
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => {
		expect(call("tvContent:updateConfigSlide")).toEqual([
			[
				"tvContent:updateConfigSlide",
				{ id: "slide-a", title: "Hello", durationSec: 20 },
			],
		]);
	});
	expect(call("tv:generateUploadUrl")).toHaveLength(0);
});

test("an event slide cannot be edited in the sheet", async () => {
	const eventSlide = {
		...HTML_SLIDE,
		fromEvent: true,
		eventName: "Party",
		url: HTML_URL,
	};
	serveHtml("<p>event</p>");
	convexMock.set("tvContent:listConfigSlides", [eventSlide]);
	convexMock.set("tvContent:getConfigSlide", eventSlide);
	renderSheet("slide-a");
	expect(await screen.findByRole("alert")).toHaveTextContent(
		tvMessages.TvEventSlideLocked
	);
	expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
	expect(call("tvContent:updateConfigSlide")).toHaveLength(0);
});

test("before the migration the server's refusal is shown", async () => {
	answerMutations("TvConfigNotMigrated");
	renderSheet();
	await chooseImage(new File(["png"], "poster.png", { type: "image/png" }));
	typeInto("Title", "Poster");
	fireEvent.click(screen.getByRole("button", { name: "Add slide" }));
	expect(await screen.findByRole("alert")).toHaveTextContent(
		tvMessages.TvConfigNotMigrated
	);
});

test("a refetch of the open slide does not wipe what is being typed", async () => {
	serveHtml("<p>old</p>");
	convexMock.set("tvContent:getConfigSlide", {
		...HTML_SLIDE,
		url: HTML_URL,
	});
	renderSheet("slide-a");
	await waitFor(() => {
		expect(field("HTML")).toHaveValue("<p>old</p>");
	});
	typeInto("HTML", "<p>typing</p>");
	convexMock.set("tvContent:getConfigSlide", {
		...HTML_SLIDE,
		url: HTML_URL,
		durationSec: 25,
	});
	await Promise.resolve();
	expect(field("HTML")).toHaveValue("<p>typing</p>");
});

const SLIDE_B = {
	...HTML_SLIDE,
	_id: "slide-b",
	title: "Other",
	durationSec: 45,
};
const IMAGE_SLIDE = {
	_id: "slide-i",
	title: "Poster",
	kind: "image",
	durationSec: 30,
	enabled: true,
	fromEvent: false,
	eventName: undefined,
	isMissing: false,
	url: "https://files.example.com/slide-i.png",
};

/** The component's own tick: the sheet's inputs answer a tick later. */
function settle(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 20);
	});
}

test("an image picked first, then the HTML type: the HTML is what is saved", async () => {
	const { onOpenChange } = renderSheet();
	await chooseImage(new File(["png"], "poster.png", { type: "image/png" }));
	fireEvent.click(screen.getByRole("radio", { name: "HTML" }));
	await screen.findByRole("textbox", { name: "HTML" });
	expect(screen.queryByText("poster.png")).toBeNull();
	typeInto("Title", "Hello");
	typeInto("HTML", "<p>kept</p>");
	fireEvent.click(screen.getByRole("button", { name: "Add slide" }));
	await waitFor(() => {
		expect(call("tvContent:addConfigSlide")).toEqual([
			[
				"tvContent:addConfigSlide",
				{
					title: "Hello",
					kind: "html",
					fileId: "storage-1",
					durationSec: TV_LIMITS.durationDefault,
				},
			],
		]);
	});
	await waitFor(() => {
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
	// Only the HTML went up, not the image picked first.
	expect(fetchMock).toHaveBeenCalledTimes(1);
	const [, init] = fetchMock.mock.calls[0] as [string, { body: File }];
	expect(init.body.name).toBe("slide.html");
	expect(await init.body.text()).toBe("<p>kept</p>");
});

test("an .html file chosen after an image replaces it: an HTML slide is saved", async () => {
	renderSheet();
	await chooseImage(new File(["png"], "poster.png", { type: "image/png" }));
	chooseFile(new File(["<b>page</b>"], "page.html", { type: "text/html" }));
	await waitFor(() => {
		expect(field("HTML")).toHaveValue("<b>page</b>");
	});
	expect(screen.queryByText("poster.png")).toBeNull();
	typeInto("Title", "Page");
	fireEvent.click(screen.getByRole("button", { name: "Add slide" }));
	await waitFor(() => {
		expect(call("tvContent:addConfigSlide")).toHaveLength(1);
	});
	expect(call("tvContent:addConfigSlide")[0]?.[1]).toMatchObject({
		kind: "html",
		fileId: "storage-1",
	});
	const [, init] = fetchMock.mock.calls[0] as [string, { body: File }];
	expect(init.body.name).toBe("slide.html");
	expect(await init.body.text()).toBe("<b>page</b>");
});

test("pasted HTML, then an image: an image slide is saved and the HTML is gone", async () => {
	renderSheet();
	fireEvent.click(screen.getByRole("radio", { name: "HTML" }));
	await screen.findByRole("textbox", { name: "HTML" });
	typeInto("HTML", "<p>pasted</p>");
	await chooseImage(new File(["png"], "poster.png", { type: "image/png" }));
	typeInto("Title", "Poster");
	fireEvent.click(screen.getByRole("button", { name: "Add slide" }));
	await waitFor(() => {
		expect(call("tvContent:addConfigSlide")).toHaveLength(1);
	});
	expect(call("tvContent:addConfigSlide")[0]?.[1]).toEqual({
		title: "Poster",
		kind: "image",
		fileId: "storage-1",
		durationSec: TV_LIMITS.durationDefault,
	});
	fireEvent.click(screen.getByRole("radio", { name: "HTML" }));
	expect(await screen.findByRole("textbox", { name: "HTML" })).toHaveValue(
		""
	);
});

test("opening another slide does not keep the last one's draft or let it be saved", async () => {
	convexMock.set("tvContent:listConfigSlides", [HTML_SLIDE, SLIDE_B]);
	serveFiles({
		[HTML_URL]: "<p>A</p>",
		"https://files.example.com/slide-b.html": "<p>B</p>",
	});
	convexMock.set("tvContent:getConfigSlide", {
		...HTML_SLIDE,
		url: HTML_URL,
	});
	const [slideId, setSlideId] = createSignal<string | undefined>("slide-a");
	render(() => (
		<SlideSheet open onOpenChange={vi.fn()} slideId={slideId()} />
	));
	await waitFor(() => {
		expect(field("HTML")).toHaveValue("<p>A</p>");
	});
	setSlideId("slide-b");
	// B's record has not arrived: A's detail is still the one in hand.
	await waitFor(() => {
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
	});
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await settle();
	expect(call("tvContent:updateConfigSlide")).toHaveLength(0);
	convexMock.set("tvContent:getConfigSlide", {
		...SLIDE_B,
		url: "https://files.example.com/slide-b.html",
	});
	await waitFor(() => {
		expect(field("HTML")).toHaveValue("<p>B</p>");
	});
	expect(field("Title")).toHaveValue("Other");
	expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => {
		expect(call("tvContent:updateConfigSlide")).toEqual([
			[
				"tvContent:updateConfigSlide",
				{
					id: "slide-b",
					title: "Other",
					durationSec: 45,
				},
			],
		]);
	});
});

/** A save that stays open until the test lets it finish. */
function holdCreate() {
	let release: ((value: null) => void) | undefined;
	convexMock.mutate.mockImplementation((name) => {
		if (name !== "tvContent:addConfigSlide") return Promise.resolve(null);
		return new Promise<null>((resolve) => {
			release = resolve;
		});
	});
	// The save is reached after the file's upload, a few ticks in.
	async function finish(): Promise<void> {
		await waitFor(() => {
			expect(release).toBeDefined();
		});
		release?.(null);
	}
	return finish;
}

async function startHtmlSave() {
	fireEvent.click(screen.getByRole("radio", { name: "HTML" }));
	await screen.findByRole("textbox", { name: "HTML" });
	typeInto("Title", "Hello");
	typeInto("HTML", "<p>x</p>");
	fireEvent.click(screen.getByRole("button", { name: "Add slide" }));
}

test("while saving the button says so and cannot be pressed again", async () => {
	const finish = holdCreate();
	renderSheet();
	await startHtmlSave();
	const saving = await screen.findByRole("button", { name: "Saving..." });
	expect(saving).toBeDisabled();
	await finish();
	await waitFor(() => {
		expect(screen.getByRole("button", { name: "Add slide" })).toBeEnabled();
	});
});

test("a slow save does not close a sheet that was closed meanwhile", async () => {
	const finish = holdCreate();
	const onOpenChange = vi.fn();
	const [isOpen, setOpen] = createSignal(true);
	render(() => (
		<SlideSheet
			open={isOpen()}
			onOpenChange={onOpenChange}
			slideId={undefined}
		/>
	));
	await startHtmlSave();
	await screen.findByRole("button", { name: "Saving..." });
	setOpen(false);
	await settle();
	setOpen(true);
	await settle();
	await finish();
	// A negative: nothing to wait for, so a pause lets a wrong close show up
	// (it can only make this pass too early, never fail).
	await settle();
	expect(call("tvContent:addConfigSlide")).toHaveLength(1);
	expect(onOpenChange).not.toHaveBeenCalled();
});

test("a duration out of range is explained and nothing is saved", async () => {
	renderSheet();
	typeInto("Title", "Poster");
	await chooseImage(new File(["png"], "poster.png", { type: "image/png" }));
	const seconds = screen.getByRole("spinbutton", {
		name: "Seconds on screen",
	});
	await waitFor(() => {
		seconds.focus();
		expect(seconds).toHaveFocus();
	});
	fireEvent.input(seconds, { target: { value: "0" } });
	expect(
		await screen.findByText(/whole number of seconds/)
	).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Add slide" }));
	await settle();
	expect(call("tvContent:addConfigSlide")).toHaveLength(0);
	expect(call("tv:generateUploadUrl")).toHaveLength(0);
});

test("pasted HTML over the limit shows the count and cannot be saved", async () => {
	renderSheet();
	fireEvent.click(screen.getByRole("radio", { name: "HTML" }));
	await screen.findByRole("textbox", { name: "HTML" });
	expect(screen.getByText(/0 of 400,000 bytes/)).toBeInTheDocument();
	typeInto("HTML", "x".repeat(TV_LIMITS.htmlMax + 1));
	expect(
		await screen.findByText(/Too long: 400,001 of 400,000 bytes/)
	).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Add slide" }));
	await settle();
	expect(call("tvContent:addConfigSlide")).toHaveLength(0);
});

test("an upload is not discarded when the save merely fails to get through (the save may have gone through)", async () => {
	convexMock.mutate.mockImplementation((name) => {
		if (name === "tv:generateUploadUrl") return Promise.resolve(UPLOAD_URL);
		if (name === "tvContent:addConfigSlide")
			return Promise.reject(new Error("network down"));
		return Promise.resolve(null);
	});
	const { onOpenChange } = renderSheet();
	await chooseImage(new File(["png"], "poster.png", { type: "image/png" }));
	typeInto("Title", "Poster");
	fireEvent.click(screen.getByRole("button", { name: "Add slide" }));
	expect(await screen.findByRole("alert")).toBeInTheDocument();
	await settle();
	expect(call("tv:discardUpload")).toHaveLength(0);
	expect(onOpenChange).not.toHaveBeenCalled();
});

test("replacing an image on an existing slide: a refused save discards the new upload", async () => {
	convexMock.set("tvContent:listConfigSlides", [IMAGE_SLIDE]);
	convexMock.set("tvContent:getConfigSlide", IMAGE_SLIDE);
	convexMock.mutate.mockImplementation((name) => {
		if (name === "tv:generateUploadUrl") return Promise.resolve(UPLOAD_URL);
		if (name === "tvContent:updateConfigSlide")
			return Promise.reject(
				new ConvexError({
					code: "TvImageInvalid",
					message: tvMessages.TvImageInvalid,
				})
			);
		return Promise.resolve(null);
	});
	renderSheet("slide-i");
	await waitFor(() => {
		expect(field("Title")).toHaveValue("Poster");
	});
	await chooseImage(new File(["png"], "new.png", { type: "image/png" }));
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	expect(await screen.findByRole("alert")).toHaveTextContent(
		tvMessages.TvImageInvalid
	);
	expect(call("tvContent:updateConfigSlide")[0]?.[1]).toEqual({
		id: "slide-i",
		title: "Poster",
		durationSec: 30,
		fileId: "storage-1",
	});
	expect(call("tv:discardUpload")).toEqual([
		["tv:discardUpload", { fileId: "storage-1" }],
	]);
});

const GONE = "This slide is no longer there";

test("a slide id the backend does not know (list still loading, record null) shows a gone state and cannot be saved", async () => {
	convexMock.set("tvContent:listConfigSlides", undefined);
	convexMock.set("tvContent:getConfigSlide", null);
	renderSheet("deleted-slide");
	expect(await screen.findByText(GONE)).toBeInTheDocument();
	expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
	expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("a slide that disappears while open gives way to the gone state", async () => {
	convexMock.set("tvContent:getConfigSlide", { ...HTML_SLIDE, url: null });
	serveHtml("<p>A</p>");
	renderSheet("slide-a");
	await waitFor(() => {
		expect(field("Title")).toHaveValue("Welcome");
	});
	convexMock.set("tvContent:listConfigSlides", []);
	convexMock.set("tvContent:getConfigSlide", null);
	expect(await screen.findByText(GONE)).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	expect(call("tvContent:updateConfigSlide")).toHaveLength(0);
});
