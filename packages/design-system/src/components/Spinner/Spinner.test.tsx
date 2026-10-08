import { render, screen } from "@solidjs/testing-library";

import { Spinner } from "./Spinner.tsx";

test("renders with role status", () => {
	render(() => <Spinner />);
	expect(screen.getByRole("status")).toBeInTheDocument();
});
