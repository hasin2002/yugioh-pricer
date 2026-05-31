# Yu-Gi-Oh Pricer

Local-first app shell for pricing and reviewing Yu-Gi-Oh cards.

## Commands

```sh
npm run dev
npm test
npm run db:migrate
```

The first slice uses Next.js, Tailwind CSS v4, tRPC, Drizzle, and SQLite.

## Design foundation

The app uses shadcn/ui primitives in `src/components/ui` with Tailwind CSS v4.
The theme is neutral/slate with white work surfaces, dark slate primary actions,
and a restrained teal focus/accent token. Keep new feature styling on shadcn
components first, then add local Tailwind utilities for layout and density.

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

4. Start the app with the tunnel origin configured so the Review Client can
   generate phone-safe join links:

   ```sh
   PHONE_SAFE_HTTPS_ORIGIN=https://...trycloudflare.com npm run dev
   ```

5. Open the Review Client, create or select a pricing session, then scan the
   displayed QR code or open the join link in iPhone Safari.
6. Allow camera permission, frame a card with the rear camera, tap
   `Capture still`, then tap `Upload Best Frame`.

Uploaded still frames are stored under `data/best-frames/`, and their metadata
is recorded in the local SQLite `best_frames` table. If the page is opened
without HTTPS, if camera permission is blocked, if no camera is available, or if
the upload fails, the capture client shows the next action to take.
