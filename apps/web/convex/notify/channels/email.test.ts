import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendEmail } from "../../lib/email.ts";

import { sendNotificationEmail } from "./email.ts";

vi.mock("../../lib/email.ts", () => ({ sendEmail: vi.fn() }));

const MESSAGE = { subject: "Hello", html: "<p>Hi</p>", text: "Hi" };

describe("sendNotificationEmail", () => {
	beforeEach(() => {
		vi.mocked(sendEmail).mockReset();
	});

	it("is Ok when the provider accepts the email", async () => {
		vi.mocked(sendEmail).mockResolvedValue(true);
		const result = await sendNotificationEmail(
			"ada@example.com",
			"taskAssigned",
			MESSAGE
		);
		expect(result.isOk()).toBe(true);
	});

	it("is Err(EmailRejected) when the provider rejects the email", async () => {
		vi.mocked(sendEmail).mockResolvedValue(false);
		const result = await sendNotificationEmail(
			"ada@example.com",
			"taskAssigned",
			MESSAGE
		);
		expect(result.isErr() && result.error.type).toBe("EmailRejected");
	});
});
