# PRD: Yu-Gi-Oh Card Pricing App

## Problem Statement

The user wants a fast, local-first way to price physical Yu-Gi-Oh cards while sorting them. Existing manual lookup workflows are too slow because each card may require identifying the exact Printing Identity, confirming rarity, finding pricing, tracking quantity, and remembering which cards still need review.

The user also previously attempted a phone camera workflow and could not get the iPhone camera working from a Mac-hosted local HTTP site. The product must therefore de-risk secure iPhone camera access early, before investing in OCR and pricing workflows.

## Solution

Build a local-first web app for a Personal Collection. The Review Client runs on desktop and manages the home dashboard, Pricing Sessions, Review Queue, Card Records, Estimated Value, and manual correction. The Capture Client runs on an iPhone in Safari, joins a specific Pricing Session through a Session Join Code, and focuses on fast Single-Card Capture.

The app will first prove iPhone camera access over HTTPS using Cloudflare Tunnel. After that, it will build desktop session and collection functionality, then add server-side OCR, card matching, and pricing.

The app will use YGOPRODeck as the baseline Pricing Source, optionally enrich with eBay Comparison Evidence and eBay Price Snapshots, display values in GBP, and preserve Price Snapshots rather than overwriting pricing history. Rarity Confirmation is always required before a captured item becomes a Successfully Scanned Item.

## User Stories

