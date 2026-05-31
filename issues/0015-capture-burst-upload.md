# Capture Burst Upload

## What to build

Implement the Capture Client flow that previews the camera continuously, waits for a stable Single-Card Capture, uploads a four-frame Capture Burst, prevents Repeat Captures, and supports explicit phone-side quantity adjustment for already captured cards.

## Acceptance criteria

- [ ] Capture Client shows detecting, hold steady, captured, and needs review Capture Status states.
- [ ] The client captures four Candidate Frames after the card is stable.
- [ ] If all frames are unusable, the client retries with the next second's four-frame burst.
- [ ] The client uploads selected still frames rather than continuous video.
- [ ] After a usable result, the client asks the user to remove the card before another burst.
- [ ] Recognizing an already captured card shows "already captured" instead of creating a duplicate.
- [ ] The phone can explicitly increase/decrease quantity for an already captured item.
- [ ] Phone decrement cannot reduce quantity below 1.

## Blocked by

- [0002 iPhone HTTPS Camera Smoke Test](./0002-iphone-https-camera-smoke-test.md)
- [0004 Session Join Codes](./0004-session-join-codes.md)
- [0014 Live Session Events](./0014-live-session-events.md)
