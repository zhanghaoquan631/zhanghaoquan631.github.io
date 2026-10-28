# Free Font catalog

Metadata source: https://github.com/jaywcjlove/free-font
Website: https://wangchujiang.com/free-font/
Snapshot: `8602c6e4603516ca531e93bf98b64f0382883343` (2026-10-20).

The local catalog contains 1,048 distinct upstream files: 983 TTF/OTF font
files and 65 TTC collections. Common weight/italic suffixes are grouped into
648 browsing groups. This is a metadata grouping, not a verified count of
independent typeface designs. A collection is previewed using its first face.

The catalog and one small SVG specimen per family ship with this player.
Specimens contain outlines extracted from a representative face at the pinned
revision; they do not substitute a generic font. Browsing cards never downloads
or decodes a complete font. The font selected for trial text or lyrics is
downloaded from the pinned upstream revision on demand. Font copyrights and
licenses remain with their respective authors. The repository is MIT; that
does not replace any font's own license. Entries without an explicit license
are shown as the upstream site's commercial-free claim, not as a new license
verification. Each preview links to its source file and available author page.

Refresh/reproduce the catalog with `node scripts/update-free-font-catalog.mjs`.
This downloads the metadata/file tree only, never the entire font library.
Rebuild the local specimens with `python scripts/build-font-specimens.py`.
The builder uses verified HTTP byte ranges and extracts only the glyphs needed
for each specimen where the source format permits it. Its index records the
representative face and source for each family.