1. As a card sorter, I want to create a Pricing Session, so that I can scan a batch of cards into one durable workspace.
2. As a card sorter, I want every Pricing Session to remain resumable, so that I can return to old sorting work without reopening a closed state.
3. As a card sorter, I want new sessions to have automatic editable names, so that I can start quickly and rename them later.
4. As a card sorter, I want the home page to show recent Pricing Sessions, so that I can resume the right work quickly.
5. As a card sorter, I want the home page to show Collection Estimated Value, so that I can understand the current value of my Personal Collection.
6. As a card sorter, I want the home page to show Review Queue count, so that I know how much unresolved work remains.
7. As a card sorter, I want archived sessions hidden from default views, so that old or excluded sessions do not clutter current work.
8. As a card sorter, I want archived sessions excluded from Collection Estimated Value, so that historical/test scans do not inflate my collection.
9. As a card sorter, I want archived sessions to remain editable and viewable, so that I can inspect and correct historical session data.
10. As a card sorter, I want to unarchive a session, so that its Successfully Scanned Items can contribute to Collection Estimated Value again.
11. As a card sorter, I want to delete a Pricing Session after confirmation, so that junk/test sessions can be removed deliberately.
12. As a card sorter, I want deleting a Pricing Session to delete its captured items, OCR Evidence, and Best Frames, so that session-owned data is cleaned up.
13. As a card sorter, I want shared cached API card art to survive session deletion, so that other records can continue using it.
14. As a card sorter, I want a Session Review Count for each session, so that I can see how many captured items still need review.
15. As a card sorter, I want the active Pricing Session to show Session Estimated Value, so that I can see the running value of the current scan batch.
16. As a card sorter, I want Review Items excluded from Session Estimated Value, so that incomplete cards do not make the total misleading.
17. As a card sorter, I want stale prices to still count toward Estimated Value, so that totals do not disappear just because time passed.
18. As a card sorter, I want stale prices visibly marked, so that I know when to refresh pricing.
19. As a card sorter, I want a refresh-all-pricing action with a confirmation dialog, so that I can update prices intentionally.
20. As a card sorter, I want refresh-all-pricing to skip archived sessions and Review Items by default, so that it only updates collection-contributing cards.
21. As a card sorter, I want a Session Join Code shown as a link and QR code, so that my iPhone can join the exact Pricing Session.
22. As a card sorter, I want the Session Join Code to bind to exactly one Pricing Session, so that scans do not go to the wrong session.
23. As a card sorter, I want join codes to remain valid until regenerated, revoked, or the session is deleted, so that long sorting sessions are not interrupted.
24. As a card sorter, I want only one Active Capture Client per Pricing Session, so that duplicate prevention and event ordering stay simple.
25. As a card sorter, I want the phone to show an archived-session warning before scanning into an Archived Session, so that I do not accidentally add excluded cards.
26. As a card sorter, I want the phone Capture Client to work in Safari, so that I do not need a PWA or installed app for v1.
27. As a card sorter, I want the Capture Client to run over HTTPS through a simple Cloudflare Tunnel setup, so that iPhone camera permissions work reliably.
28. As a card sorter, I want an early iPhone camera smoke test, so that camera access is proven before OCR work begins.
29. As a card sorter, I want the iPhone camera smoke test to capture a still frame and send it to the server, so that the end-to-end capture path is proven.
30. As a card sorter, I want meaningful camera permission and HTTPS error messages, so that I can troubleshoot quickly.
31. As a card sorter, I want the phone screen to stay awake during scanning where supported, so that long sorting sessions are not interrupted.
32. As a card sorter, I want the Capture Client to focus on one card at a time, so that scanning remains fast and reliable.
33. As a card sorter, I want clear Capture Status states such as detecting, hold steady, captured, and needs review, so that I know what the phone is doing.
34. As a card sorter, I want Capture Guidance for blur, glare, darkness, occlusion, multiple cards, or incomplete framing, so that I can adjust the card quickly.
35. As a card sorter, I want the phone to auto-capture continuously after the card is stable, so that I do not need to tap for every card.
36. As a card sorter, I want manual capture fallback, so that I can force a capture when auto-capture struggles.
37. As a card sorter, I want the phone to send a Capture Burst of four Candidate Frames, so that the server can choose the clearest Best Frame.
38. As a card sorter, I want the phone to retry with the next four frames if all Candidate Frames are unusable, so that temporary blur or glare does not block scanning.
39. As a card sorter, I want upload to use selected still frames rather than continuous video, so that scanning stays lightweight.
40. As a card sorter, I want the Capture Client to enter a captured/remove-card state after a usable result, so that one card does not register repeatedly.
41. As a card sorter, I want Repeat Capture detection, so that the same visible card does not create duplicate rows.
42. As a card sorter, I want the phone to show "already captured" when the same card is recognized again, so that I understand why no new item was created.
43. As a card sorter, I want phone-side +/- quantity controls for already captured cards, so that I can explicitly adjust Card Quantity for additional copies.
44. As a card sorter, I want phone-side quantity decrement to stop at 1, so that I do not accidentally remove a captured item from a small phone control.
45. As a card sorter, I want condition differences handled on desktop, so that the Capture Client remains capture-first.
46. As a card sorter, I want live desktop updates as the phone captures cards, so that I can watch Successfully Scanned Items and Review Items arrive without refreshing.
47. As a card sorter, I want the desktop Pricing Session to split Successfully Scanned Items and Requires Review, so that resolved and unresolved cards are easy to manage.
48. As a card sorter, I want Review Reasons to distinguish Rarity Review from Identification Review, so that quick review work is not mixed with deeper correction work.
49. As a card sorter, I want Rarity Review optimized inline, so that I can confirm many mostly-correct cards quickly.
50. As a card sorter, I want guarded bulk Rarity Confirmation for selected similar items, so that repetitive confirmation can be faster without broad accidental changes.
51. As a card sorter, I want Rarity Confirmation to be required for success, so that OCR/API rarity guesses never silently drive pricing.
52. As a card sorter, I want likely rarity options ranked first while the full rarity list remains searchable, so that review is fast but complete.
53. As a card sorter, I want user-selected rarity to win over source data, so that I can correct incomplete or wrong API information.
54. As a card sorter, I want a warning when selected rarity conflicts with source data, so that I can notice unusual choices.
55. As a card sorter, I want all fields to be manually editable, so that OCR and API data never trap bad values.
56. As a card sorter, I want Manual Corrections to apply to the specific item for v1, so that hidden training rules do not create bad future matches.
57. As a card sorter, I want Manual Entry from the desktop, so that I can add cards when scanning is unavailable or unnecessary.
58. As a card sorter, I want Manual Entry to follow the same pricing/review flow, so that manually added cards behave consistently.
59. As a card sorter, I want Manual Entry to allow no Best Frame, so that desktop-only card entry is not blocked by missing scan evidence.
60. As a card sorter, I want Best Frames retained with captured items, so that I can review and troubleshoot what the phone saw.
61. As a card sorter, I want OCR Evidence stored with captured items, so that bad scans can be debugged later.
62. As a card sorter, I want OCR Evidence hidden by default but available in details, so that the main UI stays clean.
63. As a card sorter, I want the scanner to prioritize card name and Set Code, so that Printing Identity can be resolved quickly.
64. As a card sorter, I want Passcode stored when found, so that it can help identify the card family without being treated as a full pricing identity.
65. As a card sorter, I want partial lookups from name, Set Code, or Passcode, so that useful candidates appear even when OCR is incomplete.
66. As a card sorter, I want name-only matches to require review, so that different printings are not priced incorrectly.
67. As a card sorter, I want Printing Identity to include card name, Set Code, rarity, edition, and language, so that pricing and grouping happen at the right level.
68. As a card sorter, I want Card Language to default to English, so that common UK/English scanning is fast.
69. As a card sorter, I want Card Edition to default to 1st Edition with Limited Edition and Unlimited options, so that edition is quick to set.
70. As a card sorter, I want Condition to default to Mint, so that pack-fresh cards require less input.
71. As a card sorter, I want condition options of Mint, Near Mint, Lightly Played, Moderately Played, Heavily Played, and Damaged, so that condition is controlled.
72. As a card sorter, I want graded/slabbed cards out of scope, so that raw card pricing remains focused.
73. As a card sorter, I want matching duplicate cards grouped by Printing Identity and Condition, so that collection rows stay manageable.
74. As a card sorter, I want Card Quantity to be editable, so that I do not need to scan every duplicate physical copy.
75. As a card sorter, I want desktop quantity splitting, so that one row can become multiple rows when condition, location, or other fields differ.
76. As a card sorter, I want collection rows aggregated by default, so that I see one row per matching record instead of every session contribution.
77. As a card sorter, I want Session Provenance retained for aggregated rows, so that I can see which sessions contributed copies.
78. As a card sorter, I want captured items to remain the underlying source of truth, so that aggregation, archive, and future session merge behavior stay possible.
79. As a card sorter, I want YGOPRODeck baseline pricing fetched for new scanned cards, so that I get a fast initial price.
80. As a card sorter, I want eBay comparison pricing to run in the background when available, so that scanning remains light.
81. As a card sorter, I want eBay Comparison Evidence to show listing titles, prices, links, and confidence, so that I can judge whether eBay matches are useful.
82. As a card sorter, I want eBay to create its own Price Snapshot, so that comparison pricing can be tracked separately from baseline pricing.
83. As a card sorter, I want the Estimated Value Basis globally switchable between YGOPRODeck and eBay, so that totals remain interpretable.
84. As a card sorter, I want YGOPRODeck fallback when eBay pricing is missing, so that eBay-basis totals are not understated unnecessarily.
85. As a card sorter, I want Manual Price as the final fallback for totals, so that externally researched prices can still contribute.
86. As a card sorter, I want Unpriced Items excluded from Estimated Value but visibly counted, so that missing prices are not silently treated as zero.
87. As a card sorter, I want Pricing Issues to distinguish pricing unavailable from no price found, so that retryable failures are clear.
88. As a card sorter, I want Manual Price to include optional source notes, so that I can record where I found a price.
89. As a card sorter, I want all prices shown in GBP, so that totals are meaningful to me.
90. As a card sorter, I want original source currency preserved on Price Snapshots, so that converted prices remain auditable.
91. As a card sorter, I want daily exchange-rate caching with stale fallback, so that non-GBP pricing does not break totals.
92. As a card sorter, I want UK pricing evidence links preferred where possible, so that external references fit my market.
93. As a card sorter, I want local card metadata cached, so that OCR matching is fast and resilient.
94. As a card sorter, I want card metadata refreshed every 12 hours, manually, and on local server restart, so that new cards are found.
95. As a card sorter, I want newly scanned cards to fetch fresh pricing, so that metadata caching does not make price snapshots stale by default.
96. As a card sorter, I want API card art cached locally instead of hotlinked, so that the app complies with YGOPRODeck image policy.
97. As a card sorter, I want API card art downloaded lazily, so that the app does not fetch every card image upfront.
98. As a card sorter, I want card art failure not to block scan success, so that reference media problems do not stop pricing.
99. As a card sorter, I want both API card art and Best Frame shown where available, so that I can compare reference media with my physical card.
100. As a card sorter, I want optional Notes on sessions, card records, and Manual Prices, so that I can record useful context.
101. As a card sorter, I want optional Storage Location per split row, so that I know where copies are stored.
102. As a card sorter, I want optional Disposition with Keep, Trade, Sell, and Undecided, so that collection management is actionable.
103. As a card sorter, I want Disposition to default to Undecided, so that the app does not imply intent I have not chosen.
104. As a card sorter, I want collection search across card name, Set Code, rarity, condition, session name, and notes, so that I can find cards quickly.
105. As a card sorter, I want archived-session records excluded from default search, so that active collection results stay focused.
106. As a card sorter, I want filters to include archived records and Review Items, so that historical lookup remains possible.
107. As a card sorter, I want CSV export for current Pricing Session, active collection, Review Queue, and archived sessions where useful, so that I can work with data in spreadsheets.
108. As a card sorter, I want backup export to include SQLite data and Best Frame files, so that local data can be preserved together.
109. As a card sorter, I want capture to work without internet where local OCR is available, so that card evidence can still be collected.
110. As a card sorter, I want pricing failures from no internet to become retryable Pricing Issues, so that scanned cards can be priced later.
111. As a card sorter, I want eBay credentials stored server-side only, so that credentials do not leak into browser code.
112. As a card sorter, I want eBay features hidden or disabled when credentials are missing, so that the app behaves cleanly without optional setup.

