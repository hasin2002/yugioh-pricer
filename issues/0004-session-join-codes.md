# Session Join Codes

## What to build

Add Session Join Codes that bind a Capture Client to exactly one Pricing Session. The Review Client should display a phone-safe join link and QR code, enforce one Active Capture Client per Pricing Session, and warn when joining an Archived Session.

## Acceptance criteria

- [ ] A Pricing Session exposes a Session Join Code as a link and QR code.
- [ ] The join link targets the configured phone-safe HTTPS origin.
- [ ] If no phone-safe HTTPS origin is configured, the Review Client warns that phone camera capture may not work.
- [ ] A Session Join Code joins exactly one Pricing Session.
- [ ] One Active Capture Client is allowed per Pricing Session.
- [ ] A second Capture Client is rejected or offered a clear replace-existing-client path.
- [ ] Joining an Archived Session shows a warning before capture starts.

## Blocked by

- [0002 iPhone HTTPS Camera Smoke Test](./0002-iphone-https-camera-smoke-test.md)
- [0003 Pricing Session Dashboard](./0003-pricing-session-dashboard.md)
