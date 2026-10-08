export const NAME_MAX = 200;
export const EMAIL_MAX = 254;
export const REFERRAL_MAX = 320;
export const VENTURE_NAME_MAX = 300;
export const TEXT_MAX = 5000;
export const PHONE_MAX = 50;
export const SSID_MAX = 64;
export const WIFI_PASSWORD_MAX = 128;

/** Throws when a client-supplied string is longer than the field allows. */
export function assertLen(
	value: string | undefined,
	max: number,
	field: string
): void {
	if (value !== undefined && value.length > max)
		throw new Error(
			`${field} is too long (max ${String(max)} characters).`
		);
}
