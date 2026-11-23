import { TV_IMAGE_NAMES, TV_LIMITS } from "../tv/constants.ts";

const BYTES_PER_KB = 1000;
const BYTES_PER_MB = 1_000_000;
const BYTES_PER_MIB = 1_048_576;
const IMAGE_MB = TV_LIMITS.imageMaxBytes / BYTES_PER_MIB;

export type TvError =
	| { type: "TvSlideNotFound" }
	| { type: "TvSlideInvalid" }
	| { type: "TvTooManySlides" }
	| { type: "TvImageInvalid" }
	| { type: "TvHtmlTooLarge" }
	| { type: "TvDeviceNotFound" }
	| { type: "TvTooManyDevices" }
	| { type: "TvPairingInvalid" }
	| { type: "TvPairingExpired" }
	| { type: "TvPairingUsed" };

export const tvMessages: Record<TvError["type"], string> = {
	TvSlideNotFound: "That slide no longer exists.",
	TvSlideInvalid: "Check the slide's title, duration and content.",
	TvTooManySlides: `The TV can show at most ${String(TV_LIMITS.maxSlides)} slides.`,
	TvImageInvalid: `Use a ${TV_IMAGE_NAMES} image up to ${String(IMAGE_MB)} MB.`,
	TvHtmlTooLarge: `A slide's HTML can be at most ${String(TV_LIMITS.htmlMax / BYTES_PER_KB)} KB, and ${String(TV_LIMITS.htmlTotalMax / BYTES_PER_MB)} MB across all slides.`,
	TvDeviceNotFound: "That TV is not paired.",
	TvTooManyDevices: "Revoke a TV before pairing another.",
	TvPairingInvalid: "This pairing link is not valid.",
	TvPairingExpired:
		"This pairing link has expired. Reload the TV for a new code.",
	TvPairingUsed: "This TV is already paired.",
};
