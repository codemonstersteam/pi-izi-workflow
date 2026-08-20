# Step 14 tickets — systematic analysis of the eddi/DOS-535 run and the improvement plan

Evidence base (read, not remembered):
- `task/DOS-535/tickets/*.md` — 22 tickets (7 boundary wave 0, 15 module waves 1-4)
- `task/DOS-535/PLAN.md`, `task/DOS-535/design/labs-eddi.md` — the source the tickets are cut from
- `.agent/appgraph.xml` (swarm map: 230 decls) vs `.agent/graph-computed.xml` (script map: 6070 decls, all 1576 java files)
- `steps/tickets/tickets.mjs`, `steps/tickets/facts.mjs`, `steps/tickets/data-flow.md` — the cutter
- Donor: `rationaldev-ai-sdlc-skills/skills/roles/wirth-ticketer/wirth-ticketer.md`

## What is already right (measured, not assumed)

- The two-kind split (boundary wave 0 / module wave = layer+1) works: boundary tickets name no new
  class, compile now, and carry the red-by-business-reason rule.
- Waves go bottom-up: `Glossary`/`IGlossaryStore` wave 1-2, the REST resource wave 4. `blocked_by`
  resolves everywhere and the guardrail's 12 rules are green on this set.
- Stack priming, "Do not touch" with named files and ticket numbers, the sample+sample-test pointers —
  all present and correct.
- Guardrail rule 2 held: every FRD step is checked exactly once.

## Defects found — each with its receipt

