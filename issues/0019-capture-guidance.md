# Capture Guidance

## What to build

Add user-visible Capture Guidance for common quality problems during phone capture. Guidance should help the user adjust the card quickly when the app detects blur, glare, darkness, multiple cards, incomplete framing, or likely covered text regions.

## Acceptance criteria

- [ ] Capture Client can show guidance for blurry or moving frames.
- [ ] Capture Client can show guidance for strong glare.
- [ ] Capture Client can show guidance for too-dark images.
- [ ] Capture Client can show guidance when multiple cards appear visible.
- [ ] Capture Client can show guidance when the card is not fully in frame.
- [ ] Capture Client can show generic guidance when name or Set Code regions appear unavailable.
- [ ] Guidance does not block manual capture fallback.

## Blocked by

- [0015 Capture Burst Upload](./0015-capture-burst-upload.md)
- [0017 Server-Side OCR Pipeline](./0017-server-side-ocr-pipeline.md)
