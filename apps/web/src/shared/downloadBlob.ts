/** Saves what `href` points at as a file called `filename` by clicking a link
 *  to it. A page has no other way to start a download without a server. */
export function downloadHref(href: string, filename: string): void {
	const anchor = document.createElement("a");
	anchor.href = href;
	anchor.download = filename;
	anchor.click();
}

/** Saves `blob` as a file called `filename`. The inventory PDF, the community
 *  JSON export and the perk-request CSV downloads share it. */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	downloadHref(url, filename);
	URL.revokeObjectURL(url);
}
