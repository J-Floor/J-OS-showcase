// The page must finish loading before we leave, so the Cloudflare Web
// Analytics page-load beacon can record the scan of the window QR code.
export function redirectHomeAfterLoad(
	go: () => void = () => {
		location.replace("/");
	},
	delayMs = 400
) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	function start() {
		timer = setTimeout(go, delayMs);
	}
	if (document.readyState === "complete") start();
	else addEventListener("load", start, { once: true });
	return () => {
		removeEventListener("load", start);
		clearTimeout(timer);
	};
}
