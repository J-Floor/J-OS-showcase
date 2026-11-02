import { ICONS } from "./icons.ts";

/** The theme the page is drawn in. */
export type Theme = "light" | "dark";

/** What a person chose: follow the device, or pin a theme. */
export type ThemePreference = "system" | Theme;

const NEXT: Record<ThemePreference, ThemePreference> = {
	system: "light",
	light: "dark",
	dark: "system",
};

const ICON: Record<ThemePreference, string> = {
	system: ICONS.systemTheme,
	light: ICONS.lightMode,
	dark: ICONS.darkMode,
};

/** The preference a press of a theme control moves to: System, Light, Dark,
 *  then System again. */
export function nextThemePreference(
	preference: ThemePreference
): ThemePreference {
	return NEXT[preference];
}

/** The glyph a theme control shows for the current preference. */
export function themePreferenceIcon(preference: ThemePreference): string {
	return ICON[preference];
}

/** What a press of a theme control does next, for its label. */
export function themeSwitchLabel(preference: ThemePreference): string {
	return `Switch to ${NEXT[preference]} theme`;
}
