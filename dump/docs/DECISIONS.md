# Moneta Decisions

Version: 1.0
Last Updated: 2026-07-25

---

| Date | Decision | Reason | Consequences | Status |
|------|----------|--------|--------------|--------|
| 2026-07-25 | Accounting engine is protected | Accounting accuracy is the highest priority. | UI and feature work must not alter interest, repayment allocation, write-offs, or XIRR without explicit approval. | Accepted |
| 2026-08-19 | Extract via characterization tests, no bundler | Next products must not touch lending math. | Vanilla ES modules + Node `--test`. Writer stays on `moneta_data_v1`. See `docs/REFACTORING_PLAN.md`. | Accepted |

---

# Decision Log

Use the table above to record significant architectural, design, and product decisions.
