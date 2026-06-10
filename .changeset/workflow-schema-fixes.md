---
"@shazhou/proman": patch
---

Fix workflow schema inconsistencies and improve token extraction robustness. Add selfReview field to already_approved variant in review-pr workflow for schema consistency. Replace fragile sed-based token extraction with cfg-based approach in triage-issues workflow (Fixes #154, Fixes #156).
