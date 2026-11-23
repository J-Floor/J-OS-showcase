/** The homepage navbar reveals once and stays available after scrolling back up. */
export function revealHeaderOnScroll(header: HTMLElement) {
	function reveal() {
		header.dataset.revealed = "true";
		header.inert = false;
		header.removeAttribute("aria-hidden");
	}
	function scroll() {
		if (window.scrollY > 0) reveal();
	}
	header.inert = true;
	header.setAttribute("aria-hidden", "true");
	if (window.scrollY > 0 || location.hash) reveal();
	window.addEventListener("scroll", scroll, { passive: true });
	document.addEventListener("intro-skip", reveal, true);
	return () => {
		window.removeEventListener("scroll", scroll);
		document.removeEventListener("intro-skip", reveal, true);
		header.inert = false;
		header.removeAttribute("aria-hidden");
	};
}
