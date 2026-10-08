// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { QrScanError, startQrScan } from "./qrScan.ts";

function detectorHost(): { BarcodeDetector?: unknown } {
	return globalThis as unknown as { BarcodeDetector?: unknown };
}

const originalDetector = detectorHost().BarcodeDetector;
const originalMedia = navigator.mediaDevices;

afterEach(() => {
	detectorHost().BarcodeDetector = originalDetector;
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		writable: true,
		value: originalMedia,
	});
});

function videoStub() {
	return {
		srcObject: null as MediaStream | null,
		play: vi.fn().mockResolvedValue(undefined),
	};
}

describe("startQrScan", () => {
	it("throws unsupported when BarcodeDetector is missing", async () => {
		delete detectorHost().BarcodeDetector;
		await expect(
			startQrScan(videoStub(), vi.fn(), new AbortController().signal)
		).rejects.toMatchObject({
			name: "QrScanError",
			code: "unsupported",
		});
	});

	it("throws permission when getUserMedia is denied", async () => {
		detectorHost().BarcodeDetector = class {
			detect() {
				return Promise.resolve([]);
			}
		};
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			writable: true,
			value: {
				getUserMedia: vi.fn().mockRejectedValue(
					Object.assign(new Error("denied"), {
						name: "NotAllowedError",
					})
				),
			},
		});
		await expect(
			startQrScan(videoStub(), vi.fn(), new AbortController().signal)
		).rejects.toBeInstanceOf(QrScanError);
		await expect(
			startQrScan(videoStub(), vi.fn(), new AbortController().signal)
		).rejects.toMatchObject({ code: "permission" });
	});

	it("emits the first decoded value and stops tracks on abort", async () => {
		const stop = vi.fn();
		const stream = {
			getTracks: () => [{ stop }],
		} as unknown as MediaStream;
		detectorHost().BarcodeDetector = class {
			detect() {
				return Promise.resolve([{ rawValue: "A00001" }]);
			}
		};
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			writable: true,
			value: {
				getUserMedia: vi.fn().mockResolvedValue(stream),
			},
		});
		const video = videoStub();
		const onDetect = vi.fn();
		const ac = new AbortController();
		const run = startQrScan(video, onDetect, ac.signal);
		await vi.waitFor(() => {
			expect(onDetect).toHaveBeenCalledWith("A00001");
		});
		ac.abort();
		await run;
		expect(stop).toHaveBeenCalled();
		expect(video.srcObject).toBeNull();
	});
});
