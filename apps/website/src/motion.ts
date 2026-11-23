const presets = {
	heading: { distance: 8, opacity: 0.9, duration: 520 },
	image: { distance: 12, opacity: 0.92, duration: 640 },
	row: { distance: 6, opacity: 0.9, duration: 380 },
};
function enter(target: HTMLElement) {
	const kind = target.dataset.entrance as keyof typeof presets;
	const preset = presets[kind];
	return target.animate(
		[
			{
				opacity: preset.opacity,
				transform: `translateY(${preset.distance}px)`,
			},
			{ opacity: 1, transform: "translateY(0)" },
		],
		{
			duration: preset.duration,
			delay:
				kind === "row"
					? Math.min(Number(target.dataset.order ?? 0) * 40, 80)
					: 0,
			easing: "cubic-bezier(0.22, 1, 0.36, 1)",
		}
	);
}
export function enhanceEntrances(root: HTMLElement) {
	const reduced = matchMedia("(prefers-reduced-motion: reduce)");
	if (
		reduced.matches ||
		location.hash ||
		window.scrollY > 0 ||
		!("IntersectionObserver" in window) ||
		!("animate" in Element.prototype)
	)
		return () => {};
	const running = new Map<Element, Animation>();
	function settle() {
		running.forEach((animation) => {
			animation.cancel();
		});
		running.clear();
	}
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const target = entry.target as HTMLElement;
				observer.unobserve(target);
				if (
					reduced.matches ||
					target.matches(":focus-within") ||
					document.hidden
				)
					continue;
				try {
					const animation = enter(target);
					running.set(target, animation);
					void animation.finished
						.then(() => running.delete(target))
						.catch(() => {});
				} catch {
					/* The visible baseline remains available. */
				}
			}
		},
		{ rootMargin: "0px 0px -32px 0px", threshold: 0 }
	);
	root.querySelectorAll("[data-entrance]").forEach((target) => {
		observer.observe(target);
	});
	function focus(event: FocusEvent) {
		const target =
			event.target instanceof Element
				? event.target.closest("[data-entrance]")
				: null;
		if (!target) return;
		observer.unobserve(target);
		running.get(target)?.cancel();
		running.delete(target);
	}
	function hide() {
		if (document.hidden) settle();
	}
	function preference() {
		observer.disconnect();
		settle();
	}
	root.addEventListener("focusin", focus);
	document.addEventListener("visibilitychange", hide);
	reduced.addEventListener("change", preference);
	window.addEventListener("beforeprint", preference);
	return () => {
		observer.disconnect();
		settle();
		root.removeEventListener("focusin", focus);
		document.removeEventListener("visibilitychange", hide);
		reduced.removeEventListener("change", preference);
		window.removeEventListener("beforeprint", preference);
	};
}
