/**
 * Whether `value` looks like an email: one `@`, no whitespace, and a domain
 * with a `.` that has at least one character on each side. A cheap shape
 * check for forms; the server and the confirm link are the real test. Written
 * out rather than as a regex so it stays linear on hostile input.
 */
export function isValidEmail(value: string): boolean {
	const [local, domain, ...extra] = value.split("@");
	const hasShape =
		Boolean(local) &&
		Boolean(domain) &&
		extra.length === 0 &&
		!/\s/.test(value);
	return hasShape && domain.lastIndexOf(".", domain.length - 2) > 0;
}

/** The message for an email field: required, then well-formed. */
export function emailError(email: string): string | null {
	const trimmed = email.trim();
	if (trimmed === "") return "Required.";
	return isValidEmail(trimmed) ? null : "Enter a valid email.";
}
