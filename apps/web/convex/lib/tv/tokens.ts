import { hashConfirmToken, newConfirmToken } from "../confirmToken.ts";

/** A 256-bit hex secret (device token, pairing code, poll secret). Action-only. */
export const newTvSecret = newConfirmToken;
export const hashTvSecret = hashConfirmToken;

const BEARER = /^Bearer ([0-9A-Za-z._~+/=-]+)$/;

/** The token from `Authorization: Bearer <token>`, or null. */
export function bearerToken(request: Request): string | null {
	const header = request.headers.get("Authorization");
	return header === null ? null : (BEARER.exec(header)?.[1] ?? null);
}
