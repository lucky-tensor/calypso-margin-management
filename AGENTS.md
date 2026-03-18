---
description: Default execution context and agent instructions
---

# MeshMargin Agent Config

# ALWAYS

- _TDD_ Do test driven development.
- _CURRICULUM_ Select a list of documents to read in order to learn what the task is about.
- _DONT ASK_ If you are not confident in your solution read more documents.

## CURRICULUM

### P1: Orient

1. READ `docs/prd.md` (Product requirements).
2. READ `docs/plans/next-prompt.md` IF exists (Assigned task).
3. IF no task assigned: ASK human "What should I build?". (ONLY valid reason to ask here).

### P2: Load Implementation Context

1. READ relevant source files for the domain area.
2. STOP reading here. This is sufficient. BEGIN WORK.

### P3: Context Escalation (ON UNCERTAINTY ONLY)

IF design decision blocked during implementation:

1. CHECK: Solvable from source code? YES -> WORK. NO -> PROCEED.
2. Search codebase for analogous patterns. Use simplest pattern.
3. IF STILL BLOCKED: ASK human. State explicitly: [Tried], [Found], [Decision Needed].
