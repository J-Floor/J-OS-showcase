/** Pages a signed-out visitor is sent back to after signing in. A short list on
 *  purpose: the destination comes from the URL, so it is never trusted past it. */
const PLACEHOLDER_ORIGIN = "https://app.invalid";
const RETURNABLE_PATHS = new Set(["/tv/pair"]);

/** Where `/signin` should send a signed-out visitor who asked for `target`
 *  (a path plus query): back to `target` after sign-in when it is returnable. */
export function signInHref(target: string): string {
	const next = withoutOneTimeToken(target);
	return returnPath(`?next=${encodeURIComponent(next)}`) === "/"
		? "/signin"
		: `/signin?next=${encodeURIComponent(next)}`;
}

/** The one-time sign-in token (`ott`) must not be copied into a link that outlives it. */
function withoutOneTimeToken(target: string): string {
	const url = new URL(target, PLACEHOLDER_ORIGIN);
	url.searchParams.delete("ott");
	return `${url.pathname}${url.search}`;
}

/** The page to land on after sign-in, from `/signin`'s query string: the
 *  `next` value when it is a returnable page of this app, otherwise `/`. */
export function returnPath(search: string): string {
	const next = new URLSearchParams(search).get("next");
	const url = new URL(next ?? "/", PLACEHOLDER_ORIGIN);
	const isReturnable =
		url.origin === PLACEHOLDER_ORIGIN && RETURNABLE_PATHS.has(url.pathname);
	return isReturnable ? `${url.pathname}${url.search}` : "/";
}

/** {@link returnPath} for the page being shown right now. */
export function currentReturnPath(): string {
	return returnPath(window.location.search);
}
