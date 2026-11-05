---
name: software-delivery
description: "Implement, debug or review software using the actual repository, runtime and change scope."
license: MIT
---

# Software delivery

1. Inspect repository instructions, current diff, relevant callers and state ownership. Establish a reproducible failing behavior or concrete requirement before editing.
2. Trace input through validation, state transitions, persistence and side effects. Keep module ownership explicit; do not add speculative fallbacks or hide failures.
3. Change the smallest coherent abstraction and its real consumers. Preserve user work, compatibility and migration history. Examine error messages, cancellation and partial completion.
4. Run meaningful checks for the change, then exercise the real affected behavior. Report modified behavior, evidence and limits. A passing build is not runtime or deployment acceptance.

## Deliverable check

- Reproducible issue and verified fix
- Explicit change scope and data compatibility

Use only the tools and evidence actually available in this task. If a required source or runtime is unavailable, identify the specific gap and continue the independent work. A role or skill does not grant additional permissions.
