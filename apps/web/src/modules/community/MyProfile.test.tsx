// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();
const { meRef } = vi.hoisted(() => ({
	meRef: { current: undefined as Record<string, unknown> | null | undefined },
}));
const PROFILE = {
	_id: "p1",
	email: "mia@example.com",
	firstName: "Mia",
	lastName: "Chen",
	phone: "123",
	vertical: ["ai"],
	venture: {
		name: "OldCo",
		description: "desc",
		whyJoin: "secret why",
		pastBuilt: "secret past",
	},
};
meRef.current = PROFILE;
vi.mock("convex-solidjs", () => ({
	useQuery: () => ({
		isLoading: () => false,
		data: () => meRef.current,
	}),
	useMutation: () => ({ mutateAsync }),
}));

import { MyProfile } from "./MyProfile.tsx";

afterEach(() => {
	cleanup();
	meRef.current = PROFILE;
});

describe("MyProfile", () => {
	it("shows name and email read-only", () => {
		render(() => <MyProfile />);
		expect(screen.getByText("mia@example.com")).toBeInTheDocument();
		expect(screen.getByText("Mia Chen")).toBeInTheDocument();
	});

	it("never renders the locked application answers", () => {
		render(() => <MyProfile />);
		expect(screen.queryByText("secret why")).not.toBeInTheDocument();
		expect(screen.queryByText("secret past")).not.toBeInTheDocument();
		expect(screen.queryByText(/why join/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/past built/i)).not.toBeInTheDocument();
	});

	it("shows a loading skeleton, not the empty copy, while the profile loads", () => {
		meRef.current = undefined;
		render(() => <MyProfile />);
		expect(screen.getByRole("status")).toBeInTheDocument();
		expect(screen.queryByText("No profile found.")).toBeNull();
	});

	it("says no profile was found only once the query resolves to null", () => {
		meRef.current = null;
		render(() => <MyProfile />);
		expect(screen.getByText("No profile found.")).toBeInTheDocument();
		expect(screen.queryByRole("status")).toBeNull();
	});
});
