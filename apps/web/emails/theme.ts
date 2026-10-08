// apps/web/emails/theme.ts
/**
 * Literal-hex email palette. Mirrors the LIGHT-theme values of
 * `packages/design-system/src/styles/colour.scss` (emails can't use CSS custom
 * properties or light-dark()). Change here deliberately when colour.scss changes.
 */
export const palette = {
	bg: "#ffffff", // --core-grey-0
	fgStrong: "#000000", // --core-grey-1000 (title + button bg)
	fgDefault: "#232323", // --core-grey-900 (body)
	fgMuted: "#767372", // --core-grey-500 (footer)
	borderSubtle: "#d8d3ce", // --core-grey-200
	link: "#084de2", // --core-blue-700
	buttonText: "#ffffff", // --core-grey-0
};

export const fontStack =
	"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Shared style objects so every template/layout looks identical. */
export const styles = {
	body: { backgroundColor: palette.bg, margin: "0", padding: "0" },
	container: {
		maxWidth: "480px",
		margin: "0 auto",
		padding: "32px 24px",
		fontFamily: fontStack,
		textAlign: "left" as const,
	},
	logo: { display: "block", height: "48px", width: "auto", border: "0" },
	heading: {
		color: palette.fgStrong,
		fontSize: "22px",
		fontWeight: "700",
		margin: "24px 0 16px",
		textAlign: "left" as const,
	},
	text: {
		color: palette.fgDefault,
		fontSize: "15px",
		lineHeight: "24px",
		margin: "0 0 16px",
		textAlign: "left" as const,
	},
	button: {
		backgroundColor: palette.fgStrong,
		color: palette.buttonText,
		fontSize: "15px",
		fontWeight: "600",
		textDecoration: "none",
		padding: "12px 20px",
		borderRadius: "6px",
		display: "inline-block", // hugs its label
	},
	hr: {
		border: "none",
		borderTop: `1px solid ${palette.borderSubtle}`,
		margin: "24px 0 16px",
	},
	footer: {
		color: palette.fgMuted,
		fontSize: "12px",
		lineHeight: "18px",
		margin: "0",
		textAlign: "left" as const,
	},
};
