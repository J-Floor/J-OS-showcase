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

export type Theme = "light" | "dark";

type ThemeContextValue = {
	theme: Accessor<Theme>;
	setTheme: (theme: Theme) => void;
	toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue>();

/** Read/toggle the active theme. Works only inside a {@link JFloorProvider}. */
export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeContext);
	if (!ctx)
		throw new Error("useTheme must be used within a <JFloorProvider>");
	return ctx;
}

const THEME_STORAGE_KEY = "jf-theme";

function storedTheme(): Theme | undefined {
	if (typeof localStorage === "undefined") return undefined;
	const value = localStorage.getItem(THEME_STORAGE_KEY);
	return value === "light" || value === "dark" ? value : undefined;
}

/** OS-level preference, used as the default when nothing is stored yet. */
function systemTheme(): Theme {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive guard for SSR / environments without matchMedia
	if (typeof window === "undefined" || !window.matchMedia) return "light";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

/** Google Fonts stylesheet for the text families behind the `--jf-typography-*`
 * tokens (Manrope = sans, Azeret Mono = mono). The Material Symbols icon font is
 * loaded from the host `index.html` instead, so it resolves before first paint
 * and never flashes a ligature as plain text. */
const FONTS_HREF =
	"https://fonts.googleapis.com/css2?family=Azeret+Mono:wght@100..900&family=Manrope:wght@200..800&display=swap";

/** Inject the font links once, idempotently. The host app and the playground
 * both mount JFloorProvider, so neither needs its own font <link>. */
function ensureFonts(): void {
	if (typeof document === "undefined") return;
	if (document.querySelector("link[data-jf-fonts]")) return;

	function preconnect(href: string, crossOrigin?: boolean): HTMLLinkElement {
		const link = document.createElement("link");
		link.rel = "preconnect";
		link.href = href;
		if (crossOrigin) link.crossOrigin = "anonymous";
		return link;
	}

	const stylesheet = document.createElement("link");
	stylesheet.rel = "stylesheet";
	stylesheet.href = FONTS_HREF;
	stylesheet.setAttribute("data-jf-fonts", "");

	document.head.append(
		preconnect("https://fonts.googleapis.com"),
		preconnect("https://fonts.gstatic.com", true),
		stylesheet
	);
}

export type JFloorProviderProps = ParentProps & {
	theme?: "light" | "dark";
};

/**
 * Applies the theme to <html> (not a wrapper div) so portaled overlays —
 * Tooltip, Select dropdown, Popover, all rendered into document.body — inherit
 * the active `color-scheme` and resolve `light-dark()` correctly. A wrapper div
 * with `display:contents` cannot theme its portals. Also loads the design
 * system's text fonts so consumers don't have to.
 */
export function JFloorProvider(props: JFloorProviderProps): JSX.Element {
	onMount(ensureFonts);

	// Uncontrolled theme state (seeded from a stored preference, else light).
	// When the `theme` prop is passed it wins (controlled mode, e.g. the
	// playground); otherwise `setTheme`/`toggle` drive it and persist.
	const [internalTheme, setInternalTheme] = createSignal<Theme>(
		storedTheme() ?? systemTheme()
	);
	// `props.theme` wins when present (controlled); otherwise the uncontrolled
	// signal drives it. Read here so the prop stays tracked.
	const theme = createMemo<Theme>(() => props.theme ?? internalTheme());

	function setTheme(next: Theme) {
		if (props.theme !== undefined) return; // controlled: ignore
		setInternalTheme(next);
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(THEME_STORAGE_KEY, next);
		}
	}
	function toggle() {
		setTheme(theme() === "light" ? "dark" : "light");
	}

	createEffect(() => {
		document.documentElement.setAttribute("data-theme", theme());
	});

	onCleanup(() => {
		// Also runs when a server render (prerender) disposes, with no document.
		if (typeof document === "undefined") return;
		document.documentElement.removeAttribute("data-theme");
	});

	return (
		<ThemeContext.Provider value={{ theme, setTheme, toggle }}>
			<div class={styles.passthrough}>{props.children}</div>
		</ThemeContext.Provider>
	);
}
