// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { errAsync, okAsync, type ResultAsync } from "neverthrow";
import { afterEach, expect, test, vi } from "vitest";

import type { ClientError } from "../../lib/call.ts";
import { ConfirmProvider } from "../confirm.tsx";

import { EntityDeleteButton } from "./EntityDeleteButton.tsx";

afterEach(cleanup);

const CONFIRM = {
	title: "Delete thing?",
	confirmLabel: "Delete",
	tone: "danger",
} as const;
const REFUSAL: ClientError = { code: "Forbidden", message: "Not allowed." };

function renderButton(remove: () => ResultAsync<unknown, ClientError>) {
	const onClose = vi.fn();
	render(() => (
		<ConfirmProvider>
			<EntityDeleteButton
				key="row1"
				confirm={CONFIRM}
				remove={remove}
				onClose={onClose}
			>
				Delete thing
			</EntityDeleteButton>
		</ConfirmProvider>
	));
	fireEvent.click(screen.getByRole("button", { name: /Delete thing/ }));
	return onClose;
}

test("cancelling the confirm removes nothing", async () => {
	const remove = vi.fn(() => okAsync<unknown, ClientError>(null));
	const onClose = renderButton(remove);
	fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
	await waitFor(() => {
		expect(screen.queryByRole("dialog")).toBeNull();
	});
	expect(remove).not.toHaveBeenCalled();
	expect(onClose).not.toHaveBeenCalled();
});

test("a confirmed delete that succeeds closes the sheet", async () => {
	const remove = vi.fn(() => okAsync<unknown, ClientError>(null));
	const onClose = renderButton(remove);
	fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
	await waitFor(() => {
		expect(onClose).toHaveBeenCalledTimes(1);
	});
	expect(remove).toHaveBeenCalledTimes(1);
});

test("a refused delete shows the message and keeps the sheet", async () => {
	const remove = vi.fn(() => errAsync<unknown, ClientError>(REFUSAL));
	const onClose = renderButton(remove);
	fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
	expect(await screen.findByText("Not allowed.")).toBeTruthy();
	expect(onClose).not.toHaveBeenCalled();
});
