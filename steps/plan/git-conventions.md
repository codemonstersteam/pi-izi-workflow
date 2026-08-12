---
name: git-conventions
description: Trunk-Based Development, the part step 10 can execute — the branch name, derived from the weight and one asked key
version: "2.0"
source: izi-flow/skills/lib/git-conventions/SKILL.md v1.0 — conformed to standards/role.md, trimmed to what this band enforces today
---

$START_GOAL
One task = one short branch off a fresh trunk. The name is DERIVED from artifacts this band already
produced; the single exception is the task key, and it is asked once.
$END_GOAL

$START_CONTEXT
Trunk-Based Development, inherited from `izi-flow/CONCEPT.md`: ONE long-lived branch, every work
branch cut from it and never from another work branch, the trunk always releasable, one task one PR.

This file carries **only what a step of this band executes today** — the branch name (step 10) and
the base (step 13). The commit format, the PR body, review and the branch's lifetime belong to steps
13–17; step 17 does not exist yet, and a convention no machine enforces is decoration
(`standards/role.md`: every prohibition names its check). They arrive with their step, in this file.

It is installed with the pipeline (`bin/install.mjs` copies `steps/`), so it resolves against the
RUN's cwd like every order template — never against this repository (`CLAUDE.md`, constraint 6).

Placeholders: `DOS` is any project key, `42` any task number.
$END_CONTEXT

$START_CONTRACTS
Three values, three sources. What has a source is never asked; what is asked is asked once.

| value | source | who computes it |
|---|---|---|
| task key `DOS-42` | the OPERATOR — the one value no artifact carries | step 10, one question (`docs/plan.md` §6) |
| branch prefix | the WEIGHT: `patch` (only `Fixed` deltas) ⇒ `bugfix`, otherwise `feature` | step 7 wrote `.agent/mode`; step 10 substitutes |
| base | a FACT of `git`: `origin/HEAD`, else `main`/`master` among local refs, else a refusal | step 10 reads it, step 13 refreshes it before the cut |

```
branch = <prefix>/<KEY>          feature/DOS-42 · bugfix/DOS-42
```

**Task key** — `^[A-Z]{2,20}-[0-9]{1,6}$`. This regexp is the ONE copy in the band: `steps/plan/plan.mjs`
holds the constant and `steps/plan/plan.test.mjs` asserts that the constant and this file agree — the
same seam `steps/brd/brd.test.mjs` holds over its role.
$END_CONTRACTS

$START_FORBIDDEN
Each prohibition names the machine that catches it.

- **Do not invent the key, the prefix or the base.** Each has a named source above; a value with no
  source is `invented-default` — the same finding the BRD guardrail reports for a number.
- **Do not take "the current branch" for the trunk.** It can be anything; no fact backs it. Nothing
  found ⇒ the refusal `no-trunk`.
- **Do not cut the branch here.** Step 10 NAMES it; step 13 cuts it, after the gate and after
  `fetch`. A name written before the gate is a plan; a cut before the gate is unapproved work.
- **Do not restate this convention.** One copy — this file for humans and tickets, one constant in
  code, and a test that fails when they disagree (`standards/code.md` §1).
$END_FORBIDDEN

$START_EXAMPLE
A different domain on purpose — billing, not the repository under work.

```
TASK.md          «просроченный счёт должен уходить в архив через 30 дней»
.agent/mode      patch                    only Fixed deltas
operator answer  BIL-317
branch           bugfix/BIL-317           prefix from the weight, key from the operator
base             main                     git fact: origin/HEAD
```

The same change weighed `minor` gives `feature/BIL-317` — one word of SemVer decides the prefix, and
nobody types it.
$END_EXAMPLE

$START_SUCCESS
- The branch name in `.agent/plan-index.json` is a pure function of `(key, .agent/mode)`: two runs on
  one input give one name.
- The key regexp exists in exactly one place, and a test fails when the code and this file disagree.
- Nothing in this file describes a step that does not exist.
$END_SUCCESS