## Implementation Decisions

- Build order:
  - Milestone 0: iPhone HTTPS camera smoke test.
  - Milestone 1: desktop home, Pricing Session, Personal Collection, manual entry, metadata cache, baseline pricing, and persistence.
  - Milestone 2: Capture Client pairing, live events, Best Frame upload, and session capture plumbing.
  - Milestone 3: server-side OCR, card matching, Review Reasons, Rarity Review, and Capture Guidance.
  - Milestone 4: eBay comparison, global Estimated Value Basis, currency conversion, exports, backup, and polish.
- The app stack is local-first Next.js, tRPC, Drizzle, and SQLite.
- tRPC handles normal typed client-server operations.
- WebSocket session events handle live Pricing Session updates.
- SQLite is the durable local database.
- Captured items remain the source of truth; collection aggregates are derived from captured items in v1.
- Best Frames are stored as files on local disk with SQLite metadata and paths.
- If deployed later, Best Frame references should point to remote image storage instead of local paths.
- API card art is cached locally and served by the app, never hotlinked from YGOPRODeck.
- API card art is lazy-loaded only for cards that appear in a Pricing Session or collection.
- The phone Capture Client is Safari-first for v1, not a PWA.
- Phone camera access must be developed and tested over HTTPS.
- Cloudflare Tunnel is the preferred local development path for iPhone camera testing.
- A trusted local certificate is a fallback for fully local networking.
- The Review Client should generate Session Join Codes using the phone-safe HTTPS URL.
- A missing phone-safe HTTPS URL should show a clear capture setup warning.
- One Active Capture Client is allowed per Pricing Session in v1.
- Session Join Codes are bearer-style session-specific links and do not auto-expire in v1.
- Auth is not required in v1, but code should not make later auth difficult.
- The Capture Client uploads selected still Candidate Frames, not continuous video.
- A Capture Burst contains four Candidate Frames.
- A new Capture Burst may be taken from the next second if all frames are unusable.
- After a usable capture, the Capture Client enters a captured/remove-card state to prevent Repeat Captures.
- Repeat Captures do not increase Card Quantity unless the user explicitly uses +/- controls.
- Phone quantity controls adjust Review Item quantity and floor at 1.
- Condition differences and quantity splitting are handled on desktop.
- Server-side OCR is implemented first.
- The OCR boundary should allow future phone-side OCR results without changing review/pricing flow.
- OCR implementation should favor accuracy over the simplest TypeScript integration.
- OCR should prioritize card name and Set Code, then edition and Passcode where available.
- Partial lookup is allowed, but confidence/review behavior depends on which fields are present.
- Rarity Confirmation is always required before an item becomes Successfully Scanned.
- The Review Client should support a fast inline Rarity Review workflow.
- Rarity dropdown uses the deduplicated reference data in the rarity reference, with search aliases.
- Condition dropdown uses the condition reference and defaults to Mint.
- Card Language defaults to English.
- Card Edition defaults to 1st Edition and supports Limited Edition and Unlimited.
- YGOPRODeck is the baseline Pricing Source.
- eBay is optional comparison/enrichment and can become a global Estimated Value Basis.
- Estimated Value Basis is global, not per-item.
- When eBay basis is selected and eBay pricing is missing, fallback to YGOPRODeck.
- When source pricing is missing, Manual Price is the final fallback.
- Unpriced Items are excluded from Estimated Value and shown visibly.
- Stale Price threshold is seven days.
- Stale prices still count toward Estimated Value and are visibly marked.
- Refresh-all-pricing skips archived sessions and Review Items by default.
- Display Currency is GBP.
- Non-GBP source prices are converted to GBP for totals while preserving original amount and currency.
- Exchange rates should be fetched from a reliable free public API without keys if possible.
- Exchange rates are cached daily, with stale fallback up to seven days.
- Card metadata is cached locally for OCR matching.
- Card metadata refreshes when older than 12 hours, on manual request, and on local server restart.
- Existing card prices do not bulk-refresh automatically on server restart.
- eBay credentials are server-only environment variables.
- The UI should gracefully handle missing eBay credentials.
- CSV export is included in v1; import is out of scope.
- Backup export should package SQLite data and Best Frame files.
- Full edit audit logs are out of scope; keep lightweight history around scan time, price snapshots, and session provenance.

