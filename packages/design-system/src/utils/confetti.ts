import confetti from "canvas-confetti";

/**
 * Fire a small confetti burst localised to `origin` — an element (burst from its
 * centre) or a normalised viewport point `{ x, y }` (0–1). Defaults to centre.
 * Uses canvas-confetti's shared full-viewport canvas but anchors the burst to
 * the source, so it reads as coming from that control rather than the page.
 * Respects `prefers-reduced-motion`.
 */
export function fireConfetti(origin?: HTMLElement | { x: number; y: number }) {
	let x = 0.5;
	let y = 0.5;
	if (origin instanceof HTMLElement) {
		const rect = origin.getBoundingClientRect();
		// A detached element measures 0×0 — fall back to centre rather than 0,0.
		if (rect.width > 0 || rect.height > 0) {
			x = (rect.left + rect.width / 2) / window.innerWidth;
			y = (rect.top + rect.height / 2) / window.innerHeight;
		}
	} else if (origin) {
		x = origin.x;
		y = origin.y;
	}
	void confetti({
		origin: { x, y },
		particleCount: 18,
		spread: 60,
		angle: 90, // straight up, then gravity pulls it back down
		startVelocity: 10, // small initial pop (~10px rise)
		gravity: 1.2,
		decay: 0.9,
		scalar: 0.6,
		ticks: 30, // ~0.5s lifetime at 60fps
		// Above overlays (drawers/dialogs at --jf-z-index-overlay-base: 1000,
		// tooltips at 1100) so a burst from inside a drawer isn't hidden behind it.
		zIndex: 2000,
		disableForReducedMotion: true,
	});
}
