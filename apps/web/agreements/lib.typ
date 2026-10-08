// lib.typ — shared J floor letterhead, footer, typography, and agreement template.
//
// Brand fonts: Manrope (body) + Azeret Mono (display headings, footer, and
// the header's document title). Committed under ./fonts and passed to the
// compiler via `--font-path agreements/fonts` (see the build.ts header).
//
// Use from a document with:
//   #import "lib.typ": agreement
//   #show: agreement.with(title: "Membership Agreement", new-party-label: "New Member")
//   == The Deal
//   ...
//
// Headings: `==` (h2, sections) are set in Azeret Mono. Body is Manrope. The
// document title is passed as `title:` and shown in the header next to the
// framed J logo (./logo-framed.svg) on every page. The signature block is left
// blank and stamped per-signer at runtime by pdf-lib (see convex/agreements/pdf.ts).

#let _body-font = "Manrope"
#let _display-font = "Azeret Mono"
#let _ink = rgb("#1a1a1a")
#let _muted = rgb("#666")

// ─── Header: framed J logo + document title, same on every page ─────────────

#let _logo-height = 36pt

#let _header(title) = align(bottom, grid(
  columns: (auto, 1fr),
  column-gutter: 12pt,
  align: (left + bottom, left + bottom),
  image("logo-framed.svg", height: _logo-height),
  text(font: _display-font, size: 15pt, weight: "bold", title),
))

// ─── Footer: rule + tagline + page number ────────────────────────────────────

#let _footer(page-numbers) = {
  line(length: 100%, stroke: 0.6pt + _ink)
  v(2pt)
  set text(size: 8pt, font: _display-font, fill: _muted)
  grid(
    columns: (1fr, auto),
    align(left, "J floor. Build in Zurich. Capture the world."),
    align(right, if page-numbers { context "Page " + counter(page).display("1 of 1", both: true) }),
  )
}

// ─── Blank signature block (stamped at runtime by pdf-lib) ────────────────────
// Each field is a fixed-height box with a small label and an underline; the area
// above the underline is left BLANK. Fixed heights keep the stamp coordinates
// deterministic (see convex/agreements/coords.ts).

#let _field-height = 15mm

#let _sig-field(label) = block(width: 100%, height: _field-height, {
  text(size: 7.5pt, fill: _muted, label)
  place(bottom, line(length: 100%, stroke: 0.4pt + rgb("#999")))
})

#let _party-column(header, fields) = block(width: 100%, {
  text(font: _body-font, size: 9pt, weight: "bold", header)
  v(5pt)
  // Fixed pitch, deliberately decoupled from the body's `par.spacing` (set in
  // `agreement()`) — the stamp coordinates in convex/agreements/coords.ts are
  // tuned against this exact field pitch, so it must not drift when body
  // typography changes.
  set par(spacing: 8pt)
  for f in fields { _sig-field(f) }
})

#let signature-table(new-party-label: "New Member") = {
  let member-fields = ("Name", "Company", "Professional email", "Date", "Signature")
  let board-fields = ("Name", "Role", "Date", "Signature")
  grid(
    columns: (1fr, 1fr, 1fr),
    column-gutter: 14pt,
    _party-column(new-party-label, member-fields),
    _party-column("J floor Board", board-fields),
    _party-column("J floor Board", board-fields),
  )
}

// ─── Letterhead: page, typography, header and footer ─────────────────────────
// Shared by the agreements and the inventory list letterhead
// (src/modules/inventory/print/letterhead.typ). With page-numbers: false the
// footer leaves "Page X of Y" blank; the inventory list stamps it at runtime.

#let letterhead(title: "", page-numbers: true, body) = {
  set document(title: title)
  set page(
    paper: "a4",
    margin: (top: 34mm, bottom: 22mm, x: 24mm),
    header: _header(title),
    header-ascent: 12mm,
    footer: _footer(page-numbers),
    footer-descent: 6mm,
  )
  set text(font: _body-font, size: 9.5pt, fill: _ink)
  body
}

// ─── Agreement template ───────────────────────────────────────────────────────

#let agreement(title: "", new-party-label: "New Member", body) = {
  show: letterhead.with(title: title)
  set par(justify: true, leading: 0.65em, spacing: 1.2em)
  set list(indent: 10pt, body-indent: 6pt, spacing: 0.6em)

  show heading.where(level: 2): it => block(above: 22pt, below: 12pt, text(
    font: _display-font,
    size: 13pt,
    weight: "bold",
    it.body,
  ))

  body

  // Signature section on its own (final) page.
  pagebreak()
  text(font: _display-font, size: 15pt, weight: "bold", "Agreement")
  v(9pt)
  par[
    By signing below, I confirm that I have read and understood this agreement,
    the Privacy Policy and the J floor Space Guide, and agree to their terms.
  ]
  v(16pt)
  signature-table(new-party-label: new-party-label)
}
