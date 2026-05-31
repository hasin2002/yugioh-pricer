# Local card metadata cache

The app will keep a local cache of Yu-Gi-Oh card metadata for fast OCR matching by card name, set code, and passcode. The cache should refresh when older than 12 hours, when manually requested, and on local server restart so local development and scanning do not depend on stale metadata. Pricing for newly scanned or refreshed cards should still fetch fresh source results so the cache improves identification speed without making price snapshots stale by default.
