# Server-side OCR first

The capture client will initially send card images or cropped candidate regions to the server-side application for OCR and card matching. This keeps capture behavior easier to debug and lets the OCR pipeline evolve in one place, while preserving a boundary that can later accept phone-side OCR results if benchmarking shows that on-device processing is faster on the intended scanning phone.
