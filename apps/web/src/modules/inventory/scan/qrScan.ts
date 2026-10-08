export type QrScanCode = "unsupported" | "permission" | "unavailable";

export class QrScanError extends Error {
	code: QrScanCode;

	constructor(code: QrScanCode, message: string) {
		super(message);
		this.name = "QrScanError";
		this.code = code;
	}
}

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

/**
 * Stream the rear camera into `video` and call `onDetect` with each QR payload
 * until `signal` aborts. Stops every media track on abort.
 */
export async function startQrScan(
	video: QrVideo,
	onDetect: (raw: string) => void,
	signal: AbortSignal
): Promise<void> {
	const Detector = detectorCtor();
	if (Detector === undefined) {
		throw new QrScanError(
			"unsupported",
			"This browser can't scan QR codes."
		);
	}

	let stream: MediaStream;
	try {
		stream = await navigator.mediaDevices.getUserMedia({
			video: { facingMode: { ideal: "environment" } },
			audio: false,
		});
	} catch (err) {
		const name = errorName(err);
		if (name === "NotAllowedError" || name === "SecurityError") {
			throw new QrScanError(
				"permission",
				"Camera access is needed to scan. Allow it in the browser and try again."
			);
		}
		throw new QrScanError(
			"unavailable",
			"No camera is available on this device."
		);
	}

	function stop(): void {
		for (const track of stream.getTracks()) track.stop();
		video.srcObject = null;
	}

	function isAborted(): boolean {
		return signal.aborted;
	}

	if (isAborted()) {
		stop();
		return;
	}
	signal.addEventListener("abort", stop, { once: true });

	video.srcObject = stream;
	await video.play();

	const detector = new Detector({ formats: ["qr_code"] });
	while (!isAborted()) {
		try {
			const codes = await detector.detect(video);
			if (codes.length > 0) {
				const value = codes[0].rawValue;
				if (value !== "") onDetect(value);
			}
		} catch {
			// Video may not be ready on the first frames.
		}
		await waitFrame(signal);
	}
}
