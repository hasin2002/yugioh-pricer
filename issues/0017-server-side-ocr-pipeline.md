# Server-Side OCR Pipeline

## What to build

Add the first server-side OCR pipeline. It should favor recognition accuracy over easiest TypeScript integration, process Candidate Frames or crops, extract card name, Set Code, edition, and Passcode candidates, and save OCR Evidence.

## Acceptance criteria

- [ ] Server-side OCR can process uploaded Candidate Frames or crops.
- [ ] OCR returns candidates for card name, Set Code, edition, and Passcode where visible.
- [ ] OCR Evidence stores captured text, confidence where available, and source region information.
- [ ] OCR can run without external paid cloud credentials.
- [ ] Local capture can continue to save evidence when internet pricing is unavailable.
- [ ] OCR failure creates a reviewable captured item rather than losing the scan.

## Blocked by

- [0015 Capture Burst Upload](./0015-capture-burst-upload.md)
- [0016 Best Frame And OCR Evidence Storage](./0016-best-frame-and-ocr-evidence-storage.md)
