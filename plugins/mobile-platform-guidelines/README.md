# mobile-platform-guidelines

Distilled, implementation-oriented rules from Apple's **Human Interface
Guidelines** and Google's **Material Design 3**, organized for cross-platform
(React Native / Expo / Flutter / native) development.

The skill enforces a **pattern-first workflow**: before you write component
code, it audits the proposed design against the relevant platform reference and
lists violations — touch targets, safe areas, back-navigation, permission
timing, dark mode, accessibility — so screens feel native on the platform
they ship to instead of carrying one platform's conventions onto the other.

## What's inside

| File | Purpose |
|---|---|
| `skills/mobile-platform-guidelines/SKILL.md` | Workflow, cross-platform adaptation matrix, non-negotiable rules, drift-review checklist |
| `skills/mobile-platform-guidelines/references/ios-hig.md` | Apple HIG rules and audit checklist |
| `skills/mobile-platform-guidelines/references/android-material.md` | Material Design 3 rules and audit checklist |

## When it triggers

Any mobile UI work — a screen, component, navigation flow, permission prompt,
or notification — or when the user mentions iOS/Android look-and-feel, HIG,
Material Design, touch targets, platform conventions, app-store review
readiness, or asks "does this feel native?".

## Workflow

1. Identify target platform(s).
2. Read the relevant reference file(s) — both for a cross-platform screen, then
   apply the adaptation matrix.
3. Audit the proposed design and list violations **before** writing code.
4. Implement with platform-adaptive patterns (React Navigation, RN Paper, Expo
   primitives).
5. Verify touch targets, safe areas, and back-navigation on both platforms
   before marking done.
