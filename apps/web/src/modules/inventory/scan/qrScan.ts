import { err, ok, Result, ResultAsync } from "neverthrow";

export type QrScanCode = "unsupported" | "permission" | "unavailable";

/** Why the camera scan could not start. */
export type QrScanFailure = { code: QrScanCode };

export type QrVideo = {
	srcObject: HTMLVideoElement["srcObject"];
	play: () => Promise<void>;
};

type DetectedBarcode = { rawValue: string };

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => {
	detect: (source: QrVideo) => Promise<DetectedBarcode[]>;
};

function detectorCtor(): BarcodeDetectorCtor | undefined {
	return (globalThis as { BarcodeDetector?: BarcodeDetectorCtor })
		.BarcodeDetector;
}

function errorName(err: unknown): string | undefined {
	if (typeof err === "object" && err !== null && "name" in err) {
		const name = err.name;
		return typeof name === "string" ? name : undefined;
	}
	return undefined;
}

function waitFrame(signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal.aborted) {
			resolve();
			return;
		}
		function done(): void {
			resolve();
		}
		signal.addEventListener("abort", done, { once: true });
		if (typeof requestAnimationFrame === "function") {
			requestAnimationFrame(done);
		} else {
			setTimeout(done, 0);
		}
	});
}

/** Reports the first non-empty code in the current frame, if any. A frame
 *  that cannot be read yet (the video may not be ready on the first frames)
 *  is skipped. */
async function reportFirstCode(
	detector: InstanceType<BarcodeDetectorCtor>,
	video: QrVideo,
	onDetect: (raw: string) => void
): Promise<void> {
	const codes = await ResultAsync.fromPromise(
		detector.detect(video),
		() => "frame not readable"
	);
	if (codes.isErr() || codes.value.length === 0) return;
	const value = codes.value[0].rawValue;
	if (value !== "") onDetect(value);
}

function cameraFailure(error: unknown): QrScanFailure {
	const name = errorName(error);
	return {
		code:
			name === "NotAllowedError" || name === "SecurityError"
				? "permission"
				: "unavailable",
	};
}

/**
 * Stream the rear camera into `video` and call `onDetect` with each QR payload
 * until `signal` aborts. Stops every media track on abort.
 */
export async function startQrScan(
	video: QrVideo,
	onDetect: (raw: string) => void,
	signal: AbortSignal
): Promise<Result<void, QrScanFailure>> {
	const Detector = detectorCtor();
	if (Detector === undefined) return err({ code: "unsupported" });

	const camera = await ResultAsync.fromPromise(
		navigator.mediaDevices.getUserMedia({
			video: { facingMode: { ideal: "environment" } },
			audio: false,
		}),
		cameraFailure
	);
	if (camera.isErr()) return err(camera.error);
	const stream = camera.value;

	function stop(): void {
		for (const track of stream.getTracks()) track.stop();
		video.srcObject = null;
	}

	function isAborted(): boolean {
		return signal.aborted;
	}

	if (isAborted()) {
		stop();
		return ok();
	}
	signal.addEventListener("abort", stop, { once: true });

	video.srcObject = stream;
	const playing = await ResultAsync.fromPromise(
		video.play(),
		(): QrScanFailure => ({ code: "unavailable" })
	);
	if (playing.isErr()) {
		stop();
		return err(playing.error);
	}

	const detector = new Detector({ formats: ["qr_code"] });
	while (!isAborted()) {
		await reportFirstCode(detector, video, onDetect);
		await waitFrame(signal);
	}
	return ok();
}
