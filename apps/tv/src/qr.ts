import qrcode from "qrcode-generator";

/** The QR as an SVG element. The generator emits only its own markup from the payload, no payload text. */
export function renderQr(payload: string): Element {
	const code = qrcode(0, "M");
	code.addData(payload);
	code.make();
	const svg = code.createSvgTag({ cellSize: 1, margin: 2, scalable: true });
	const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
	return document.importNode(parsed.documentElement, true);
}
