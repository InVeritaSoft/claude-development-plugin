# Android — Material Design 3 (implementation reference)

Source of truth: https://m3.material.io/
Verify against the live spec for anything version-specific (M3 Expressive and dynamic-color guidance evolve).

## Layout & touch

- Minimum touch target: **48×48 dp** (visual element may be smaller; touch zone may not).
- 8 dp baseline grid; standard screen margins 16 dp.
- Respect display cutouts and gesture-navigation insets (edge-to-edge is the modern default — draw behind system bars, pad content with insets).

## Navigation

- **System back (button or gesture) is sacred.** Every screen, dialog, and bottom sheet must respond correctly — in RN, handle `BackHandler` / rely on React Navigation. Predictive back (peek animation) is the current expectation.
- **Bottom navigation bar**: 3–5 destinations, icon + label, active indicator pill.
- **Navigation drawer** for 5+ top-level destinations or secondary sections.
- Top app bar: title left-aligned (or center for M3 center-aligned variant), actions right, collapses/scrolls with content.
- Tabs (top) for sibling content within one destination — not for app-level navigation.

## Typography

- System font: **Roboto** (or dynamic system font); M3 type scale: Display / Headline / Title / Body (14–16 sp) / Label.
- Sizes in **sp** so user font scaling works; layouts must survive 200% font scale.

## Color & theming

- M3 tonal color system: primary/secondary/tertiary + on-* and container variants generated from a seed color.
- **Dynamic color (Material You)**: on Android 12+, users expect apps to optionally adopt wallpaper-derived palettes — at minimum don't fight it with hardcoded literals.
- Dark theme mandatory; use surface tones, not pure black elevation hacks.

## Components & patterns

- **FAB** for the single primary screen action; extended FAB with label where space allows. Don't use FAB for minor actions.
- **Snackbar** for transient feedback (with optional single action) — not toasts, not blocking alerts.
- **Dialogs** only for decisions that must interrupt; max 2 actions, confirming action right-aligned.
- **Bottom sheets** (modal or standard) for contextual actions/detail — the Android analog of iOS action sheets.
- Material Switch / Checkbox / RadioButton for settings; changes apply immediately.
- Material date/time picker dialogs — never an iOS-style wheel on Android.
- Ripple feedback on every touchable; elevation via tonal surfaces + shadow per M3 elevation levels (0–5).
- Motion: M3 easing (emphasized/standard) and container-transform for parent-child transitions.

## Permissions & privacy

- Runtime permissions: request in context; if `shouldShowRequestPermissionRationale`, show rationale UI before re-asking. After "don't ask again", deep-link to app settings with explanation.
- **Health Connect**: separate permission flow (per-datatype read/write), requires privacy policy dialog intent handler; app must degrade gracefully when Health Connect absent or permissions partially granted.
- Notification permission (`POST_NOTIFICATIONS`) is runtime on Android 13+ — request just-in-time, not at first launch.

## Play Store / quality red flags

- Broken back navigation, non-edge-to-edge on modern targets, iOS-styled UI (wheel pickers, centered iOS alerts), missing large-screen support for tablets/foldables.

## Checklist (audit before implementation)

- [ ] All tap targets ≥ 48×48 dp
- [ ] System back handled on every screen/modal/sheet
- [ ] Edge-to-edge with correct inset padding
- [ ] sp units for text; survives 200% font scale
- [ ] Dark theme via tonal surfaces
- [ ] Snackbar (not alert) for transient feedback
- [ ] Runtime permission rationale flow implemented
- [ ] Material pickers/dialogs — no iOS idioms
