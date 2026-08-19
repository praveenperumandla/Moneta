# AI Assistant Workflow

Version: 1.0
Last Updated: 2026-07-25

---

# Mission

This document explains how AI assistants should contribute to Moneta.

It applies to:
- Kilo
- Codex
- Copilot
- Claude
- Gemini
- ChatGPT

The goal is to maintain consistency, protect critical code, and ensure that every contribution follows the same principles.

---

# Project Structure

The project is organized as follows:

index.html
Application shell. No business logic.

styles.css
Layout, components, responsive rules, theme.

app.js
State, persistence, accounting, rendering, event handling.

manifest.json
PWA metadata.

sw.js
Offline caching.

serve.py
Local development server.

Documentation lives in the project root and docs/.

---

# Files to Read Before Coding

Before modifying any application code, read:

PROJECT_RULES.md
Core principles, protected components, workflow.

ARCHITECTURE.md
System overview, data flow, planned architecture.

ROADMAP.md
Current milestone and planned work.

AI_WORKFLOW.md
This document.

README.md
Project overview and setup instructions.

DESIGN_SYSTEM.md
Design principles and tokens.

DECISIONS.md
Decision log and rationale.

---

# Protected Areas

The accounting engine is protected.

Protected components:
- Interest calculations
- Repayment allocation
- Principal write-offs
- Interest write-offs
- XIRR calculations
- Historical transaction processing
- Import/Export data compatibility

These components may only be modified when:
- Fixing a verified bug
- Implementing an approved accounting feature
- Improving performance without changing results

Never modify protected areas without explicit approval.

---

# Planning Process

1. Read PROJECT_RULES.md and ARCHITECTURE.md.
2. Identify the current milestone from ROADMAP.md.
3. Determine whether the task is documentation or code.
4. For code changes, confirm the target area is not protected.
5. Propose a plan before implementing.
6. Keep changes minimal and focused.
7. Do not introduce new dependencies without discussion.
8. Do not refactor protected code.

---

# Implementation Process

1. Make one change at a time.
2. Do not modify protected areas unless explicitly approved.
3. Preserve backward compatibility.
4. Do not duplicate business logic.
5. Keep UI separate from accounting.
6. Follow existing naming conventions.
7. Match the existing code style.
8. Do not add comments unless requested.
9. Do not add debugging logs to production code.
10. Do not expose secrets or keys.

---

# Review Expectations

Before completing a task:
- Re-read the changed files.
- Verify that only intended changes were made.
- Confirm no protected areas were touched.
- Check that the change aligns with the milestone goal.
- Ensure no functional changes to app.js, styles.css, or accounting logic unless explicitly requested.

---

# Git Workflow

Every milestone should include:
- Commit
- Changelog
- Version update

Commit messages should be concise and descriptive.

Only commit when explicitly requested.

Do not push without explicit request.

---

# Reporting Format

When completing a task, report:
- Files created or modified
- Summary of each change
- Any constraints or warnings
- Suggestions for future work

Do not add unnecessary commentary.

Do not ask for confirmation unless a decision is required.

---

# What AI Must Never Do

- Modify the accounting engine without approval
- Add external dependencies without discussion
- Introduce debugging logs or console statements in production code
- Expose secrets, API keys, or credentials
- Modify HTML, CSS, or app.js during documentation milestones
- Commit or push without explicit instruction
- Guess URLs or external resources
- Engage in unnecessary conversation or back-and-forth
- Provide commentary instead of results
- Modify protected areas for convenience

- **Accounting Integrity:** Closed accounts are permanent. Do not build features to 'reopen' them. If a borrower needs a new loan, create a new Account. This prevents retroactive interest miscalculations.

