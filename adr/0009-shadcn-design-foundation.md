# 0009 shadcn/ui Design Foundation

## Status

Accepted

## Context

The Review Client and Capture Client need a consistent component foundation before
the dedicated session workspace and card-shaped Session Item Editor are built.
The previous UI used ad hoc Tailwind classes directly for buttons, cards, form
controls, badges, and status surfaces, which made visual changes harder to apply
consistently.

## Decision

Use shadcn/ui with Tailwind CSS v4 as the app design foundation. Components are
installed through the shadcn CLI into `src/components/ui`, configured by
`components.json`, and composed with local Tailwind utilities at the feature
level.

The theme direction is neutral/slate by default:

- background and surfaces use slate-neutral tokens with white cards
- primary actions use a restrained dark slate primary
- focus rings and future accent affordances use a muted teal accent
- status badges continue to distinguish review, success, destructive, and
  inactive states without relying on a single dominant hue

## Consequences

New UI work should reuse shadcn primitives before adding local one-off controls.
Feature components can still use Tailwind layout utilities, but button, card,
input, label, select, checkbox, badge, alert, and separator behavior should come
from `src/components/ui`.

Large future UX changes can adjust theme CSS variables in `src/app/globals.css`
without rewriting every feature component.
