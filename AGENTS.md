---
description: Default execution context and agent instructions
---

# MeshMargin Agent Config

# ALWAYS

- _TDD_ Do test driven development.
- _CURRICULUM_ Select a list of documents to read in order to learn what the task is about.
- _DONT ASK_ If you are not confident in your solution read more documents.
- _NO AI ATTRIBUTION_ Do NOT add "Co-Authored-By" lines to commits. Do NOT add "Generated with Claude Code" or any AI attribution to PR descriptions, issue text, or any other output.

## SKILLS

Available slash commands (defined in `.claude/skills/`):

| Skill         | Command      | When to use                                                                                                                                                                   |
| ------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **feature**   | `/feature`   | Proposing a new feature. Walks through intake, architecture evaluation, GitHub issue creation with structured sections, and tracking issue update. Use before implementation. |
| **develop**   | `/develop`   | Implementing a feature. Picks a task from the Plan, creates an isolated worktree and branch, implements the feature, then opens a PR via `/create-pr`.                        |
| **create-pr** | `/create-pr` | Opening a PR. Verifies acceptance criteria, runs type-check/lint/format/tests locally, then creates the PR. Use when implementation is complete.                              |
| **merge**     | `/merge`     | Merging ready PRs. Discovers PRs with green CI, orders by dependency, rebases if needed, merges in order, and updates the tracking issue.                                     |
| **replan**    | `/replan`    | Reorganizing the backlog. Reads the Plan tracking issue and all open issues, builds a dependency graph, scores risk, organizes into parallel batches, and updates issues.     |

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
