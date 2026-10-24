/**
 * A real-browser probe of the morph, for chrome-devtools-axi's `run` (it
 * hands the script a global `page`). It opens the playground's Morph demo,
 * opens the first card into its sheet and closes it again, and prints, per
 * transition, every animation frame's view-transition pseudo-elements
 * (rect and opacity) and the time from `ready` to `finished`. A gap of 0
 * means the browser skipped the transition; one under half the morph's
 * duration (`--jf-animation-duration-morph`) is flagged as likely skipped.
 * Not run in CI; see docs/design-system/morph.md. From the repository root:
 *
 *   bun run --cwd packages/design-system demo &
 *   npx -y chrome-devtools-axi run < packages/design-system/scripts/morph-probe.js
 *   kill %1
 *
 * `MORPH_PROBE_URL` points it at another port when Vite picked one.
 */

const PLAYGROUND = process.env.MORPH_PROBE_URL ?? "http://localhost:5173/";
const SETTLE_MS = 1500;
const SOURCE = '[data-morph-of="card-1"] button';

const POLL_MS = 100;
const POLL_TRIES = 100;

function pause(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function settle() {
	return pause(SETTLE_MS);
}

/** Presses `selector` as a pointer would: a pointerdown (what the morph
 *  records as the activation), then a click. In the page, as
 *  `page.click(selector)` is unreliable. */
async function press(selector) {
	await page.eval(`(() => {
		const target = document.querySelector(${JSON.stringify(selector)});
		target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		target.click();
	})()`);
}

/** Waits for `selector` by polling (`page.wait(selector)` is unreliable). */
async function waitFor(selector) {
	for (let tries = 0; tries < POLL_TRIES; tries += 1) {
		const found = await page.eval(
			`document.querySelector(${JSON.stringify(selector)}) !== null`
		);
		if (found) return;
		await pause(POLL_MS);
	}
	throw new Error(`morph-probe: ${selector} never appeared`);
}

/** Runs in the page: wraps `startViewTransition` so each call records its
 *  frames and its ready→finished gap in `window.__morphProbe`. */
const install = () => {
	const probe = { transitions: [] };
	window.__morphProbe = probe;
	const start = document.startViewTransition.bind(document);
	function pseudoNames() {
		return document
			.getAnimations()
			.map((animation) => animation.effect?.pseudoElement)
			.filter((name) => name?.startsWith("::view-transition-"));
	}
	function sample(record) {
		record.kinds = document.documentElement.dataset.vt || record.kinds;
		const frame = { at: performance.now() - record.startedAt, groups: {} };
		for (const name of new Set(pseudoNames())) {
			const style = getComputedStyle(document.documentElement, name);
			frame.groups[name] = {
				width: style.width,
				height: style.height,
				transform: style.transform,
				opacity: style.opacity,
			};
		}
		record.frames.push(frame);
	}
	document.startViewTransition = (update) => {
		const record = {
			startedAt: performance.now(),
			kinds: document.documentElement.dataset.vt ?? "",
			frames: [],
		};
		probe.transitions.push(record);
		const transition = start(update);
		let isRunning = true;
		function tick() {
			if (!isRunning) return;
			sample(record);
			requestAnimationFrame(tick);
		}
		requestAnimationFrame(tick);
		transition.ready.then(
			() => {
				record.readyAt = performance.now() - record.startedAt;
			},
			() => {
				record.readyAt = "rejected";
			}
		);
		transition.finished.finally(() => {
			isRunning = false;
			record.finishedAt = performance.now() - record.startedAt;
		});
		return transition;
	};
};

/** Runs in the page: the morph's duration in ms, from its token. */
const morphDuration = () => {
	const value = getComputedStyle(document.documentElement)
		.getPropertyValue("--jf-animation-duration-morph")
		.trim();
	const amount = Number.parseFloat(value);
	return value.endsWith("ms") ? amount : amount * 1000;
};

/** Runs in the page: what each recorded transition did. */
const summary = () =>
	window.__morphProbe.transitions.map((record) => ({
		kinds: record.kinds,
		ready: record.readyAt,
		finished: record.finishedAt,
		gap:
			typeof record.readyAt === "number"
				? record.finishedAt - record.readyAt
				: 0,
		frames: record.frames.length,
		names: [
			...new Set(record.frames.flatMap((f) => Object.keys(f.groups))),
		],
		perFrame: record.frames,
	}));

await page.open(PLAYGROUND);
await page.eval(() => {
	const rail = [...document.querySelectorAll("aside button")];
	rail.find((button) => button.textContent?.trim() === "Morph")?.click();
});
await waitFor(SOURCE);
await page.eval(install);
// Twice: a sheet's first open builds its body inside the morph, so only a
// later open pairs the values.
for (const round of [1, 2]) {
	await press(SOURCE);
	await settle();
	await page.press("Escape");
	await settle();
	console.log(`round ${round} done`);
}
const result = await page.eval(summary);
const morphMs = await page.eval(morphDuration);
console.log(`morph duration ${morphMs} ms`);
for (const [index, transition] of result.entries()) {
	let skipped = "";
	if (transition.gap === 0) skipped = " (SKIPPED)";
	else if (transition.gap < morphMs / 2) skipped = " (LIKELY SKIPPED: short)";
	console.log(
		`#${index} ${transition.kinds}: ready ${transition.ready} ms, finished ${transition.finished} ms, gap ${transition.gap} ms${skipped}, ${transition.frames} frames`
	);
	console.log(`   animated: ${transition.names.join(", ")}`);
}
console.log(JSON.stringify(result, null, "\t"));
