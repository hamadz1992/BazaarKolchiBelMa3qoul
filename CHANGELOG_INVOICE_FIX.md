# Invoice / Barcode Fix

- Fixed mobile invoice barcode rendering: the white SVG background is no longer styled as a black bar.
- Barcode bars now have their own class, keeping the background white and the bars black.
- Preserved Code 128-B encoding and invoice number payload.
- Updated mobile invoice visual styling to match the provided reference receipt: centered store heading, invoice type, dashed separators, structured metadata, bordered item table, totals and customer debt section.
- Updated desktop invoice preview and print barcode SVG markup with explicit background/bar classes.
- No sales, inventory, synchronization, customer, or database logic changed.
