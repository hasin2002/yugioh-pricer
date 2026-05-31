# Best frame filesystem storage

Best frame images will be stored as files on local disk, with SQLite storing image metadata and paths. This keeps the local database small and makes captured images easier to inspect and clean up; if the app is later deployed, the stored reference can point to remote image storage instead of a local path.
