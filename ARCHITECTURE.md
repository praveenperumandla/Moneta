# Moneta Architecture

Version: 1.0
Last Updated: 2026-07-25

---

# Purpose

This document describes the architecture of Moneta.

Its purpose is to help developers understand:

- how the application is organized
- where functionality belongs
- how data flows through the system
- which components are protected
- where future features should be added

This document should be updated whenever the architecture changes.

---

# High-Level Architecture

Moneta is an offline-first Progressive Web Application (PWA).

Everything runs inside the user's browser.

There is:

- No backend
- No server-side database
- No cloud dependency
- No build system
- No JavaScript framework

The browser is responsible for:

- User Interface
- Accounting calculations
- Data storage
- Import / Export
- Offline support

---

# System Overview

                 User
                   │
                   ▼
           User Interface (UI)
                   │
                   ▼
          Application Controller
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
Accounting Engine       Local Storage
        │                     │
        └──────────┬──────────┘
                   ▼
             Refresh UI

---

# Current Project Structure

index.html

Application shell.

Responsible for:

- Layout
- Navigation
- Forms
- Modals

No business logic should exist here.

---

styles.css

Contains:

- Layout
- Components
- Responsive rules
- Theme

Future versions will split this into multiple CSS files.

---

app.js

Currently contains:

- State
- Persistence
- Accounting
- Rendering
- Event handling

This file will gradually be modularized without changing behaviour.

---

manifest.json

Defines:

- PWA metadata
- Icons
- Theme colour
- Display mode

---

sw.js

Provides:

- Offline caching
- Asset caching
- Update lifecycle

---

serve.py

Local development server.

Not used in production.

---

# Data Flow

User Action

↓

Update State

↓

Auto Save

↓

Recalculate

↓

Refresh UI

---

# Data Storage

Current storage:

localStorage

Key:

vault_data_v2

Future versions will migrate automatically to a Moneta storage key while remaining backward compatible.

---

# Core Components

## Accounting Engine

Responsible for:

- Interest calculation
- Repayment allocation
- Write-offs
- Outstanding balances
- XIRR

Status:

Protected

Changes require explicit approval.

---

## Persistence Layer

Responsible for:

- Saving
- Loading
- Import
- Export
- Data migration

Status:

Stable

---

## Rendering Layer

Responsible for:

- Dashboard
- Borrowers
- Ledger
- Charts

This layer is expected to evolve significantly.

---

# Planned Architecture

Future versions will gradually separate responsibilities.

js/

    core/
        accounting.js
        storage.js
        calculations.js
        migration.js

    ui/
        dashboard.js
        borrowers.js
        ledger.js
        navigation.js
        charts.js

    components/
        modal.js
        cards.js
        buttons.js

This modularization must preserve existing behaviour.

---

# Design Principles

1. Accounting before appearance.

2. UI and accounting must remain independent.

3. Never duplicate business logic.

4. Prefer reusable components.

5. Prefer simple solutions.

6. Maintain offline capability.

7. Preserve backward compatibility.

---

# Protected Areas

The following are considered production-critical.

- Interest calculations
- Repayment allocation
- XIRR
- Write-off processing
- Historical transaction replay

These areas should not be modified without regression testing.

---

# Future Modules

The architecture should support:

- Investments
- Mutual Funds
- Stocks
- Gold
- Fixed Deposits
- EPF
- NPS
- Net Worth
- Income
- Expenses
- AI Insights

These modules should integrate without requiring major architectural changes.

---

# Development Workflow

Plan

↓

Design

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

# Architecture Goal

Moneta should remain:

- Fast
- Lightweight
- Offline-first
- Privacy-first
- Easy to understand
- Easy to maintain
- Easy to extend

Every architectural decision should support these goals.