// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { downloadHref } from "../downloadBlob.ts";
import { toaster } from "../toaster.ts";

import { EntityQrActions, EntityQrBlock } from "./EntityQr.tsx";

// The real `QrCode.DownloadTrigger` rasterises the QR SVG to a data URL
// (canvas) before it ever touches the DOM — jsdom has no canvas backend, so
// that resolves nowhere and the click is unobservable. Stub just the trigger
// so we can assert what our components hand it (`fileName`/`mimeType`)
// without depending on ark's internal download plumbing.
vi.mock("@ark-ui/solid/qr-code", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@ark-ui/solid/qr-code")>();
	return {
		...actual,
		QrCode: {
			...actual.QrCode,
			DownloadTrigger: (props: {
				fileName: string;
				mimeType: string;
				asChild: (
					triggerProps: () => Record<string, unknown>
				) => JSX.Element;
			}) => (
				<div
					data-testid="download-trigger"
					data-filename={props.fileName}
					data-mimetype={props.mimeType}
				>
					{props.asChild(() => ({}))}
				</div>
			),
		},
		// The row's one-shot QR rasterises through `getDataUrl`, which needs a
		// canvas: keep the real machine (so the frame renders) and stub only
		// the rasterise, noting whether zag's frame was in the DOM to read.
		useQrCode: (props: Parameters<typeof actual.useQrCode>[0]) => {
			const qr = actual.useQrCode(props);
			return () => ({
				...qr(),
				getDataUrl: (type: string) => {
					rasterised.push({
						type,
						hadFrame:
							document.querySelector('svg[data-part="frame"]') !==
							null,
					});
					return shouldRasteriseFail
						? Promise.reject(new Error("no canvas"))
						: Promise.resolve(`data:${type};base64,stub`);
				},
			});
		},
	};
});

vi.mock("../downloadBlob.ts", () => ({ downloadHref: vi.fn() }));
vi.mock("../toaster.ts", () => ({ toaster: { create: vi.fn() } }));

const rasterised: { type: string; hadFrame: boolean }[] = [];
let shouldRasteriseFail = false;

afterEach(() => {
	cleanup();
	rasterised.length = 0;
	shouldRasteriseFail = false;
	vi.mocked(downloadHref).mockClear();
	vi.mocked(toaster.create).mockClear();
});

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
	writeText = vi.fn().mockResolvedValue(undefined);
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText },
		configurable: true,
	});
});

test("EntityQrActions copies the url and swaps to a Copied state", () => {
	render(() => (
		<EntityQrActions
			url="https://jfloor.test/visit/abc"
			fileName="abc-qr.png"
		/>
	));

	const copyButton = screen.getByRole("button", { name: "Copy link" });
	fireEvent.click(copyButton);

	expect(writeText).toHaveBeenCalledWith("https://jfloor.test/visit/abc");
	expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
});

test("EntityQrActions builds no QR until Download QR is pressed", () => {
	const { container } = render(() => (
		<EntityQrActions
			url="https://jfloor.test/visit/abc"
			fileName="abc-qr.png"
		/>
	));

	// A QR per row is encoded at mount otherwise, on every table open.
	expect(container.querySelector('[data-scope="qr-code"]')).toBeNull();
	expect(
		screen.getByRole("button", { name: "Download QR" })
	).toBeInTheDocument();
});

test("EntityQrActions downloads the QR as a PNG named fileName on press", async () => {
	const { container } = render(() => (
		<EntityQrActions
			url="https://jfloor.test/visit/abc"
			fileName="abc-qr.png"
		/>
	));

	fireEvent.click(screen.getByRole("button", { name: "Download QR" }));

	await waitFor(() => {
		expect(downloadHref).toHaveBeenCalledWith(
			"data:image/png;base64,stub",
			"abc-qr.png"
		);
	});
	// zag looks the frame up in the DOM to rasterise it.
	expect(rasterised).toEqual([{ type: "image/png", hadFrame: true }]);
	await waitFor(() => {
		expect(container.querySelector('[data-scope="qr-code"]')).toBeNull();
	});
});

test("EntityQrActions toasts a failed QR download and frees the button", async () => {
	shouldRasteriseFail = true;
	render(() => (
		<EntityQrActions
			url="https://jfloor.test/visit/abc"
			fileName="abc-qr.png"
		/>
	));

	fireEvent.click(screen.getByRole("button", { name: "Download QR" }));

	await waitFor(() => {
		expect(toaster.create).toHaveBeenCalledWith(
			expect.objectContaining({ type: "error" })
		);
	});
	expect(downloadHref).not.toHaveBeenCalled();
	expect(screen.getByRole("button", { name: "Download QR" })).toBeEnabled();
});

test("EntityQrBlock copies the url and swaps its Copy link button to Copied", () => {
	render(() => (
		<EntityQrBlock
			url="https://jfloor.test/visit/abc"
			fileName="abc-qr.png"
		/>
	));

	const copyButton = screen.getByRole("button", { name: /Copy link/ });
	fireEvent.click(copyButton);

	expect(writeText).toHaveBeenCalledWith("https://jfloor.test/visit/abc");
	expect(screen.getByRole("button", { name: /Copied/ })).toBeInTheDocument();
});

test("EntityQrBlock wires the download trigger with the given fileName", () => {
	render(() => (
		<EntityQrBlock
			url="https://jfloor.test/visit/abc"
			fileName="abc-qr.png"
		/>
	));

	const trigger = screen.getByTestId("download-trigger");
	expect(trigger.dataset.filename).toBe("abc-qr.png");
	expect(trigger.dataset.mimetype).toBe("image/png");
	expect(
		screen.getByRole("button", { name: /Download QR/ })
	).toBeInTheDocument();
});
