import { err, errAsync, ok, ResultAsync } from "neverthrow";

import type { Id } from "../../convex/_generated/dataModel";
import type { ClientError } from "../lib/call.ts";

/** What a failed upload reads like, wherever the upload starts. */
export const UPLOAD_FAILED = "Could not upload the image. Try again.";
const UPLOAD_ERROR: ClientError = { code: "Unknown", message: UPLOAD_FAILED };

function isStorageReply(body: unknown): body is { storageId: string } {
	return (
		typeof body === "object" &&
		body !== null &&
		"storageId" in body &&
		typeof body.storageId === "string"
	);
}

/** POSTs the file to a one-shot upload URL and returns the blob's id. */
export function postFile(
	url: string,
	file: File
): ResultAsync<Id<"_storage">, ClientError> {
	return ResultAsync.fromPromise(
		fetch(url, {
			method: "POST",
			headers: { "Content-Type": file.type },
			body: file,
		}),
		() => UPLOAD_ERROR
	)
		.andThen((response) =>
			response.ok
				? ResultAsync.fromPromise(
						response.json() as Promise<unknown>,
						() => UPLOAD_ERROR
					)
				: errAsync(UPLOAD_ERROR)
		)
		.andThen((body) =>
			isStorageReply(body)
				? ok(body.storageId as Id<"_storage">)
				: err(UPLOAD_ERROR)
		);
}
