import { downloadBlob } from "../../../shared/downloadBlob.ts";

/** Trigger a browser download of PDF bytes under `filename`. */
export function downloadPdf(bytes: Uint8Array, filename: string): void {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	downloadBlob(new Blob([copy], { type: "application/pdf" }), filename);
}
