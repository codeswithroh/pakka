# Pakka style lock

Surface: app shell (sidebar + order list + summary panel); intake is the empty state.
References (user-supplied, 2026-10-18): Emnify orders page (meta header rows on order cards, soft-tinted active nav, terracotta primary + outline button), Umi landing (serif display, lime highlighter, cream cards), restaurant POS (right "My Order" summary panel with totals and one primary action, category chips), order-list dashboard (4 stat cards with dark icon tiles, uppercase muted table headers, status pills).

## Color contract (light)
text #1d1612 · bg #f6f4f0 · surface #ffffff · surface-2 #faf8f5 · border #e8e3dc · muted #6f655d
primary #a8442a (on-primary #ffffff, 5.96:1) · primary-soft #fbeee8 · lime #e3f36b (highlighter behind text only, 14.7:1 with text)
pills: ok #1f7a55/#e1f2e9 4.55:1 · warn #8a4b06/#fff1d6 6.09:1 · info #24407a/#e6edfb 8.55:1
Text-safe: text on bg/surface/lime/border, primary on surface/bg, muted on bg (5.17) and surface-2 (5.36).
Decorative only: border on surface/bg, lime on surface (never a lime fill without dark text).
Dark mode: follows prefers-color-scheme; companion tokens in src/style.css.

## Type
Display/headings: Fraunces Variable (serif, 500-600). UI/body: Inter Variable. Labels: 11px uppercase, 0.06em tracking.

## Density & spacing
4/8/12/16/20/24/32/40/48. Card padding 20px, card gap 16px, section gap 32px. Radius 8/10/16.

## Components
Order card = meta header row (Time · Customer · Total · Handover · status pill) + body (thumb tile · item/tags/plaque/flags · size box + primary/outline actions) + balance footer.
Stat card = dark icon tile + value + label + footer line. Filters = square-ish chips, active = inverted.
Icons: Lucide via Iconify (src/icons.ts), currentColor.

## Motion
App-shell track: cards rise once when a sheet loads (240ms, 30ms stagger, max 6), nav/chip colour transitions 150ms, progress bar via transform. Reduced motion disables all.

## Assets
Logo: existing public/icon.svg, kept unchanged. No photography; no illustrations (app shell).
