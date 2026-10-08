// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

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
	};
});

afterEach(cleanup);

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

test("EntityQrActions wires the download trigger with the given fileName", () => {
	render(() => (
		<EntityQrActions
			url="https://jfloor.test/visit/abc"
			fileName="abc-qr.png"
		/>
	));

	const trigger = screen.getByTestId("download-trigger");
	expect(trigger.dataset.filename).toBe("abc-qr.png");
	expect(trigger.dataset.mimetype).toBe("image/png");
	expect(
		screen.getByRole("button", { name: "Download QR" })
	).toBeInTheDocument();
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

test("EntityQrActions renders the QR frame the download rasterises", () => {
	const { container } = render(() => (
		<EntityQrActions
			url="https://jfloor.test/visit/abc"
			fileName="abc-qr.png"
		/>
	));

	// zag's download looks the frame SVG up by id; with no frame in the DOM
	// the click silently downloads nothing.
	expect(
		container.querySelector('svg[data-part="frame"]')
	).toBeInTheDocument();
});
