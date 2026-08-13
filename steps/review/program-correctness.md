---
name: program-correctness
description: Analytical verification of a plan read as a program — the inherited method behind step 11, antecedent and consequent over the nodes of the work
version: "1.0"
source: izi-flow/skills/lib/program-design §9 "Reconcile the consistency of all module contracts" v1.0 + codemonsters.team/blog/2025-12-15 (program modules) + 2025-12-30 (program correctness) — conformed to standards/role.md, trimmed to what this band enforces today
---

$START_GOAL
A plan is a program: a node is an instruction, `order` is the path of execution, `deps` are the edges
where paths merge. This file says WHY it is judged that way. WHAT is judged lives in exactly one
place — `$START_LAW` of `steps/review/critic.md` — and is not repeated here.
$END_GOAL

$START_CONTEXT
Three inherited sources, one method.

**Design by Contract.** Every instruction carries an **antecedent** — what must hold before it runs —
and a **consequent** — what holds after. The pair IS its correctness; nothing else is.

**Analytical verification (Floyd/Hoare, Dijkstra).** Correctness is established by checking the
assertions across the instructions, and only then confirmed by tests. Where several paths merge
before an instruction, its antecedent must follow from the consequents of ALL of them.

**Modularity.** A module has one entry and one exit, implements a single function, and is seen from
outside as a black box: the caller knows its input and its output and nothing else. That is why a
node of work HAS an antecedent and a consequent at all — and why an implementer who sees one ticket
and no future can still be right.
$END_CONTEXT

$START_CONTRACTS
**Antecedent of a work node** = the files, contracts and endpoints its work refers to. It is
satisfied when an earlier node produces them, or when they existed before the change. Nothing else
satisfies it — a promise made later in the order is not an antecedent, it is a hope.

**Path merging.** Where several nodes converge on one — a `scenario` node depends on all the nodes it
distinguishes — the antecedent must follow from the consequents of ALL of them, not from the
convenient one.

**Consequents imply the goal.** The requirement's `<post>` conditions are the program's final
assertion. A plan every instruction of which is executable, whose union of consequents does not imply
that assertion, is a correct program solving a different problem.

**Where the rest of the method already lives.** The inherited reconciliation checks six items per
call-graph arrow; five of them are enforced by scripts of this band and are therefore NOT judgements
of step 11:

| inherited check | where it runs today |
|---|---|
| the type on the arrow exists; names match | `checkFrd` F2/F3 — every touched path resolves to a node |
| consequent of A ⊆ antecedent of B | `checkDesign` rule 4 — `out(k)` verbatim among `in(k+1)` |
| error classes are consistent | `checkDesign` rule 8 — every declared `<failure>` is named in some contract |
| every `Then` maps onto a node | `checkDesign` rule 5 — every FRD scenario has a route |
| a node no `Then` asks for is dead | by construction — the plan's nodes come from the FRD's own touched paths |

What is left over is prose against artifact, and that is the whole of step 11.
$END_CONTRACTS

$START_FORBIDDEN
- **Do not judge whether a check command would go red.** "Testing shows the presence of errors, not
  their absence" is true, and it is measured by the acceptance step against the branch baseline,
  AFTER the work — not guessed from the text of a command before a file exists. That step owns a
  fact; this one would own an impression.
- **Do not restate the executable rules here.** They live in the role, with their machine checks
  named. A method that repeats the rules becomes their second copy, and two copies drift
  (`standards/code.md` §1).
$END_FORBIDDEN

$START_EXAMPLE
A different domain on purpose — payroll, not the repository under work.

```
FRD    UC1/3: "the payslip page renders the net amount returned by GET /payroll/{id}"
       scenario S1 after: "the payslip page shows the net amount"
plan   order: [ payslip.html, PayrollResource.java, scenario:S1 ]
```

`payslip.html` is ordered FIRST and its work refers to `GET /payroll/{id}`, whose contract the node
after it produces: the antecedent of instruction 1 follows from nothing. The blocker's evidence is
`PayrollResource.java` — the node it needs — because that pair is the missing edge, and the machine
adds it and re-sorts.

The goal side is silent here: the `after` of `S1` lands on `payslip.html`. Silence is the normal
outcome — a plan assembled by a script from artifacts eight guardrails have judged is usually
correct, and a `Pass` costs one call. What would break it: a `<post>` saying "the amount is also
written to the audit log" while no node of the plan touches an audit module. The plan is executable
and the goal is not reached — the last place before a human approves it where that is visible.
$END_EXAMPLE

$START_SUCCESS
- The two judgements of step 11 are stated once, in the role, and this file explains neither more nor
  fewer of them than the role executes.
- Nothing here describes a step that does not exist, and nothing repeats a check another step runs.
$END_SUCCESS
