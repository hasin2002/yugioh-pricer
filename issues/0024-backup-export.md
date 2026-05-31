# Backup Export

## What to build

Add a local backup export that packages SQLite data and Best Frame files together. The backup should avoid the common failure mode where database rows are copied without their referenced scan evidence.

## Acceptance criteria

- [ ] The user can trigger a backup export.
- [ ] Backup includes the SQLite database data.
- [ ] Backup includes Best Frame files referenced by captured items.
- [ ] Backup structure preserves enough paths/metadata for future restore work.
- [ ] API card art cache handling is documented as rebuildable cache.
- [ ] Backup export failure produces a meaningful error.

## Blocked by

- [0013 API Card Art Cache](./0013-api-card-art-cache.md)
- [0016 Best Frame And OCR Evidence Storage](./0016-best-frame-and-ocr-evidence-storage.md)
