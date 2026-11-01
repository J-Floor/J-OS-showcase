/** Saves `blob` as a file called `filename` by clicking a link to it. A
 *  page has no other way to start a download without a server. The
 *  inventory PDF, the community JSON export and the perk-request CSV
 *  downloads share it. */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}
