export type LeafRect = {
	x: number;
	y: number;
	width: number;
	height: number;
	borderRadius: string;
};

export function observeResize(el: HTMLElement, cb: () => void): () => void {
	if (typeof ResizeObserver !== "function") return () => undefined;
	let raf: number | null = null;
	const ro = new ResizeObserver(() => {
		if (raf !== null) cancelAnimationFrame(raf);
		raf = requestAnimationFrame(() => {
			cb();
			raf = null;
		});
	});
	ro.observe(el);
	return () => {
		if (raf !== null) cancelAnimationFrame(raf);
		ro.disconnect();
	};
}

const ALWAYS_LEAF = [
	"img",
	"svg",
	"video",
	"canvas",
	"iframe",
	"input",
	"textarea",
	"button",
];
const INLINE_TAGS = [
	"br",
	"strong",
	"em",
	"b",
	"i",
	"u",
	"mark",
	"small",
	"sub",
	"sup",
	"code",
];

function isLeafElement(el: Element): boolean {
	// eslint-disable-next-line no-restricted-syntax -- tag-name matching, not UI text
	const tag = el.tagName.toLowerCase();
	if (ALWAYS_LEAF.includes(tag)) return true;
	if (el.hasAttribute("data-icon")) return true;
	const kids = Array.from(el.children);
	if (kids.length === 0) return true;
	return kids.every((k) =>
		// eslint-disable-next-line no-restricted-syntax -- tag-name matching, not UI text
		INLINE_TAGS.includes(k.tagName.toLowerCase())
	);
}

