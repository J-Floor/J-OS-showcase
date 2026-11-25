export type PowerBackend = { screenOff(): void; screenOn(): void };

export const OFF_CLASS = "screen-off";

/** Blacks the app out with a CSS class (see app.css); the TV stays powered. */
export function createCoverBackend(root: HTMLElement): PowerBackend {
	return {
		screenOff: () => {
			root.classList.add(OFF_CLASS);
		},
		screenOn: () => {
			root.classList.remove(OFF_CLASS);
		},
	};
}
