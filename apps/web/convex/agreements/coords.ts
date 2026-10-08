// apps/web/convex/agreements/coords.ts
//
// Page-3 signature-block stamp positions in PDF points (origin bottom-left).
// Tuned visually against the rendered blank templates (apps/web/agreements/lib.typ):
//   • A4 = 595.28 × 841.89 pt; margins left/right = 24 mm = 68.03 pt.
//   • Signature block = a 3-column grid (New Member | J floor Board | J floor
//     Board), 14 pt gutters → column width ≈ 143.7 pt.
//       col-0 (signer) left = 68.0  → text-x ≈ 70
//       col-1 (board)  left ≈ 225.7 → text-x ≈ 227
//       col-2 (board)  left ≈ 383.4 → text-x ≈ 385
//   • Each field is a 15 mm (≈ 42.5 pt) box: small label on top, an underline at
//     the bottom. Values are stamped just ABOVE each underline.

export type FieldXY = { x: number; y: number };
export type Variant = "member" | "guest";

type VariantCoords = {
	name: FieldXY;
	company: FieldXY;
	email: FieldXY;
	date: FieldXY;
	signature: { x: number; y: number; w: number; h: number };
	/** Two board columns: board[0] = "J floor Board" left, board[1] = right. */
	board: {
		name: FieldXY;
		role: FieldXY;
		date: FieldXY;
		signature: { x: number; y: number; w: number; h: number };
	}[];
};

// Column text-x positions.
const CX0 = 70; // New Member / signer
const CX1 = 227; // board left
const CX2 = 385; // board right

// Field value baselines (pdf bottom-left y), ~4 pt above each underline.
// Underlines sit at 596.2 / 545.6 / 495.1 / 444.6 / 394.1 pt (field pitch ≈
// 50.5 pt: the 15 mm box plus the signature table's fixed 8pt inter-block
// spacing — see `set par(spacing: 8pt)` in lib.typ's `_party-column`, which
// pins this pitch independent of the body's `par.spacing`). The block sits
// this far down the page because it follows the page's letterhead (logo +
// document title), and header-ascent reserves real space above it — if
// lib.typ's header or margins change, re-measure against the rendered
// template rather than guessing an offset.
const Y_NAME = 600;
const Y_COMPANY = 550; // signer "Company" / board "Role"
const Y_EMAIL = 499; // signer "Professional email"
const Y_DATE = 449; // signer "Date"
const SIG_Y = 398; // signer signature image bottom (above the "Signature" underline)
const SIG_W = 120;
const SIG_H = 28;
// Board signature image box (max w×h). The board column has only 4 fields
// (Name, Role, Date, Signature) vs the member's 5, so its "Date" field is the
// 3rd row — vertically level with the member "Professional email" row
// (Y_EMAIL=499) — and its "Signature" field is the 4th row, level with the
// member "Date" row (Y_DATE=449), one row ABOVE the member signature.
const Y_BOARD_DATE = Y_EMAIL;
const BSIG_Y = Y_DATE;
const BSIG_W = 120;
const BSIG_H = 28;

// Member and guest share the same page-3 signature block layout.
const _coords: VariantCoords = {
	name: { x: CX0, y: Y_NAME },
	company: { x: CX0, y: Y_COMPANY },
	email: { x: CX0, y: Y_EMAIL },
	date: { x: CX0, y: Y_DATE },
	signature: { x: CX0, y: SIG_Y, w: SIG_W, h: SIG_H },
	board: [
		{
			name: { x: CX1, y: Y_NAME },
			role: { x: CX1, y: Y_COMPANY },
			date: { x: CX1, y: Y_BOARD_DATE },
			signature: { x: CX1, y: BSIG_Y, w: BSIG_W, h: BSIG_H },
		},
		{
			name: { x: CX2, y: Y_NAME },
			role: { x: CX2, y: Y_COMPANY },
			date: { x: CX2, y: Y_BOARD_DATE },
			signature: { x: CX2, y: BSIG_Y, w: BSIG_W, h: BSIG_H },
		},
	],
};

export const FIELD_COORDS: Record<Variant, VariantCoords> = {
	member: _coords,
	guest: _coords,
};
