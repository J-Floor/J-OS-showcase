// letterhead.typ — blank page for the printed inventory list.
// pdf-lib stamps the date, the table and "Page X of Y" onto it at print time
// (inventoryListPdf.ts). Compile command: see agreements/build.ts.
#import "/agreements/lib.typ": letterhead
#show: letterhead.with(title: "Inventory List", page-numbers: false)
// An empty body lays the page out with default styles, which moves the
// footer; this invisible content makes the letterhead's styles apply.
#v(0pt)
