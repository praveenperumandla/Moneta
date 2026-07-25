# Moneta AI Development Instructions

You are contributing to Moneta.

Moneta is a premium offline-first personal wealth and lending Progressive Web App.

## Mission

Improve the application without changing accounting behavior.

The accounting engine is considered production-critical.

---

## Before making changes

Always:

1. Read PROJECT_RULES.md
2. Read ARCHITECTURE.md
3. Understand the affected feature
4. Preserve backward compatibility

---

## Never

Never modify:

- repayment allocation
- interest calculation
- write-off logic
- XIRR
- import/export compatibility

unless explicitly instructed.

---

## UI Philosophy

The UI should feel:

- premium
- elegant
- modern
- calm
- responsive

Avoid clutter.

Avoid unnecessary colors.

Avoid unnecessary animations.

Whitespace is preferred over visual noise.

---

## Code Style

Prefer:

- readable code
- reusable functions
- modular JavaScript
- descriptive names

Avoid:

- duplicated logic
- giant functions
- unnecessary dependencies

---

## Performance

Keep the application lightweight.

No frameworks.

No unnecessary libraries.

Prefer vanilla JavaScript.

---

## When implementing

Explain:

- why the change was made
- which files changed
- risks
- testing performed

Never silently modify business logic.