import { createSignal, onCleanup, onMount, untrack } from "solid-js";

const duration = 2400;
const easingPower = 3;

export function CountUp(props: {
	value: number;
	prefix: string;
	suffix: string;
}) {
	const [value, setValue] = createSignal(untrack(() => props.value));
	let element: HTMLSpanElement | undefined;

	onMount(() => {
		const reduced = matchMedia("(prefers-reduced-motion: reduce)");
		if (reduced.matches || typeof IntersectionObserver === "undefined")
			return;
		let frame = 0;
		let hasStarted = false;
		const observer = new IntersectionObserver(
			(entries) => {
				if (
					hasStarted ||
					!entries.some((entry) => entry.isIntersecting)
				)
					return;
				hasStarted = true;
				observer.disconnect();
				const start = performance.now();
				setValue(0);
				function tick(now: number) {
					const progress = Math.min(
						Math.max((now - start) / duration, 0),
						1
					);
					setValue(
						Math.round(
							props.value * (1 - (1 - progress) ** easingPower)
						)
					);
					if (progress < 1) frame = requestAnimationFrame(tick);
				}
				frame = requestAnimationFrame(tick);
			},
			{ threshold: 0.5 }
		);
		if (element) observer.observe(element);
		function settle() {
			observer.disconnect();
			cancelAnimationFrame(frame);
			setValue(props.value);
		}
		reduced.addEventListener("change", settle);
		window.addEventListener("beforeprint", settle);
		onCleanup(() => {
			settle();
			reduced.removeEventListener("change", settle);
			window.removeEventListener("beforeprint", settle);
		});
	});

	return (
		<span
			ref={(node) => {
				element = node;
			}}
			role="img"
			aria-label={`${props.prefix}${props.value}${props.suffix}`}
		>
			<span aria-hidden="true">
				{props.prefix}
				{value()}
				{props.suffix}
			</span>
		</span>
	);
}
