---
name: data-analysis
description: "Analyze structured data with explicit grain, definitions, quality checks and reproducible calculations."
license: MIT
---

# Data analysis

1. Determine the decision, unit of observation, primary keys, population, date window, timezone and metric definitions before calculating. Inspect the actual columns and a bounded sample.
2. Measure missingness, duplicates, invalid values and join multiplicity. Track exclusions. Keep currencies and units explicit. A missing observation is not zero.
3. Use code or spreadsheet formulas for arithmetic, retain query/input provenance, compare totals before and after joins, and check a representative case by hand. Use uncertainty and denominator context when interpreting changes.
4. Distinguish correlation, attribution and causal evidence. Choose charts matching the comparison; label units and periods, avoid misleading axes. Deliver the analysis plus reproducible calculations when useful.

## Deliverable check

- Consistent totals, denominators and join grain
- Conclusions supported by sample and method

Use only the tools and evidence actually available in this task. If a required source or runtime is unavailable, identify the specific gap and continue the independent work. A role or skill does not grant additional permissions.
