---
name: github-issue-tasks
description: Create or close GitHub issues on nordlender/boden as this project's task tracker, following its house rules for labels, brevity, and dedup. Use whenever asked to add a task/work item as a GitHub issue, convert a TASKS.md entry to an issue, or mark an issue done. Do not use for general GitHub issue triage unrelated to task tracking.
---

# GitHub issue tasks

This project tracks work items as GitHub issues on `nordlender/boden`, using
`gh` (already authenticated in this environment). Follow these house rules —
they came from direct user correction, not guesswork.

## 1. Check for similar issues first, then dedup

Before creating an issue, look for related ones — not just exact duplicates:

```bash
gh issue list --repo nordlender/boden --state all --search "<keywords>"
```

If something similar but not identical turns up (overlapping scope, a
plausible parent/child relationship, an issue that partially covers the new
task), don't guess how they relate — tell the user what you found and ask
how to proceed (e.g. new issue vs. sub-issue vs. just commenting on the
existing one).

Do not create an issue that duplicates an open or closed one. If unsure
whether something is a duplicate, say so and ask rather than creating it.

## 2. Get the current label set — don't assume it's static

Labels on this repo have changed more than once. Always fetch the live list
before assigning any:

```bash
gh label list --repo nordlender/boden
```

If a label you need doesn't exist, ask the user before inventing one and
running `gh label create` — don't just add new labels unilaterally.

## 3. Label conventions (confirmed by the user)

- Net-new / not-yet-built functionality → `feat` (should be implemented) or
  `feat-opt` (nice-to-have, low priority) — pick based on how essential the
  work is, not just "is it new."
- Something already built that's broken → `bug`.
- **Minor UI tweaks (e.g. swapping an icon, a spacing nudge) are NOT `feat`
  or `feat-opt`** — use `ui` alone. Reserve `feat`/`feat-opt` for actual
  feature work, not small UI adjustments.
- Investigative/proposal tasks ("figure out X", "propose Y") with no clear
  fit → `question`.
- Pure documentation/reconciliation work → `documentation`.
- If nothing fits well, it's fine to leave an issue unlabeled rather than
  force a wrong label.
- `wontfix` is only added when the user decides an issue won't be fixed —
  never apply it on your own judgment, even if a task looks obsolete or
  low-value. Ask/wait for the user's call.

## 4. Body content — keep it clean, no clutter

- Do **not** add a line like "Migrated from TASKS.md" or explain the
  provenance/meta-process of the issue. The issue is the task, not a record
  of how it got created.
- Do **not** add the "🤖 Generated with Claude Code" footer to issue bodies.
  That footer is for PR descriptions only, not issues.
- Write the body as the task itself — carry over concrete details (file
  paths, function names, prior findings) from the source material, but strip
  narration about the conversion process.
- Keep titles short and specific (< ~70 chars); put detail in the body.

## 5. Creating an issue

```bash
gh issue create --repo nordlender/boden \
  --title "<short specific title>" \
  --body "<task detail, no meta-commentary>" \
  --label "<label(s), if any fit>"
```

For longer bodies, write to a temp file (use the job's tmp dir, not `/tmp`
directly if running as a background job) and pass `--body-file` instead of
inlining multi-paragraph text into the shell command.

## 6. Marking an issue already-done

`gh issue create` cannot create an issue pre-closed. Create it, then close
it as a separate step so it shows the correct green "Completed" state
instead of looking abandoned:

```bash
gh issue close <number> --repo nordlender/boden --reason completed
```

Use `--reason completed` for finished work, `--reason "not planned"` for
things being deliberately dropped (never use this without the user
confirming the item should be dropped, not just deferred).

## 7. Sub-issues

`gh issue create` supports creating an issue directly as a sub-issue of an
existing one:

```bash
gh issue create --repo nordlender/boden \
  --parent <parent-number-or-url> \
  --title "<short specific title>" \
  --body "<task detail>" \
  --label "<label(s), if any fit>"
```

Use this when a task is genuinely a piece of a larger tracked issue (e.g.
breaking a big feature issue into concrete steps) rather than creating a
loose, unrelated issue and cross-linking manually. Only nest under a parent
when the relationship is real — don't force sub-issue structure onto tasks
that just happen to be nearby in scope.

## 8. Relationship to TASKS.md

TASKS.md may still exist in this repo as a running log. Converting its
entries to issues does not imply deleting or editing TASKS.md — leave it
alone unless the user explicitly asks you to trim, sync, or remove entries
from it.
