# iPhone HTTPS Camera Smoke Test

## What to build

Prove the riskiest capture path before OCR work begins. The app should provide a simple phone-accessible Capture Client over HTTPS using Cloudflare Tunnel, open the rear camera in iPhone Safari, capture a still frame, upload it to the server, and save it as a Best Frame.

## Acceptance criteria

- [ ] Setup instructions explain the simplest Cloudflare Tunnel path for opening the local app on an iPhone.
- [ ] The Capture Client detects missing secure context and shows a meaningful error.
- [ ] iPhone Safari requests camera permission and displays the rear camera stream.
- [ ] The Capture Client can capture one still frame and upload it to the server.
- [ ] The server saves the uploaded still frame as a Best Frame.
- [ ] Camera permission, HTTPS, unavailable camera, and upload failures have actionable error messages.

## Blocked by

- [0001 Scaffold Local-First App Shell](./0001-scaffold-local-first-app-shell.md)
