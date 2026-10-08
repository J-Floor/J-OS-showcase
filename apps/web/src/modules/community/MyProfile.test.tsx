// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();
vi.mock("convex-solidjs", () => ({
	useQuery: () => ({
		isLoading: () => false,
		data: () => ({
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
		}),
	}),
	useMutation: () => ({ mutateAsync }),
}));

import { MyProfile } from "./MyProfile.tsx";

afterEach(cleanup);

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
});
