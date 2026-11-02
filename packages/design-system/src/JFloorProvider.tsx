import {
	type Accessor,
	type JSX,
	type ParentProps,
	createContext,
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
	onMount,
	useContext,
} from "solid-js";

import styles from "./JFloorProvider.module.scss";
import "./styles/index.scss";
import {
	type Theme,
	type ThemePreference,
	nextThemePreference,
} from "./themePreference.ts";
import { trackActivation } from "./utils/activation.ts";
import { readStored, writeStored } from "./utils/storage.ts";

type ThemeContextValue = {
	/** The theme the page is drawn in. */
	theme: Accessor<Theme>;
	/** What the person chose; `system` follows the device. */
	preference: Accessor<ThemePreference>;
	setPreference: (preference: ThemePreference) => void;
	/** Moves to the next preference: System, Light, Dark, System. */
	cycle: () => void;
};

const ThemeContext = createContext<ThemeContextValue>();

/** Read/change the theme preference. Works only inside a {@link JFloorProvider}. */
export function useTheme(): ThemeContextValue {
	const context = useContext(ThemeContext);
	if (!context)
		throw new Error("useTheme must be used within a <JFloorProvider>");
	return context;
}

const PREFERENCE_STORAGE_KEY = "jf-theme-preference";

function storedPreference(): ThemePreference {
	const value = readStored("local", PREFERENCE_STORAGE_KEY).unwrapOr(null);
	return value === "light" || value === "dark" ? value : "system";
}

/** The device's dark-mode query; none without `matchMedia`. */
function darkSchemeQuery(): MediaQueryList | undefined {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive guard for SSR / environments without matchMedia
	return typeof window === "undefined" || !window.matchMedia
		? undefined
		: window.matchMedia("(prefers-color-scheme: dark)");
}

function schemeOf(query: MediaQueryList | undefined): Theme {
	return query?.matches ? "dark" : "light";
}

export type JFloorProviderProps = ParentProps & {
	theme?: Theme;
};

/**
 * Applies the theme to <html> (not a wrapper div) so portaled overlays —
 * Tooltip, Select dropdown, Popover, all rendered into document.body — inherit
 * the active `color-scheme` and resolve `light-dark()` correctly. A wrapper div
 * with `display:contents` cannot theme its portals. Its stylesheet
 * also self-hosts the design system's fonts so consumers don't have to.
 */
export function JFloorProvider(props: JFloorProviderProps): JSX.Element {
	// The preference starts from storage, else System. Under System the theme
	// follows the device live. When the `theme` prop is passed it wins
	// (controlled mode, e.g. the playground) and the preference is ignored.
	const [preference, setPreferenceSignal] =
		createSignal<ThemePreference>(storedPreference());
	const query = darkSchemeQuery();
	const [systemTheme, setSystemTheme] = createSignal<Theme>(schemeOf(query));
	if (query) {
		function onChange() {
			setSystemTheme(schemeOf(query));
		}
		query.addEventListener("change", onChange);
		onCleanup(() => {
			query.removeEventListener("change", onChange);
		});
	}
	// Read here so the prop stays tracked.
	const theme = createMemo<Theme>(() => {
		if (props.theme) return props.theme;
		const chosen = preference();
		return chosen === "system" ? systemTheme() : chosen;
	});

	function setPreference(next: ThemePreference) {
		if (props.theme !== undefined) return; // controlled: ignore
		setPreferenceSignal(next);
		// A blocked or full store: the preference just does not persist.
		writeStored("local", PREFERENCE_STORAGE_KEY, next);
	}
	function cycle() {
		setPreference(nextThemePreference(preference()));
	}

	createEffect(() => {
		document.documentElement.setAttribute("data-theme", theme());
	});

	onMount(() => {
		onCleanup(trackActivation());
	});

	onCleanup(() => {
		// Also runs when a server render (prerender) disposes, with no document.
		if (typeof document === "undefined") return;
		document.documentElement.removeAttribute("data-theme");
	});

	return (
		<ThemeContext.Provider
			value={{ theme, preference, setPreference, cycle }}
		>
			<div class={styles.passthrough}>{props.children}</div>
		</ThemeContext.Provider>
	);
}
