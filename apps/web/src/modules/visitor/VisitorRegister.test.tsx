// @vitest-environment happy-dom
import { createMemoryHistory, MemoryRouter, Route } from "@solidjs/router";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

const mutateAsync = vi.fn<
	(args: unknown) => Promise<{ status: "pending" | "no-event" | "ended" }>
>(() => Promise.resolve({ status: "pending" }));
const checkInMutateAsync = vi.fn(() => Promise.resolve({ ok: true }));

// Switchable event-query data for the useQuery() mock below — set per-test
// before rendering. Defaults to a live (not-ended) event.
let eventData: {
	name: string;
	startsAt: number;
	endsAt: number;
	ended?: boolean;
} = { name: "Hack Night", startsAt: 0, endsAt: 0 };

vi.mock("convex-solidjs", () => ({
	useQuery: () => ({
		data: () => eventData,
		error: () => undefined,
		isLoading: () => false,
	}),
	useAction: () => ({ mutateAsync }),
	useMutation: () => ({ mutateAsync: checkInMutateAsync }),
}));

// Switchable session for the useSession() mock below — set per-test before
// rendering. Defaults to signed-out.
let sessionState: {
	data: { user: { name: string } } | null;
	isPending: boolean;
} = { data: null, isPending: false };

vi.mock("../../lib/auth.ts", () => ({
	authClient: { useSession: () => () => sessionState },
}));

import { VisitorRegister } from "./VisitorRegister.tsx";

afterEach(() => {
	cleanup();
	sessionState = { data: null, isPending: false };
	eventData = { name: "Hack Night", startsAt: 0, endsAt: 0 };
	checkInMutateAsync.mockClear();
	checkInMutateAsync.mockImplementation(() => Promise.resolve({ ok: true }));
	mutateAsync.mockClear();
	mutateAsync.mockImplementation(() =>
		Promise.resolve({ status: "pending" })
	);
	delete (window as { grecaptcha?: unknown }).grecaptcha;
});

function renderAtPath(path: string) {
	const history = createMemoryHistory();
	history.set({ value: path, scroll: false, replace: true });
	return render(() => (
		<MemoryRouter history={history}>
			<Route path="*" component={() => <VisitorRegister />} />
		</MemoryRouter>
	));
}

test("renders the event name and the first/last/email fields", () => {
	renderAtPath("/visitor?event=ev1");
	expect(screen.getByText(/Hack Night/)).toBeInTheDocument();
	expect(screen.getByLabelText("First name")).toBeInTheDocument();
	expect(screen.getByLabelText("Last name")).toBeInTheDocument();
	expect(screen.getByLabelText("Email")).toBeInTheDocument();
});

test("shows an error and no form when the ?event param is missing", () => {
	renderAtPath("/visitor");
	expect(screen.getByText(/missing its event/i)).toBeInTheDocument();
	expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
	expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
});

test("a signed-in entitled member is checked in automatically, not shown the form", async () => {
	sessionState = { data: { user: { name: "Mia Chen" } }, isPending: false };
	renderAtPath("/visitor?event=ev1");

	expect(
		await screen.findByText(/checked in as Mia Chen/i)
	).toBeInTheDocument();
	expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
	expect(checkInMutateAsync).toHaveBeenCalledTimes(1);
	expect(checkInMutateAsync).toHaveBeenCalledWith({ eventId: "ev1" });
});

test("a signed-out visitor is not checked in and sees the form", () => {
	sessionState = { data: null, isPending: false };
	renderAtPath("/visitor?event=ev1");

	expect(screen.getByLabelText("First name")).toBeInTheDocument();
	expect(checkInMutateAsync).not.toHaveBeenCalled();
});

test("falls through to the form when checkInToEvent rejects (not entitled)", async () => {
	checkInMutateAsync.mockImplementation(() =>
		Promise.reject(new Error("Not entitled"))
	);
	sessionState = { data: { user: { name: "Mia Chen" } }, isPending: false };
	renderAtPath("/visitor?event=ev1");

	expect(await screen.findByLabelText("First name")).toBeInTheDocument();
	expect(screen.queryByText(/checked in as/i)).not.toBeInTheDocument();
});

test("shows an ended state and no form when the event has ended", () => {
	eventData = { name: "Hack Night", startsAt: 0, endsAt: 0, ended: true };
	renderAtPath("/visitor?event=ev1");

	expect(screen.getByText(/this event has ended/i)).toBeInTheDocument();
	expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
});

test('shows an ended state after registerVisitor returns status "ended"', async () => {
	(window as { grecaptcha?: unknown }).grecaptcha = {
		ready: (cb: () => void) => {
			cb();
		},
		execute: () => Promise.resolve("token"),
	};
	mutateAsync.mockResolvedValueOnce({ status: "ended" });
	renderAtPath("/visitor?event=ev1");

	fireEvent.input(screen.getByLabelText("First name"), {
		target: { value: "Ada" },
	});
	fireEvent.input(screen.getByLabelText("Last name"), {
		target: { value: "Lovelace" },
	});
	fireEvent.input(screen.getByLabelText("Email"), {
		target: { value: "ada@example.com" },
	});
	fireEvent.click(screen.getByRole("button", { name: /register/i }));

	expect(
		await screen.findByText(/this event has ended/i)
	).toBeInTheDocument();
});

test("links the privacy notice under the register button", () => {
	renderAtPath("/visitor?event=ev1");

	const link = screen.getByRole("link", { name: "Privacy notice" });
	expect(link).toHaveAttribute("href", "/privacy");
	expect(link.closest("p")).toHaveTextContent(
		"How we handle your data: Privacy notice"
	);
});
