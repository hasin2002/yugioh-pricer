# Yu-Gi-Oh Pricer

Local-first app shell for pricing and reviewing Yu-Gi-Oh cards.

## Commands

```sh
npm run dev
npm test
npm run db:migrate
```

The first slice uses Next.js, Tailwind CSS v4, tRPC, Drizzle, and SQLite.

## iPhone HTTPS camera smoke test

The capture client is available at `/capture`. iPhone Safari requires a secure
context before it will expose the camera, so use a Cloudflare Tunnel URL rather
than the local LAN address.

1. Install and authenticate `cloudflared`.
2. Start the app locally:

   ```sh
   npm run db:migrate
   npm run dev
   ```

3. In another terminal, open a temporary tunnel to the Next.js dev server:

   ```sh
   cloudflared tunnel --url http://localhost:3000
   ```

4. Open the generated `https://...trycloudflare.com/capture` URL in iPhone
   Safari.
5. Allow camera permission, frame a card with the rear camera, tap
   `Capture still`, then tap `Upload Best Frame`.

Uploaded still frames are stored under `data/best-frames/`, and their metadata
is recorded in the local SQLite `best_frames` table. If the page is opened
without HTTPS, if camera permission is blocked, if no camera is available, or if
the upload fails, the capture client shows the next action to take.
