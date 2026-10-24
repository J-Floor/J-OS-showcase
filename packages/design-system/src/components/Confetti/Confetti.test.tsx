import { fireEvent, render, screen } from "@solidjs/testing-library";
import { beforeEach, expect, test, vi } from "vitest";

import { fireConfetti } from "../../utils/confetti.ts";

import { Confetti } from "./Confetti.tsx";

vi.mock("../../utils/confetti.ts", () => ({ fireConfetti: vi.fn() }));

beforeEach(() => {
	vi.mocked(fireConfetti).mockClear();
});

test("a click inside bursts from the wrapper and still reaches the child", () => {
	const onClick = vi.fn();
	const { container } = render(() => (
		<Confetti>
			<button type="button" onClick={onClick}>
				Accept
			</button>
		</Confetti>
	));
	fireEvent.click(screen.getByRole("button", { name: "Accept" }));
	expect(fireConfetti).toHaveBeenCalledTimes(1);
	expect(fireConfetti).toHaveBeenCalledWith(container.firstElementChild);
	expect(onClick).toHaveBeenCalledTimes(1);
});
