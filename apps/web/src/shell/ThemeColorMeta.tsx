import { type Theme, useTheme } from "@j-os/design-system";
import { type JSX, createEffect, onCleanup } from "solid-js";

/**
 * Keeps the browser's status-bar colour on the app's theme. index.html holds
 * one `theme-color` meta per `prefers-color-scheme`, which already follows the
 * device. A pinned Light or Dark gives both metas that theme's colour, so the
 * bar matches the app; System puts each meta's own colour back. The colours
 * are read from the metas, so index.html stays their only source. Renders
 * nothing; mount it once inside the JFloorProvider.
 */
export function ThemeColorMeta(): JSX.Element {
	const { preference, theme } = useTheme();
	const metas = [
		...document.querySelectorAll<HTMLMetaElement>(
			'meta[name="theme-color"]'
		),
	].map((element) => ({ element, colour: element.content }));

	function colourOf(scheme: Theme): string | undefined {
		return metas.find(
			({ element }) =>
				element.media === `(prefers-color-scheme: ${scheme})`
		)?.colour;
	}

	createEffect(() => {
		const pinned =
			preference() === "system" ? undefined : colourOf(theme());
		for (const { element, colour } of metas)
			element.content = pinned ?? colour;
	});
	onCleanup(() => {
		for (const { element, colour } of metas) element.content = colour;
	});
	return null;
}
