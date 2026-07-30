# iOS — Human Interface Guidelines (implementation reference)

Source of truth: https://developer.apple.com/design/human-interface-guidelines/
Verify against the live HIG for anything version-specific (Liquid Glass / latest iOS design language evolves yearly).

## Layout & touch

- Minimum touch target: **44×44 pt**. Applies to buttons, list-row tap zones, icons.
- Respect safe areas (notch/Dynamic Island, home indicator). Never place tappable content under the home indicator.
- Standard margins: 16 pt leading/trailing on iPhone; wider (20+ pt) on iPad.
- Support all size classes if iPad is a target; design compact-width first.

## Navigation

- **Navigation stack**: title in nav bar, back button top-left, edge swipe-back gesture must never be blocked (do not disable `gestureEnabled` without strong reason).
- **Tab bar**: 3–5 tabs, bottom, SF Symbols icons + short labels. Tabs switch context, never push.
- **Modals**: sheets (`pageSheet`/`formSheet`) for self-contained tasks; must have explicit Cancel/Done. Pull-down-to-dismiss expected — intercept only with confirmation if data loss possible.
- Large titles for top-level screens, inline titles when scrolled/pushed.

## Typography

- System font: **SF Pro** (SF Compact on watch). Never bundle a lookalike.
- Use text styles (Body 17 pt, Headline 17 semibold, Title 1–3, Caption 12–13 pt) and **Dynamic Type** — text must reflow at accessibility sizes.

## Components & patterns

- Alerts: max 2–3 actions; destructive actions styled red and never the default; use action sheets for 3+ choices.
- Switches for on/off settings; no "Save" button needed for settings — apply immediately.
- Pickers: wheel picker for short lists in forms; inline calendar for dates.
- Pull-to-refresh for content lists; activity indicators for indeterminate waits < 10 s, progress bars beyond.
- Haptics: use `UIImpactFeedbackGenerator`/Expo Haptics for confirmations and selection changes — sparingly.
- Swipe actions on list rows for secondary actions (delete trailing, full-swipe = default action).

## Color & appearance

- Semantic colors (`label`, `systemBackground`, `separator`) so dark mode is free.
- One accent/tint color for interactivity; don't color non-interactive text with the tint.
- SF Symbols for iconography — match weight to adjacent text.

## Permissions & privacy

- Purpose strings (`NSHealthShareUsageDescription`, etc.) are mandatory and reviewed by App Store — write user-benefit-focused copy.
- Ask **just-in-time**, one permission per moment, after an in-app pre-prompt explaining value (raises grant rate; a system-prompt denial is expensive to reverse — user must go to Settings).
- App Tracking Transparency required before any cross-app tracking.

## App Review red flags (design-related)

- Blocked swipe-back, custom non-standard alerts, login walls before showing value, misuse of Sign in with Apple rules, hidden subscription terms.

## Checklist (audit before implementation)

- [ ] All tap targets ≥ 44×44 pt
- [ ] Safe area insets respected on every screen
- [ ] Swipe-back works on every pushed screen
- [ ] Dynamic Type: layout survives largest accessibility size
- [ ] Dark mode verified
- [ ] Modals dismissible by pull-down or explicit Cancel
- [ ] Permission pre-prompt screens exist; purpose strings written
- [ ] SF Symbols used; no Material icons on iOS surfaces
