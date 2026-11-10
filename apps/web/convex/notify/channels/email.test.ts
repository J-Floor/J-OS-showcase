import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendEmail, type EmailContext } from "../../lib/email.ts";

import { sendNotificationEmail } from "./email.ts";

vi.mock("../../lib/email.ts", () => ({ sendEmail: vi.fn() }));

const CONTEXT = { runMutation: vi.fn() } as unknown as EmailContext;
const MESSAGE = { subject: "Hello", html: "<p>Hi</p>", text: "Hi" };

describe("sendNotificationEmail", () => {
	beforeEach(() => {
		vi.mocked(sendEmail).mockReset();
	});

	it("is Ok when the provider accepts the email", async () => {
		vi.mocked(sendEmail).mockResolvedValue(true);
		const result = await sendNotificationEmail(CONTEXT, {
			to: "ada@example.com",
			kind: "taskAssigned",
			message: MESSAGE,
			priority: "notification",
		});
		expect(result.isOk()).toBe(true);
	});

	it("is Err(EmailRejected) when the provider rejects the email", async () => {
		vi.mocked(sendEmail).mockResolvedValue(false);
		const result = await sendNotificationEmail(CONTEXT, {
			to: "ada@example.com",
			kind: "taskAssigned",
			message: MESSAGE,
			priority: "notification",
		});
		expect(result.isErr() && result.error.type).toBe("EmailRejected");
	});
});