function extractElementInfo(element: Element, parentRect: DOMRect): LeafRect[] {
	const elements: LeafRect[] = [];

	// Skip nested Shimmer containers to prevent double-shimmer
	if (element.getAttribute("data-shimmer-container") === "true") {
		return elements;
	}

	// Check if element has display: contents
	const computedStyle = window.getComputedStyle(element);
	if (computedStyle.display === "contents") {
		// For display: contents elements, their children participate in parent's layout
		// Process element children recursively
		Array.from(element.children).forEach((child) => {
			elements.push(...extractElementInfo(child, parentRect));
		});

		// If no element children but has text content, measure the text
		if (element.children.length === 0) {
			// Check for text nodes
			const textNodes = Array.from(element.childNodes).filter(
				(node) =>
					node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
			);

			if (textNodes.length > 0) {
				// Create temporary span to measure text
				const tempSpan = document.createElement("span");
				tempSpan.style.display = "inline";

				// Copy font-related styles to ensure accurate measurement
				const parentStyles = window.getComputedStyle(element);
				tempSpan.style.font = parentStyles.font;
				tempSpan.style.fontSize = parentStyles.fontSize;
				tempSpan.style.fontFamily = parentStyles.fontFamily;
				tempSpan.style.fontWeight = parentStyles.fontWeight;
				tempSpan.style.letterSpacing = parentStyles.letterSpacing;
				tempSpan.style.lineHeight = parentStyles.lineHeight;
				tempSpan.style.textTransform = parentStyles.textTransform;

				// Move text to span
				while (element.firstChild) {
					tempSpan.appendChild(element.firstChild);
				}
				element.appendChild(tempSpan);

				// Force a reflow to ensure accurate measurements
				void tempSpan.offsetHeight;

				// Measure
				const spanRect = tempSpan.getBoundingClientRect();
				if (spanRect.width > 0 && spanRect.height > 0) {
					elements.push({
						x: spanRect.left - parentRect.left,
						y: spanRect.top - parentRect.top,
						width: spanRect.width,
						height: spanRect.height,
						borderRadius: "0px",
					});
				}

				// Move text back
				while (tempSpan.firstChild) {
					element.insertBefore(tempSpan.firstChild, tempSpan);
				}
				element.removeChild(tempSpan);
			}
		}

		return elements;
	}

	const rect = element.getBoundingClientRect();

	// For icon elements, always use font-size for dimensions since icon fonts
	// don't render properly in the hidden measurement container
	const isIcon = element.hasAttribute("data-icon");
	let effectiveWidth = rect.width;
	let effectiveHeight = rect.height;

	if (isIcon) {
		// Icons use 1em sizing with aspect-ratio: 1
		const fontSize = parseFloat(computedStyle.fontSize) || 16;
		effectiveWidth = fontSize;
		effectiveHeight = fontSize;
	}

	// Skip elements with no dimensions
	if (effectiveWidth === 0 || effectiveHeight === 0) {
		return elements;
	}

	// If this is a leaf element, capture it
	if (isLeafElement(element)) {
		// Get computed border-radius from the element's styles
		const computedBorderRadius = computedStyle.borderRadius || "0px";

		// For elements with text-only content, temporarily wrap in span to measure text width
		let measureTarget: Element = element;
		let tempSpan: HTMLSpanElement | null = null;

		if (element.childNodes.length > 0) {
			// Check if all children are text nodes
			const hasOnlyText = Array.from(element.childNodes).every(
				(node) => node.nodeType === Node.TEXT_NODE
			);

			if (hasOnlyText && !isIcon) {
				// Create temporary span wrapper (skip for icons as they use font glyphs)
				tempSpan = document.createElement("span");
				tempSpan.style.display = "inline";

				// Move text content to span
				while (element.firstChild) {
					tempSpan.appendChild(element.firstChild);
				}
				element.appendChild(tempSpan);
				measureTarget = tempSpan;
			}
		}

		// Measure the target element (span if wrapped, original element otherwise)
		const targetRect = measureTarget.getBoundingClientRect();

		const info: LeafRect = {
			x: (isIcon ? rect.left : targetRect.left) - parentRect.left,
			y: (isIcon ? rect.top : targetRect.top) - parentRect.top,
			width: isIcon ? effectiveWidth : targetRect.width,
			height: isIcon ? effectiveHeight : targetRect.height,
			borderRadius: computedBorderRadius,
		};

		// Clean up temporary span
		if (tempSpan) {
			// Move text back to original element
			while (tempSpan.firstChild) {
				element.insertBefore(tempSpan.firstChild, tempSpan);
			}
			element.removeChild(tempSpan);
		}

		elements.push(info);
	} else {
		// For non-leaf elements, we need to handle mixed content (elements + text nodes)
		// Process them in order to preserve layout
		const childNodes = Array.from(element.childNodes);

		childNodes.forEach((node) => {
			if (node.nodeType === Node.ELEMENT_NODE) {
				// Process element children recursively
				elements.push(
					...extractElementInfo(node as Element, parentRect)
				);
			} else if (
				node.nodeType === Node.TEXT_NODE &&
				node.textContent?.trim()
			) {
				// Handle text nodes by wrapping in temporary span
				const tempSpan = document.createElement("span");
				const parentStyles = window.getComputedStyle(element);

				// Copy font styles for accurate measurement
				tempSpan.style.font = parentStyles.font;
				tempSpan.style.fontSize = parentStyles.fontSize;
				tempSpan.style.fontFamily = parentStyles.fontFamily;
				tempSpan.style.fontWeight = parentStyles.fontWeight;
				tempSpan.style.letterSpacing = parentStyles.letterSpacing;
				tempSpan.style.lineHeight = parentStyles.lineHeight;
				tempSpan.style.textTransform = parentStyles.textTransform;

				// Replace text node with span temporarily
				const parent = node.parentNode;
				if (parent) {
					tempSpan.textContent = node.textContent;
					parent.replaceChild(tempSpan, node);

					// Force reflow and measure
					void tempSpan.offsetHeight;
					const spanRect = tempSpan.getBoundingClientRect();

					if (spanRect.width > 0 && spanRect.height > 0) {
						elements.push({
							x: spanRect.left - parentRect.left,
							y: spanRect.top - parentRect.top,
							width: spanRect.width,
							height: spanRect.height,
							borderRadius: "0px",
						});
					}

					// Restore original text node
					parent.replaceChild(node, tempSpan);
				}
			}
		});
	}

	return elements;
}

export function measureLeaves(container: HTMLElement): LeafRect[] {
	const parentRect = container.getBoundingClientRect();
	const out: LeafRect[] = [];
	for (const child of Array.from(container.children)) {
		out.push(...extractElementInfo(child, parentRect));
	}
	return out;
}
