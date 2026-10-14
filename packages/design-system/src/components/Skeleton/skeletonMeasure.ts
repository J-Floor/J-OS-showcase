export type LeafRect = {
	x: number;
	y: number;
	width: number;
	height: number;
	borderRadius: string;
};

export function observeResize(
	element: HTMLElement,
	callback: () => void
): () => void {
	if (typeof ResizeObserver !== "function") return () => {};
	let raf: number | null = null;
	const ro = new ResizeObserver(() => {
		if (raf !== null) cancelAnimationFrame(raf);
		raf = requestAnimationFrame(() => {
			callback();
			raf = null;
		});
	});
	ro.observe(element);
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

const DEFAULT_ICON_FONT_SIZE = 16;

const FONT_STYLE_PROPERTIES = [
	"font",
	"fontSize",
	"fontFamily",
	"fontWeight",
	"letterSpacing",
	"lineHeight",
	"textTransform",
] as const;

type Size = { width: number; height: number };

/** What `measureLeaf` needs to know about an element's box. */
type LeafBox = { rect: DOMRect; size: Size; isIcon: boolean };

function isLeafElement(element: Element): boolean {
	// eslint-disable-next-line no-restricted-syntax -- tag-name matching, not UI text
	const tag = element.tagName.toLowerCase();
	return (
		ALWAYS_LEAF.includes(tag) ||
		element.hasAttribute("data-icon") ||
		Array.from(element.children).every((child) =>
			// eslint-disable-next-line no-restricted-syntax -- tag-name matching, not UI text
			INLINE_TAGS.includes(child.tagName.toLowerCase())
		)
	);
}

/** Copy font-related styles so a temporary span measures accurately. */
function copyFontStyles(target: HTMLElement, source: CSSStyleDeclaration) {
	for (const property of FONT_STYLE_PROPERTIES) {
		target.style[property] = source[property];
	}
}

/** Reads a layout property so the browser flushes layout before a measure. */
function forceReflow(element: HTMLElement): number {
	return element.offsetHeight;
}

/** The span's rect relative to the parent, or nothing when it has no size. */
function measuredTextRect(span: HTMLElement, parentRect: DOMRect): LeafRect[] {
	const spanRect = span.getBoundingClientRect();
	return spanRect.width > 0 && spanRect.height > 0
		? [
				{
					x: spanRect.left - parentRect.left,
					y: spanRect.top - parentRect.top,
					width: spanRect.width,
					height: spanRect.height,
					borderRadius: "0px",
				},
			]
		: [];
}

/** Moves everything inside `span` back in front of it, then removes it. */
function unwrapSpan(element: Element, span: HTMLSpanElement): void {
	while (span.firstChild) {
		element.insertBefore(span.firstChild, span);
	}
	element.removeChild(span);
}

/** A `display: contents` element's text, measured by wrapping it in a span. */
function measureBareText(element: Element, parentRect: DOMRect): LeafRect[] {
	const hasText = Array.from(element.childNodes).some(
		(node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
	);
	if (!hasText) return [];

	const temporarySpan = document.createElement("span");
	temporarySpan.style.display = "inline";
	copyFontStyles(temporarySpan, window.getComputedStyle(element));

	// Move text to span
	while (element.firstChild) {
		temporarySpan.appendChild(element.firstChild);
	}
	element.appendChild(temporarySpan);

	forceReflow(temporarySpan);
	const measured = measuredTextRect(temporarySpan, parentRect);

	unwrapSpan(element, temporarySpan);
	return measured;
}

/** For `display: contents`, the children participate in the parent's layout. */
function measureDisplayContents(
	element: Element,
	parentRect: DOMRect
): LeafRect[] {
	const elements: LeafRect[] = [];
	for (const child of Array.from(element.children)) {
		elements.push(...extractElementInfo(child, parentRect));
	}
	// If no element children but has text content, measure the text
	if (element.children.length === 0) {
		elements.push(...measureBareText(element, parentRect));
	}
	return elements;
}

/** Wraps an all-text element's text in a span, or returns nothing. Icons are
 *  skipped: they use font glyphs. */
function wrapTextOnly(
	element: Element,
	isIcon: boolean
): HTMLSpanElement | undefined {
	if (element.childNodes.length === 0) return undefined;
	const hasOnlyText = Array.from(element.childNodes).every(
		(node) => node.nodeType === Node.TEXT_NODE
	);
	if (!hasOnlyText || isIcon) return undefined;

	const temporarySpan = document.createElement("span");
	temporarySpan.style.display = "inline";
	while (element.firstChild) {
		temporarySpan.appendChild(element.firstChild);
	}
	element.appendChild(temporarySpan);
	return temporarySpan;
}

/** A leaf element's rect; an all-text element is measured through a
 *  temporary span so the rect is the text's width. */
function measureLeaf(
	element: Element,
	parentRect: DOMRect,
	box: LeafBox,
	borderRadius: string
): LeafRect {
	const { rect, size, isIcon } = box;
	const temporarySpan = wrapTextOnly(element, isIcon);

	// Measure the target element (span if wrapped, original element otherwise)
	const targetRect = (temporarySpan ?? element).getBoundingClientRect();

	const info: LeafRect = {
		x: (isIcon ? rect.left : targetRect.left) - parentRect.left,
		y: (isIcon ? rect.top : targetRect.top) - parentRect.top,
		width: isIcon ? size.width : targetRect.width,
		height: isIcon ? size.height : targetRect.height,
		borderRadius,
	};

	if (temporarySpan) unwrapSpan(element, temporarySpan);
	return info;
}

/** A bare text node, measured by swapping a span in for it. */
function measureTextNode(
	node: Node,
	element: Element,
	parentRect: DOMRect
): LeafRect[] {
	const temporarySpan = document.createElement("span");
	copyFontStyles(temporarySpan, window.getComputedStyle(element));

	// Replace text node with span temporarily
	const parent = node.parentNode;
	if (!parent) return [];
	temporarySpan.textContent = node.textContent;
	parent.replaceChild(temporarySpan, node);

	forceReflow(temporarySpan);
	const measured = measuredTextRect(temporarySpan, parentRect);

	// Restore original text node
	parent.replaceChild(node, temporarySpan);
	return measured;
}

/** A non-leaf element's mixed content (elements and text nodes), in order to
 *  preserve layout. */
function measureMixedContent(
	element: Element,
	parentRect: DOMRect
): LeafRect[] {
	const elements: LeafRect[] = [];
	for (const node of Array.from(element.childNodes)) {
		if (node.nodeType === Node.ELEMENT_NODE) {
			elements.push(...extractElementInfo(node as Element, parentRect));
		} else if (
			node.nodeType === Node.TEXT_NODE &&
			node.textContent?.trim()
		) {
			elements.push(...measureTextNode(node, element, parentRect));
		}
	}
	return elements;
}

function extractElementInfo(element: Element, parentRect: DOMRect): LeafRect[] {
	// Skip nested Shimmer containers to prevent double-shimmer
	if (element.getAttribute("data-shimmer-container") === "true") return [];

	const computedStyle = window.getComputedStyle(element);
	if (computedStyle.display === "contents") {
		return measureDisplayContents(element, parentRect);
	}

	const rect = element.getBoundingClientRect();

	// For icon elements, always use font-size for dimensions since icon fonts
	// don't render properly in the hidden measurement container
	const isIcon = element.hasAttribute("data-icon");
	let size: Size = { width: rect.width, height: rect.height };
	if (isIcon) {
		// Icons use 1em sizing with aspect-ratio: 1
		const fontSize =
			parseFloat(computedStyle.fontSize) || DEFAULT_ICON_FONT_SIZE;
		size = { width: fontSize, height: fontSize };
	}

	// Skip elements with no dimensions
	if (size.width === 0 || size.height === 0) return [];

	if (isLeafElement(element)) {
		return [
			measureLeaf(
				element,
				parentRect,
				{ rect, size, isIcon },
				computedStyle.borderRadius || "0px"
			),
		];
	}
	return measureMixedContent(element, parentRect);
}

export function measureLeaves(container: HTMLElement): LeafRect[] {
	const parentRect = container.getBoundingClientRect();
	const out: LeafRect[] = [];
	for (const child of Array.from(container.children)) {
		out.push(...extractElementInfo(child, parentRect));
	}
	return out;
}
