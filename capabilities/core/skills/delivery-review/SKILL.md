---
name: delivery-review
description: "Review a concrete artifact or implementation against the requested outcome and observable acceptance conditions."
license: MIT
---

# Delivery review

1. Read the original request and inspect the actual deliverable. Establish user-visible success conditions and material risks; do not judge solely by the author’s completion summary.
2. Trace representative normal, empty, invalid and interrupted paths. For interfaces inspect rendered desktop and narrow states, focus, scrolling and disabled controls. For analysis check sources, formulas and whether conclusions follow.
3. Classify findings by impact and support each with a location, reproduction or concrete example. Separate defects, uncertainty and optional preferences. Avoid tests that merely mirror implementation.
4. Verify repaired findings in the affected flow. Report only checks actually run; distinguish local verification, external integration, packaging, publication and user acceptance.

## Deliverable check

- Inspect actual output against the request
- Recheck affected paths after fixes

Use only the tools and evidence actually available in this task. If a required source or runtime is unavailable, identify the specific gap and continue the independent work. A role or skill does not grant additional permissions.
