---
name: mobile-platform-guidelines
description: Apple Human Interface Guidelines (HIG) and Android Material Design 3 rules for building mobile UI. ALWAYS consult this skill before implementing or reviewing any mobile screen, component, navigation flow, permission prompt, or notification — in React Native, Expo, Flutter, or native code. Trigger whenever the user mentions mobile UI, iOS/Android look-and-feel, HIG, Material Design, touch targets, platform conventions, app store review readiness, or asks "does this feel native?". Audit the design against the relevant platform reference BEFORE writing component code, per the pattern-first workflow.
---

# Mobile Platform Guidelines (iOS HIG + Material 3)

Distilled, implementation-oriented rules from Apple's Human Interface Guidelines and Google's Material Design 3, organized for cross-platform (React Native / Expo) development.

## Workflow — audit before implementation

1. **Identify target platform(s)** for the screen or component being built.
2. **Read the relevant reference file(s):**
   - iOS → `references/ios-hig.md`
   - Android → `references/android-material.md`
   - Cross-platform screen → read BOTH, then apply the adaptation matrix below.
3. **Audit the proposed design/implementation** against the checklist in each reference. List violations before writing code.
4. **Implement** using platform-adaptive patterns (see below), preferring libraries that adapt automatically (React Navigation, RN Paper, Expo primitives).
5. **Verify** touch targets, safe areas, and back-navigation behavior on both platforms before marking done.

## Cross-platform adaptation matrix (quick reference)

| Concern | iOS | Android |
|---|---|---|
| Min touch target | 44×44 pt | 48×48 dp |
| Back navigation | Swipe-back edge gesture + nav-bar back | System back button/gesture — MUST be handled |
| Primary nav | Tab bar (bottom) | Bottom navigation bar / navigation drawer |
| Type system | SF Pro, Dynamic Type | Roboto, Material type scale, sp units |
| Primary action | Nav-bar button / prominent button | FAB or bottom-aligned button |
| Alerts | UIAlertController style, centered | Material dialog / snackbar for transient |
| Date/time picker | Wheel / inline calendar | Material date picker dialog |
| Settings toggle | UISwitch, right-aligned | Material Switch |
| Haptics | Rich (UIImpactFeedbackGenerator) | Simpler vibration patterns |
| Permissions | Just-in-time, purpose strings in Info.plist | Runtime permissions + rationale UI |

## Non-negotiable rules (both platforms)

- Never hardcode a platform's convention onto the other (e.g., iOS-style centered alerts on Android, or Material FAB on iOS unless the brand demands it).
- Respect safe areas / display cutouts on every screen (`SafeAreaView` / insets).
- Support system font scaling (Dynamic Type / sp) — no fixed pixel font sizes that clip.
- Dark mode: both platforms expect full support; use semantic colors, not literals.
- Accessibility: label every interactive element; contrast ≥ 4.5:1 for body text.
- Health data permissions (HealthKit / Health Connect): request just-in-time with an in-app rationale screen BEFORE the system prompt; denial must leave the app usable.

## When reviewing existing code

Flag as drift: fixed heights below min touch targets, `Alert.alert` used for Android confirmations where a snackbar/dialog fits, missing `BackHandler` on Android modal flows, absolute-positioned elements ignoring insets, and font sizes in raw numbers without `allowFontScaling` consideration.
