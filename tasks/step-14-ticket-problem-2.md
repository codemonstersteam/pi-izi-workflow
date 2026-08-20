# Plan — step 14 produces SLM-feasible tickets in the right order

Goal: the tickets under `task/<KEY>/tickets/` are executable by a small model (qwen-class, 27B) in
wave order, and executing them all produces the change the approved plan describes. This plan is
built from the live artifacts of the `eddi` form (`task/DOS-535/`) and the donor ticket rules in
`rationaldev-ai-sdlc-skills/skills/roles/wirth-ticketer/wirth-ticketer.md` plus
`skills/lib/implementation-ticket-writer/`. Nothing in `sandbox/runbox/eddi/` is to be edited; it is
evidence, not a workbench.

## 0 · Findings — ticket defects traced to the step that produced them

Every finding names its origin step, because the guardrail-fix must land _there_, not in step 14:
step 14 cuts what upstream artifacts carry, and a repaired cut over a corrupted FRD/plan still
carries the corruption.

| # | Defect in tickets | Evidence (eddi, task/DOS-535/tickets/) | Origin step |
|---|---|---|---|
| F1 | Boundary ticket names the wrong channel. UC6 (export ZIP), UC7 (import ZIP), UC8 (sync remote) all say «How to call it — HTTP /glossarystore/glossaries», although their goals are export/import/remote-sync, which enter through other endpoints. | `05-boundary-uc6.md`, `06-boundary-uc7.md`, `07-boundary-uc8.md` body «How to call it»; FRD declares exactly one actor `api-client via="HTTP /glossarystore/glossaries"` for all eight UCs (`.agent/frd.xml`). | **Step 6 (intake)**: the FRD grammar carries `via` only at actor level; `checkFrd` never asks whether two UCs of one actor enter through different endpoints. **Step 14** reads the actor-level `via` (`viaOf(frd, name)`) with no UC-level override. |
| F2 | Module gate mismatches its own test class. Ticket 22 outputs `RestImportServiceIT.java` and gates on `./mvnw test -Dtest=RestImportServiceIT` — a class whose name violates the repo's unit-suite template `*Test.java` (the map: «unit tests: *Test.java run by ./mvnw test · component tests: *IT.java run by ./mvnw verify»), while the sample it points at is `RestImportServiceTest.java`. | `22-restimportservice.md` header `outputs`/`verify`; PLAN.md section 15 `verify: ./mvnw verify -Dit.test=RestImportServiceIT · RestImportServiceIT`. | **Step 9 (core-designer)**: the plan role wrote an arbitrary command + class pair; `checkPart` (steps/design/card.mjs) validates only the _shape_ `verify: <cmd> · <name>`, never that the command belongs to a map-known suite or that the class name matches that suite's `match`. **Step 14**: `namedTest()` reuses the role's class name blindly; `checkTickets` rules 1–14 have no name↔match rule. |
| F3 | Boundary sample is uniform. All seven boundary tickets carry `RagCrudIT` as the one sample, including the export/import/sync UCs, whose entry semantics are not CRUD. | `inputs: [src/test/java/ai/labs/eddi/integration/RagCrudIT.java]` in `01`–`07`. | **Step 14**: `near()` scores only name-stem similarity of the entry module; a nearest-channel or nearest-package criterion never participates. |
| F4 | Values block noise. Every boundary UC carries the _whole_ FRD field list (all Glossary/Term/agent rules), even UCs (export/import) where those fields never appear. The SLM is told «what makes it refuse» and must invent which to use; a 27B fills noise with inventiveness. | `01-boundary-uc1.md` etc.: «Values — what makes it refuse» lists `key (Term)`, `value (Term)` even in UC6/UC7. | **Step 14**: `fields` is built from `frd.fields` unfiltered (`ticketsOf`, the `fields` map). No scoping rule exists. |
| F5 | Risk, not yet a rule: UC8's boundary asserts behaviour that requires a _remote_ EDDI instance; `RagCrudIT` cannot fake one. If the outer suite has no remote-mock sample, the boundary ticket is infeasible as written and belongs either to a module owner or needs an infra decision at step 15. | `07-boundary-uc8.md` step 1 «sync service reads glossary descriptors from remote …» + sample RagCrudIT. | **Step 14 boundary-selection rule** has no «channel must be locally exercisable» notion; **step 6** marked UC8's entry `api-client`/`HTTP` without recording the remote precondition as a `<question>`. |
| F6 | Sequence itself is right — claim the tickets are ordered bottom-up: boundary wave 0, module waves by `calls`+type edges upward (09 → 08/11/12 → … → 18/20/22). Waves resolve and rule 6 enforces them. | `blocked_by` waves 0–4 across all 22 tickets; rules 6/13 in `checkTickets`. | Works as designed (donor's RED-first + topological layering are present). No change. |

Cross-check against the donor's contract (`wirth-ticketer.md`, `implementation-ticket-writer/SKILL.md`): our internal header (`id/key/branch/kind/wave/blocked_by/inputs/outputs/verify`) is a deliberate subset — `slice/type/io/skills` are donor-internal routing, not needed here. The donor rules we _do_ violate are: type-dependency edges on `blocked_by` (already fixed — rule 13), tests of the wrong suite kind on a module's gate (F2 — unfixed), and self-contained minimal context (F3/F4 — partially unfixed).

## 1 · Data flow of the repair, step by step

Steps S1–S3 repair the _guardrails_ where defects originate; S4–S5 repair step 14's cut; S6 is the
replay that proves every new seam red-then-green. Execution order is the data dependency order;
each step's DOD must be machine-checkable before the next one starts.

### S1 — `checkTickets` gains rule 15: a module's own test class must match the map's unit-suite template

- **In:** the defect F2 (module test name accepted unchecked); the map's unit suite
  (`{ cmd, one, path, match }`, e.g. `match: "*Test.java"`).
- **Change:** in `steps/tickets/tickets.mjs`, `checkTickets({..., unit})` rejects a module ticket
  whose `testClass` violates `unit.match` (template with one `*`, fixed head/tail compared against
  the class basename), and `ticketsOf` refuses to build a `-Dtest=<name>` gate for such a name —
  it degrades to the documented whole-suite mark (`wholeSuite: true`, already logged by step 14)
  instead of inventing a legal flag.
- **Out:** ticket 22 of eddi, regenerated, either carries `RestImportServiceTest.java` (legal) or
  falls back to the whole suite with the log note; never an `-Dtest=*IT` gate.
- **DOD:** (a) unit test in `steps/tickets/tickets.test.mjs` — a section with `verify: ./mvnw
  verify -Dit.test=XIT · XIT` → rule 15 fires and lists the ticket name; (b) the same replayed over
  the _saved_ eddi sections (see S6) fires on ticket 22 only; (c) `node --test` green.

### S2 — step 9's plan guardrail validates `verify` against map-known suites

- **In:** the defect F2 upstream form (the role writes arbitrary test commands/names);
  `checkPart` (steps/design/card.mjs) currently checks only the line's shape.
- **Change:** (a) the `core-designer` order (steps/design/order-part.tpl) gets the repository's
  suite shapes substituted — allowed commands and each suite's `match` — from the map (already
  parsed by facts.mjs), the same way forms are substituted elsewhere (constraint «one rule, one
  place»); (b) `checkPart` receives the suites and refuses a `verify` whose command is not a
  map-known suite command, or whose test class name breaks that suite's `match`.
