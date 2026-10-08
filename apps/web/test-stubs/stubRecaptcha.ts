import { vi } from "vitest";

// Stubs the global fetch so reCAPTCHA siteverify answers with `verdict`.
// Returns the mock so a test can count the calls. Undo with
// `vi.unstubAllGlobals()`.
export function stubRecaptcha(verdict: {
	success: boolean;
	action: string;
	score: number;
}) {
	const fetchMock = vi.fn(() =>
		Promise.resolve({
			ok: true,
			json: () => Promise.resolve(verdict),
		})
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}
