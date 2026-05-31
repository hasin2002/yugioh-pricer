# Best Frame And OCR Evidence Storage

## What to build

Persist capture evidence for captured items. The server should retain the selected Best Frame, enough Candidate Frame metadata for debugging where needed, and an OCR Evidence shell that can be filled by later OCR work. Item details should expose scan details without cluttering the main tables.

## Acceptance criteria

- [ ] Captured items can store a Best Frame on disk with database metadata.
- [ ] Best Frames are retained indefinitely unless manually cleaned up later.
- [ ] Captured items can store OCR Evidence fields even before real OCR is implemented.
- [ ] Item details show Best Frame when available.
- [ ] OCR Evidence is hidden from main tables but available in an expandable scan details section.
- [ ] Manual Entry items clearly show that no scan image exists.

## Blocked by

- [0015 Capture Burst Upload](./0015-capture-burst-upload.md)
