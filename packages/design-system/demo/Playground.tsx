import { JFloorProvider, ThemeSwitch } from "@j-os/design-system";
import { For, Show, createSignal, type JSX } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { ControlsPanel } from "./ControlsPanel.tsx";
import type { Demo } from "./types.ts";

import styles from "./playground.module.scss";

type ControlValue = string | number | boolean;

const modules = import.meta.glob("../src/components/**/*.demo.tsx", {
	eager: true,
});

const demos: Demo[] = Object.values(modules)
	.map((module) => (module as { default: Demo }).default)
	.sort((a, b) => a.title.localeCompare(b.title));

/** Bare control defaults for a demo. */
function defaultsOf(story: Demo): Record<string, ControlValue> {
	return Object.fromEntries(
		Object.entries(story.controls).map(([key, control]) => [
			key,
			control.default,
		]),
	);
}

/** Preset names always include a leading "Default" (= bare defaults). */
function presetNamesOf(story: Demo): string[] {
	const declared = Object.keys(story.presets ?? {}).filter(
		(name) => name !== "Default",
	);
	return ["Default", ...declared];
}

export function Playground(): JSX.Element {
	const [selected, setSelected] = createSignal<Demo | undefined>(demos[0]);
	const [state, setState] = createStore<Record<string, ControlValue>>(
		demos[0] ? defaultsOf(demos[0]) : {},
	);

	// Seed control defaults SYNCHRONOUSLY, then switch. A post-render effect
	// would reseed too late: the keyed <Show> calls story.render(state) on the
	// same tick selected() changes, so a demo that reads props non-reactively at
	// mount (e.g. Table's enableRowSelection) would otherwise see the previous
	// story's stale state on first render.
	function pick(story: Demo): void {
		setState(reconcile(defaultsOf(story)));
		setSelected(story);
	}

	function applyPreset(story: Demo, name: string): void {
		const preset = name === "Default" ? {} : (story.presets?.[name] ?? {});
		setState(reconcile({ ...defaultsOf(story), ...preset }));
	}

	return (
		<JFloorProvider>
			<div class={styles.app}>
				<header class={styles.topbar}>
					<span class={styles.brand}>Design System Playground</span>
					<ThemeSwitch />
				</header>

				<div class={styles.body}>
					<aside class={styles.rail}>
						<For each={demos}>
							{(story) => (
								<button
									type="button"
									classList={{
										[styles.railItem]: true,
										[styles.active]: story === selected(),
									}}
									onClick={() => pick(story)}
								>
									{story.title}
								</button>
							)}
						</For>
					</aside>

					<main class={styles.canvas}>
						<Show when={selected()} keyed>
							{(story) => story.render(state)}
						</Show>
					</main>

					<aside class={styles.drawer}>
						<Show when={selected()} keyed>
							{(story) => (
								<ControlsPanel
									story={story}
									state={state}
									set={(key, value) => setState(key, value)}
									presetNames={presetNamesOf(story)}
									onPreset={(name) => applyPreset(story, name)}
								/>
							)}
						</Show>
					</aside>
				</div>
			</div>
		</JFloorProvider>
	);
}