### Proposed Deep Modules

- Capture access module: owns camera permission probing, secure-context checks, rear-camera stream setup, wake lock, still-frame capture, and user-facing camera errors.
- Capture quality module: evaluates local preview frames for stability, blur, glare, darkness, card framing, multiple-card presence, and likely occlusion.
- Capture burst module: coordinates four-frame bursts, retry timing, Best Frame selection inputs, and Repeat Capture suppression.
- Session event module: exposes a simple event interface for Pricing Session updates while keeping SQLite as source of truth.
- Card metadata cache module: downloads, refreshes, searches, and indexes YGOPRODeck metadata by name, Set Code, and Passcode.
- OCR pipeline module: accepts Candidate Frames/crops and returns OCR Evidence with field candidates and confidence.
- Card matching module: converts OCR Evidence and metadata into candidate Printing Identities and Review Reasons.
- Pricing module: fetches YGOPRODeck Price Snapshots, handles eBay comparison snapshots, tracks Pricing Issues, and supports Manual Price.
- Estimated value module: calculates Session Estimated Value and Collection Estimated Value from selected Estimated Value Basis, fallbacks, Card Quantity, stale flags, archived-session rules, and Unpriced Items.
- Currency module: converts source prices into GBP using cached exchange rates while preserving source currency.
- Collection aggregation module: derives aggregated collection rows from captured items while preserving Session Provenance.
- Review workflow module: manages Rarity Review, Identification Review, Manual Correction, promotion to Successfully Scanned Item, and guarded bulk rarity confirmation.
- Media storage module: stores Best Frames, lazy-cached API card art, metadata, cleanup behavior, and future remote storage compatibility.
- Export/backup module: generates CSV exports and backup packages containing SQLite data plus Best Frames.

