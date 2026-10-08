/** Icon ligatures (Material Symbols Sharp) for generic UI meanings, one per
 *  meaning, so the same meaning looks the same everywhere. The map holds every
 *  generic meaning the design system and app name, even with a single user.
 *  Keys name the meaning, not the picture. Domain meanings live in the app's
 *  own map. */
export const ICONS = {
	close: "close",
	check: "check",
	add: "add",
	delete: "delete",
	search: "search",
	copy: "content_copy",
	refresh: "refresh",
	back: "arrow_back",
	expandAll: "expand_all",
	collapseAll: "collapse_all",
	error: "error",
	warning: "warning",
	info: "info",
	help: "help",
	more: "more_vert",
	datePicker: "calendar_month",
	time: "schedule",
	undo: "undo",
	reset: "replay",
	edit: "edit",
	lightMode: "light_mode",
	darkMode: "dark_mode",
} as const;
