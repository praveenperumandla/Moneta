# Moneta Project Rules

Version: 1.0
Last Updated: 2026-07-25

---

# Vision

Moneta is a premium offline-first personal wealth and lending application.

The objective is to deliver a beautiful, fast, privacy-focused application while preserving the integrity of the accounting engine.

---

# Core Principles

1. Offline First

The application must function completely without an internet connection.

Internet features are optional enhancements only.

---

2. Privacy First

No user data leaves the device unless the user explicitly exports or syncs it.

---

3. Accounting First

The accounting engine is the most important component of the application.

User interface improvements must never alter accounting behavior.

---

# Protected Components

The following areas are considered protected.

- Interest calculations
- Repayment allocation
- Principal write-offs
- Interest write-offs
- XIRR calculations
- Historical transaction processing
- Import/Export data compatibility

These components may only be modified when:

- fixing a verified bug
- implementing an approved accounting feature
- improving performance without changing results

---

# Architecture Rules

Prefer modular JavaScript.

Avoid global variables where possible.

Keep UI separate from accounting.

Never duplicate business logic.

Reuse components whenever possible.

---

# UI Principles

The interface should be:

- premium
- elegant
- calm
- responsive
- accessible

Design inspiration:

- Apple Human Interface Guidelines
- Linear
- Notion
- Things 3

Avoid unnecessary animations or visual clutter.

---

# Performance

Prefer simplicity over complexity.

Avoid unnecessary libraries.

Maintain a lightweight application.

Target:

- Lighthouse >95
- Smooth scrolling
- Fast startup
- Minimal memory usage

---

# Backward Compatibility

Existing Vault users must never lose data.

Always provide automatic migration where practical.

Existing JSON exports should continue to work.

---

# Version Control

Every milestone should include:

- Commit
- Changelog
- Version update

---

# Development Workflow

Plan

↓

Implement

↓

Review

↓

Test

↓

Commit

↓

Release

---

# Rule Zero

When in doubt,

do not modify the accounting engine.
- **Accounting Integrity:** Closed accounts are permanent. Do not build features to 'reopen' them. If a borrower needs a new loan, create a new Account. This prevents retroactive interest miscalculations.