## Testing Decisions

- Tests should verify external behavior and domain outcomes, not internal implementation details.
- Capture access should have browser-level smoke testing on a real iPhone/Safari path before OCR work is considered reliable.
- Secure-context behavior should be tested with the Cloudflare Tunnel setup, including clear failure messaging when HTTPS is missing.
- Capture quality should be tested with representative images for blur, glare, darkness, multiple cards, incomplete framing, and covered text regions.
- Capture burst behavior should be tested around four-frame burst selection, retry timing, captured/remove-card state, and Repeat Capture suppression.
- Session event behavior should be tested with two clients observing the same Pricing Session and receiving live changes.
- Card metadata cache should be tested for refresh-on-startup, 12-hour freshness, manual refresh, and lookup by name, Set Code, and Passcode.
- OCR pipeline tests should use fixed image fixtures and assert returned OCR Evidence shape and field candidates.
- Card matching tests should cover name + Set Code, Set Code only, name only, Passcode only, conflicting candidates, and ambiguous matches.
- Review workflow tests should assert that rarity is always required before Successfully Scanned Item promotion.
- Review workflow tests should assert that Rarity Review and Identification Review are assigned correctly.
- Pricing tests should cover YGOPRODeck success, YGOPRODeck no price found, source unavailable, eBay missing credentials, eBay comparison success, and Manual Price fallback.
- Estimated value tests should cover YGOPRODeck basis, eBay basis with YGOPRODeck fallback, Manual Price fallback, Unpriced Items, stale prices, Card Quantity, archived sessions, and Review Item exclusion.
- Currency tests should cover source currency preservation, GBP display conversion, daily cache freshness, stale fallback, and failed exchange-rate fetches.
- Collection aggregation tests should cover grouping by Printing Identity and Condition, quantity splitting, Storage Location splits, Disposition, and Session Provenance.
- Media storage tests should cover Best Frame persistence, session deletion cleanup, API card art lazy caching, and no hotlinking behavior.
- Export tests should verify CSV columns and population when data is missing.
- Backup tests should verify that SQLite data and Best Frame files are included together.
- UI tests should cover home dashboard, active Pricing Session layout, Requires Review and Successfully Scanned split, item details, OCR Evidence disclosure, stale-price indicators, and archive filters.
- Destructive actions should be tested for confirmation dialogs before session/card deletion.

