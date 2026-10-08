// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

const { mockStart } = vi.hoisted(() => ({ mockStart: vi.fn() }));

vi.mock("./qrScan.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./qrScan.ts")>();
	return { ...actual, startQrScan: mockStart };
});

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

import { QrScanError } from "./qrScan.ts";
import { QrScannerDialog } from "./QrScannerDialog.tsx";

afterEach(() => {
	cleanup();
	mockStart.mockReset();
});

function hangUntilAbort() {
	mockStart.mockImplementation(
		(_video: unknown, _onDetect: unknown, signal: AbortSignal) =>
			new Promise<void>((resolve) => {
				signal.addEventListener(
					"abort",
					() => {
						resolve();
					},
					{ once: true }
				);
			})
	);
}

test("shows the scan hint while the camera is running", async () => {
	hangUntilAbort();
	render(() => (
		<QrScannerDialog open onOpenChange={() => {}} onDetect={() => {}} />
	));
	expect(await screen.findByText("Scan asset tag")).toBeInTheDocument();
	expect(
		screen.getByText("Point the camera at the QR code")
	).toBeInTheDocument();
});

test("shows unsupported copy when the decoder rejects as unsupported", async () => {
	mockStart.mockRejectedValue(new QrScanError("unsupported", "internal"));
	render(() => (
		<QrScannerDialog open onOpenChange={() => {}} onDetect={() => {}} />
	));
	expect(
		await screen.findByText("This browser can't scan QR codes.")
	).toBeInTheDocument();
});

test("shows permission copy when the decoder rejects as permission", async () => {
	mockStart.mockRejectedValue(new QrScanError("permission", "internal"));
	render(() => (
		<QrScannerDialog open onOpenChange={() => {}} onDetect={() => {}} />
	));
	expect(
		await screen.findByText(
			"Camera access is needed to scan. Allow it in the browser and try again."
		)
	).toBeInTheDocument();
});

test("forwards a detected payload", async () => {
	const onDetect = vi.fn();
	mockStart.mockImplementation(
		(
			_video: unknown,
			detect: (raw: string) => void,
			signal: AbortSignal
		) => {
			detect("A00001");
			return new Promise<void>((resolve) => {
				signal.addEventListener(
					"abort",
					() => {
						resolve();
					},
					{ once: true }
				);
			});
		}
	);
	render(() => (
		<QrScannerDialog open onOpenChange={() => {}} onDetect={onDetect} />
	));
	await vi.waitFor(() => {
		expect(onDetect).toHaveBeenCalledWith("A00001");
	});
});

test("shows an invalid-tag error from the parent", async () => {
	hangUntilAbort();
	render(() => (
		<QrScannerDialog
			open
			onOpenChange={() => {}}
			onDetect={() => {}}
			error="This QR isn't an asset tag (expected e.g. A00000)."
		/>
	));
	expect(
		await screen.findByText(
			"This QR isn't an asset tag (expected e.g. A00000)."
		)
	).toBeInTheDocument();
});