**D1. Type dependencies create no edges → parallel waves break compilation.**
Ticket 08 (`IRestGlossaryStore`, wave 1, `blocked_by: []`) takes `Glossary` in every signature;
ticket 09 (`Glossary`) is ALSO wave 1. Ticket 11 (`IResourceSource`, wave 1) has the
`GlossarySourceData.glossary: Glossary` field — same story. Run wave 1 in parallel and 08/11 fail to
compile with no defect of their own. Root: waves and `blocked_by` derive only from the role-declared
`calls` edges; a type USED in `signatures`/`fields`/`declares` is not an edge. `tickets.mjs` already
extracts mentioned type names (`mentions` → `repoTypes`) but DROPS the plan-owned ones instead of
turning them into edges. The donor has this as a hard rule (wirth-ticketer: "`blocked_by` MUST
include TYPE dependencies", live-finding 17-07). Computable — no role needed.

**D2. `verify` loses the own-test flag → every module ticket gates on the WHOLE unit suite.**
Plan line: `verify: ./mvnw test · GlossaryStoreTest`. `tickets.mjs::namedTest` extracts the class,
but `own = cmd.replace(/-D(it\.)?test=\S+/, …)` only REWRITES an existing flag — the plan's `·`-form
carries none, so the flag is never injected. All 15 module tickets say
`./mvnw package -DskipTests && ./mvnw test`. Consequences: minutes per gate instead of seconds, and
with parallel waves ANY other ticket's red test blocks this ticket — a gate the ticket cannot reach,
exactly the class of defect rule 4 exists to forbid. Contradicts step 14's own doc
("ворота — сборка и ТОЛЬКО свои тесты").

**D3. HTML entities in code-facing text.**
`List&lt;DocumentDescriptor&gt;` — 23 occurrences in `design/labs-eddi.md`, written by the
core-designer ROLE, propagated verbatim into PLAN.md and every ticket's signatures. An SLM copying a
signature pastes broken Java. Root is step 9: no guardrail rule refuses `&lt;|&gt;|&amp;|&quot;` in a
section. Fix where it is written (step 9 guardrail), not by unescaping downstream.

**D4. "What you call" misses existing repo types the swarm never surveyed.**
`IDocumentDescriptorStore`, `MeterRegistry`, `IResourceStorageFactory`, `IDocumentBuilder`,
`RestVersionInfo` — constructors take them, the tickets name them, but `appgraph.xml` has 0 decls
for them (the swarm surveyed only the focus cells), so `facts.declOf` answers null and the ticket
gives neither signature nor path. Yet `graph-computed.xml` — script-built, 0 tokens — carries 6070
decls over all 1576 files including every one of these. The fact exists; it never travelled.

**D5. A module ticket gates on an integration suite.**
Ticket 22 (`RestImportService`, wave 3): `verify: ./mvnw verify -Dit.test=RestImportServiceIT`
(inherited from the plan line). A whole-app IT at wave 3, while the feature is half-built, can be red
for reasons outside the ticket. Outside-in checking belongs to the boundary kind; module gates are
build + own unit tests.

**D6 (minor).** Whole-suite gates also re-run already-green earlier-wave tests — pure waste for a
27B-model budget; fixed by D2.

## On the task's idea: "an SLM writes the ticket content from the data generated till GATE1"

The five defects above are all COMPUTABLE — edges, a flag, forbidden characters, an index lookup. No
role is needed to fix any of them, and a role writing ticket bodies would reintroduce exactly the
composition defects that moved step 9 to fill-in-the-blank (measured: eddi's hand-written dictionary
carried duplicates and holes; the skeleton never does). If a live SLM execution later shows the prose
itself is what fails, the pattern that fits this codebase is step 9's: script composes the ticket
skeleton with every fact in place, a role fills only free-text blanks, the guardrail recomputes the
composition. Decision deferred until there is a measurement, per constraint 3.

## Improvement plan — data flow, each step with its DoD

**S1. Type edges in the cutter (fixes D1).**
`steps/tickets/tickets.mjs`: capitalized type names mentioned in a section's
`signatures`/`fields`/`declares` that resolve to another PLAN section's declared type become a
`waitsFor` edge; waves are recomputed over calls+type edges. New guardrail rule 13: the wave of a
type-provider is strictly lower than the wave of every ticket naming its type.
DoD: on a fixture mirroring eddi's 08/09, ticket 08 lands one wave above 09 with `blocked_by: [09]`;
`node --test` green with a new unit test; rule 13 fires on a hand-built same-wave pair (seam proven
by reintroducing the defect).

**S2. Own-test gate (fixes D2, D6).**
`tickets.mjs`: when the plan names a test class and the suite command lacks the flag, the flag is
INJECTED using the suite's own `one`-template from the map (`-Dtest={class}` or whatever the
repository's suite declares); no template → fall back to the whole suite and SAY so in the log.
DoD: eddi fixture yields `verify: ./mvnw package -DskipTests && ./mvnw test -Dtest=GlossaryStoreTest`;
a suite without a template yields the whole-suite command plus a log line. Tests green.

**S3. Module gates never run another suite KIND (fixes D5).**
`tickets.mjs`: a module ticket's verify is built from the UNIT suite + build command only; a plan
line naming the IT suite is honoured for boundary tickets alone. Guardrail rule 14: module `verify`
contains no IT-suite command.
DoD: the RestImportService fixture gates on `./mvnw test -Dtest=…`; rule 14 fires on a planted IT
command in a module ticket.

**S4. No HTML entities in design sections (fixes D3 at the source).**
`steps/design/card.mjs` (or the part guardrail that owns section grammar): a section carrying
`&lt; &gt; &amp; &quot;` is RED with a blocker naming the line; the role rewrites.
DoD: guardrail refuses a fixture section with `List&lt;T&gt;`; the 23 occurrences pattern is covered
by a test; `node --test` green.

**S5. The type index reads the computed graph (fixes D4).**
`steps/tickets/facts.mjs` + `ext/index.mjs`: `declOf` falls back to `graph-computed.xml` (already on
disk, 0 tokens) when the swarm map does not know the type; the found path joins the ticket's `inputs`
with its decl as the signature line.
DoD: an eddi fixture resolves `IDocumentDescriptorStore` →
`src/main/java/ai/labs/eddi/configs/descriptors/IDocumentDescriptorStore.java` and the ticket's
"What you call" carries its sig; a type nobody knows stays silent (no invention).

**S6. Docs and seam tests.**
`steps/tickets/data-flow.md` gains rules 13-14 in the guardrail table; each new rule's test proves
the seam by planting the defect.
DoD: doc table matches `checkTickets` one-to-one; `node --test` green as a whole.

**S7. Live verification (constraint 7 — never in this repo).**
Re-run step 14 on the eddi runbox COPY and on `t2`; diff the new tickets against the current set:
expect wave moves for 08/11, `-Dtest=` in every module gate, no `&lt;`, repo-type signatures present.
DoD: both forms produce guardrail-green tickets; the four defect classes are absent from the diff.

## Order of execution

S4 → S1 → S2 → S3 → S5 → S6 → S7. S4 first because it changes what step 9 hands down; S1-S3 are
independent cuts inside `tickets.mjs` but touch the same function, so they land in sequence; S5 is
independent of S1-S3; S7 is the gate that closes the task.