## Out of Scope

- Multi-user accounts, teams, shared collections, and full authentication.
- Graded or slabbed card pricing.
- Barcode or QR-like card scanning.
- Multi-card spread/batch scanning in the camera frame.
- Sale tracking, buyers, fees, shipping, payment status, and profit/loss.
- CSV import.
- Full field-by-field edit audit logs.
- Session merging in v1, though captured-item-based storage should avoid making it difficult later.
- Moving captured items between sessions in v1.
- Per-item Estimated Value Basis.
- Phone-side OCR implementation in v1.
- PWA/home-screen install behavior in v1.
- Tags in v1.
- Full undo system in v1.
- Bulk pre-download of all API card art.

## Further Notes

- This PRD was generated from the resolved glossary, reference data, and ADRs in the workspace.
- The issue tracker and triage label vocabulary are not configured in this workspace. This PRD should be published to the project issue tracker with the `ready-for-agent` label once a tracker exists.
- The current workspace is planning-only and is not a git repository.
- The most important early risk is iPhone camera access. Do not defer the HTTPS camera smoke test until after OCR or pricing work.
- The Review Client should stay operational and dense rather than marketing-like. The first screen should be a practical home/session dashboard.
- The Capture Client should stay capture-first. Review, correction, pricing detail, condition differences, and richer edits belong on desktop.
