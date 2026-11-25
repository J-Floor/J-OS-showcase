import type { PowerBackend } from "./power.ts";
import { isOnAt, nextChange, type Schedule } from "./schedule.ts";

export type PowerController = {
	setSchedule(schedule: Schedule | undefined): void;
	/** Re-evaluates against the clock now, e.g. after it was corrected. */
	refresh(): void;
	stop(): void;
};

const SECOND_MS = 1000;
const DAY_MS = 86_400_000;

export function createPowerController(
	backend: PowerBackend,
	now: () => Date = () => new Date()
): PowerController {
	let schedule: Schedule | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let isCurrentlyOn: boolean | undefined;
	let isStopped = false;

	function apply(isOn: boolean): void {
		if (isOn === isCurrentlyOn) return;
		try {
			if (isOn) backend.screenOn();
			else backend.screenOff();
			isCurrentlyOn = isOn;
		} catch {
			// A failing backend means the screen stays as it was (on). It is not retried
			// until the next transition or visibilitychange.
		}
	}

	function evaluate(): void {
		if (isStopped) return;
		clearTimeout(timer);
		timer = undefined;
		const at = now();
		apply(schedule === undefined || isOnAt(schedule, at));
		const next = schedule && nextChange(schedule, at);
		if (next === undefined) return;
		// Floor 1 s so a stuck clock cannot spin; cap 24 h so setTimeout never overflows.
		const delay = Math.min(
			Math.max(next - at.getTime(), SECOND_MS),
			DAY_MS
		);
		timer = setTimeout(evaluate, delay);
	}

	document.addEventListener("visibilitychange", evaluate);

	return {
		setSchedule(value) {
			schedule = value;
			evaluate();
		},
		refresh: evaluate,
		stop() {
			if (isStopped) return;
			isStopped = true;
			clearTimeout(timer);
			timer = undefined;
			document.removeEventListener("visibilitychange", evaluate);
			apply(true);
		},
	};
}