- **Out:** a red plan section instead of a downstream-broken ticket; `_eddi_` PLAN section 15
  (`./mvnw verify -Dit.test=RestImportServiceIT` on a _module_ section) is refused at step 9 with
  the suites named in the blocker.
- **DOD:** (a) new check refuses the eddi section 15's exact `verify` line replayed from disk;
  (b) green sections stay green (replay over PLAN.md); (c) unit tests cover both refusal classes
  (unknown command; name breaking `match`); (d) `node --test` green.

### S3 — per-use-case entry channel in the FRD (fixes F1 at its origin)

- **In:** F1 (one actor-level `via` for UCs entering through different endpoints); the FRD grammar
  (steps/intake/frd.mjs) and its guardrail `checkFrd`.
- **Change:** (a) FRD grammar accepts an optional `via` on `<usecase>` overriding the actor's;
  round-trip unit per standards/code.md (a format change must leave a `parse(write(x)) === x`
  test on its hardest legal value). (b) `checkFrd` gains a rule: several UCs sharing one actor
  whose entry steps name different endpoints (the step text or the scenario names a different
  path) must refine `via` per UC, or ask — the question rail exists; an endpoint-bearing UC whose
  actor's channel names a different path is a blocker. (c) step 14 `viaOf` prefers the UC-level
  `via`, falling back to the actor's.
- **Out:** on the eddi FRD, UC6/UC7 (agent export/import through the backup endpoints) and UC8
  (sync admin endpoint) carry their own channels; regenerated boundary tickets 05–07 name the real
  endpoints in «How to call it».
- **DOD:** (a) round-trip unit on FRD parser with `via` on both levels; (b) new `checkFrd` rule
  replayed over the saved eddi FRD → blocker naming UC6/UC7 (or UC8) until per-UC `via` is added;
  (c) tickets replayed after the fix show the three boundary bodies naming channels other than
  `/glossarystore/glossaries`; (d) `node --test` green.

### S4 — boundary sample chosen by channel/package proximity, not by global name stem

