import { pollPairing, startPairing, type PairingStart } from "./api.ts";
import { appBase } from "./config.ts";
import { renderQr } from "./qr.ts";
import { storage } from "./storage.ts";

const POLL_MS = 2000;
/** After a refused or failed start (429, 503, 5xx, offline): each try costs the server a rate-limit token, so do not hammer it. */
const START_RETRY_MS = 60_000;
const CHECK_CODE_LENGTH = 4;
/** The server's pairing lifetime, counted on this TV's own clock: the server's `expiresAt` is on another clock. */
const PAIRING_TTL_MS = 600_000; // ten minutes, as the server

export type PairingOptions = {
	root: HTMLElement;
	onPaired: (token: string) => void;
};

export type Pairing = { stop: () => void };

function element(tag: string, className: string, text?: string): HTMLElement {
	const node = document.createElement(tag);
	node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

/** Not `replaceChildren`: it needs Chrome 86, the Tizen 6 TV runs 76. */
function show(root: HTMLElement, screen: HTMLElement): void {
	root.textContent = "";
	root.append(screen);
}

function showMessage(root: HTMLElement, text: string): void {
	const screen = element("div", "screen");
	screen.append(element("p", "message", text));
	show(root, screen);
}

/** Only the one-time code reaches the screen: the QR carries it, the check code is its first characters. */
function showCode(root: HTMLElement, code: string): void {
	const screen = element("div", "screen");
	const qr = element("div", "qr");
	qr.append(renderQr(`${appBase()}/tv/pair?code=${code}`));
	// eslint-disable-next-line no-restricted-syntax -- the check code is a value compared with the phone, not UI text
	const checkCode = code.slice(0, CHECK_CODE_LENGTH).toUpperCase();
	screen.append(
		element("h1", "title", "Scan to connect this TV"),
		qr,
		element("p", "check-code", checkCode)
	);
	show(root, screen);
}

type State = {
	isStopped: boolean;
	timer: ReturnType<typeof setTimeout> | undefined;
};

function newState(): State {
	return { isStopped: false, timer: undefined };
}

/** A function call, so a check after an await is not narrowed away by an earlier one. */
function hasStopped(state: State): boolean {
	return state.isStopped;
}

function later(state: State, ms: number, step: () => Promise<void>): void {
	state.timer = setTimeout(() => {
		void step();
	}, ms);
}

/** Shows a QR, polls until a phone approves it, then stores the token. Starts a fresh pairing when one lapses. */
export function runPairing(options: PairingOptions): Pairing {
	const state = newState();

	async function poll(
		started: PairingStart,
		deadline: number
	): Promise<void> {
		if (state.isStopped) return;
		if (Date.now() >= deadline) {
			await begin();
			return;
		}
		try {
			const result = await pollPairing(started.pollSecret);
			if (hasStopped(state)) return;
			if (result.status === "paired") {
				state.isStopped = true;
				storage.setToken(result.token);
				options.onPaired(result.token);
				return;
			}
			if (result.status !== "pending") {
				await begin();
				return;
			}
		} catch {
			// Network trouble or a rate limit: the next tick tries again.
		}
		later(state, POLL_MS, () => poll(started, deadline));
	}

	async function begin(): Promise<void> {
		if (state.isStopped) return;
		let started: PairingStart;
		try {
			started = await startPairing();
		} catch {
			showMessage(options.root, "Connecting…");
			later(state, START_RETRY_MS, begin);
			return;
		}
		if (hasStopped(state)) return;
		const deadline = Date.now() + PAIRING_TTL_MS;
		showCode(options.root, started.code);
		later(state, POLL_MS, () => poll(started, deadline));
	}

	void begin();
	return {
		stop: () => {
			state.isStopped = true;
			clearTimeout(state.timer);
		},
	};
}