- **In:** F3 (uniform RagCrudIT for every UC); `near()` in `ticketsOf`.
- **Change:** the sample for a boundary UC is scored first by package/family proximity of its
  entry module (the package root of the module owning `UC/1` versus each outer-suite sample's
  package), then by the existing stem score, then alphabetical; no sample of the suite → boundary
  is not cut (existing rule) and the steps fall to module owners.
- **Out:** on eddi, UC6/UC7/UC8 pick a backup/sync-adjacent integration sample if one exists in
  the focused map; behaviour unchanged where the suite truly has one sample (RagCrudIT remains).
- **DOD:** (a) unit test: two candidate samples, one package-adjacent to the entry module — it
  wins over the stem-closer unrelated one; (b) where the map holds exactly one sample, output is
  byte-identical to today (no regression on the `eddi` plan's first four boundary tickets);
  (c) `node --test` green.

### S5 — boundary «Values» scoped to the UC's vocabulary

- **In:** F4 (`fields` = all FRD fields on every boundary ticket); `ticketsOf` `fields` mapping.
- **Change:** a boundary UC carries only the fields whose `in`-domain or name appears in the UC's
  own texts (goal/steps/extension texts); if none match, the block is omitted rather than dumped.
  Optionally the same scoping informs a new check rule: a listed field that none of the UC's texts
  can reach is noise.
- **Out:** UC6/UC7 boundary tickets list the agent/glossary fields they actually touch; Term-key
  noise disappears from export/import.
- **DOD:** (a) unit test: FRD with five fields, UC mentioning two → the ticket lists exactly
  those two; (b) regeneration over eddi: tickets 05/06 carry no `Term.key`/`Term.value` lines;
  (c) `node --test` green.

### S6 — replay-hardening and form rerun (verification, per standards/workflow.md §SUCCESS)

- **In:** S1–S5 landed; the saved eddi artifacts (`.agent/`, `task/DOS-535/`) as the replay
  corpus; the runbook `~/IdeaProjects/codemonstersdev/sandbox/pi-runbox.md` (read before any
  live run — restart pi; no `*.md` under `~/.pi/agent/pi-extensible-workflows/roles/`; run from
  the run directory).
- **Change:** (a) a replay harness (e.g. `bin/replay-tickets.mjs`, a head over proven parts) that
  re-derives `ticketsOf`+`checkTickets` from the saved eddi map/PLAN/FRD — a guardrail is a pure
  function of artifacts that survived on disk, so the replay costs zero tokens; before the fixes
  it reports F1–F4, after the fixes it is green except the documented fallbacks; (b) install
  (`node bin/install.mjs --to=`) into a **copy** of the master form under
  `sandbox/runbox/` (never the eddi working copy itself), rerun the pipeline to step 14, and
  diff: 22 tickets again, but ticket 22's gate legal, UC6/7/8 boundary channels real, rules 1–14
  untouched, rule 12 (cyrillic) still green.
- **Out:** a verified step 14 on a form other than this repository — the only proof that catches
  cwd-anchoring and install defects (AGENTS.md §SUCCESS).
- **DOD:** (a) `node --test` green as a whole; (b) the replay over eddi's saved artifacts: F1–F4
  each named before the fix, absent after, no new blocker introduced; (c) the live form rerun
  reaches `task/<KEY>/tickets` with the three visible ticket corrections above, gate1 retained
  (`kept`), and `run.yaml` marks step 14 done; (d) eddi itself untouched (`git -C
  sandbox/runbox/eddi status` clean regarding `task/DOS-535/`).

## 2 · Explicitly out of scope

- **F5 (UC8 remote-mock feasibility)** is a step-15 (implementation) decision, not a ticket-cutting
  defect: the boundary needs an infra answer (fake/mocked remote vs container IT) the map cannot
  provide. Recorded here so it does not get «fixed» by inventing a channel rule with no evidence.
- **Donor-specific routing fields** (`slice/type/io/skills`) stay out: our consumer is step 15's
  dispatcher, not the donor's izi. Revisit when step 15 is written.
- No new dependencies, no roles' rewording beyond S2(a)'s substituted suite shapes, no edits to
  `sandbox/runbox/eddi/` artifacts.

## 3 · Task-completion sanity check (the question the plan answers)

Executed strictly by `blocked_by` wave order and with S1–S5 landed, the ticket set covers every FRD
step exactly once (rule 2), every module exactly once (rule 1), gates only on things green at that
wave (rules 4/6/13/14+15), and names no file it must not write (rule 3 + forbidden lists). The
three holes that survive all 14 current rules — wrong channel (F1), wrong gate class (F2),
wrong-context priming (F3/F4) — are precisely what the donor's `validate-tickets` catches in its
own pipeline and what this plan moves into this repo's guardrails. If they hold on the eddi replay,
the tickets are the closest verifiable approximation to «execute in order → requirement satisfied»
this pipeline can claim before step 15 exists.
