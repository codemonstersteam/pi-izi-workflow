# Step 14 tickets — the second eddi/DOS-535 cut, what it proved, and the improvement plan

Evidence base (read in this run, not remembered):
- run `0def77fd` on `sandbox/runbox/eddi`, entered at step 14 alone (`resume: артефакт шага 14 исчез`),
  no role called, 0 tokens: `tickets: 22 нарядов — границ 7, модулей 15; волны 7 · 2 · 3 · 8 · 2`
- `task/DOS-535/tickets/*.md` — all 22 read in full; previous cut kept side by side for the diff
- `TASK.md`, `.agent/brd.md`, `.agent/frd.xml`, `task/DOS-535/PLAN.md` — the source of the cut
- the live repository itself: `LlmTask.java`, `PromptSnippetService.java`, `AgentConfiguration.java`,
  `PromptSnippet.java`, `IRestExportService.java`, `IRestImportService.java`, `pom.xml`
- `.agent/graph-computed.xml` (4782 `kind="method"` decls) vs the interface files it describes
- `steps/tickets/tickets.mjs`, `steps/tickets/facts.mjs`, `steps/scope/source.mjs`,
  `steps/scope/computed.mjs`, `ext/index.mjs`
- the review itself: `tasks/step-14-tickets-review.md`

## What is already right (measured on this cut, not assumed)

- **Ownership is exact.** All 8 use cases and every extension step were walked by hand: each step has
  exactly one owner, none is orphaned, none is claimed twice.
- **Waves compile bottom-up.** 09 `Glossary` · 10 `AbstractBackupService` → 08 `IRestGlossaryStore` ·
  11 `IResourceSource` · 12 `IGlossaryStore` → eight implementations → 19 `RestGlossaryStore` ·
  20 `LlmTask`. No ticket compiles before its provider; no two tickets in one wave write one file.
- **The type edge added in this slice fired live.** 08 and 11 sit one wave above 09 with
  `blocked_by: [09]` although the plan's `calls` lines never declared it — the edge was computed from
  the type standing in their signatures.
- **Repository facts reached the tickets.** `AbstractResourceStore`, `IResourceStorageFactory`,
  `IDocumentBuilder`, `DocumentDescriptor` arrive with their declarations and paths — exactly what a
  small model used to invent.
- **The unit gate is built from the map**, not from the role's prose: `./mvnw package -DskipTests &&
  ./mvnw test -Dtest=<Class>` in fourteen of fifteen module tickets.

## Defect D0 — closed inside this run, kept here as the receipt

The first launch died with `Invalid output from tickets` (run `9bbf195f`): the cutter had learned to
return `wholeSuite`, `tickets.output` in `ext/index.mjs` did not declare it, and
`additionalProperties: false` rejected the WHOLE answer — the 22 files were already on disk and the
step still did not close. Fourth occurrence of one class (`maxParallel`, `intakeLoops`, step 13's
branch, now this).

Fixed: the key is declared, and the seam is `ext/index.test.mjs` — the REAL return value of
`tickets.run` on a fixture against the REAL schema, checked by the host's own validator. Proven
backwards: deleting the `wholeSuite` line turns the test red. `node --test` — 474 green.

## Defects found — each with its receipt

**D1. A field declared in a foreign entity produces no delta, so no ticket ever writes it.**
The FRD carries `<field name="glossaries" in="AgentConfiguration" type="array[string]"…/>`, and three
use-case steps depend on it: UC5/1 ("reads agent configuration and extracts glossary references"),
UC6/2 ("extracts glossary references"), UC7/4 ("glossary references in agent config restored"). There
is **no delta and no touched entry** on `configs/agents/model/AgentConfiguration.java`, so step 9 wrote
no section for it and step 14 cut no ticket. Consequence, ticket by ticket: 16 `GlossaryService` has
`getAllByAgentId(String agentId)` with nothing to read the binding from; 20 `LlmTask` cannot extract
references; 17 `RestExportService` cannot tell which glossaries the agent references; 22
`RestImportService` has nowhere to restore them. UC5 does not close at all; UC6 and UC7 close halfway.

Why it was missed is on disk: snippets in this repository are **global** —
`LlmTask.java:214` puts `promptSnippetService.getAll()` into `templateDataObjects` for every agent, and
`AgentConfiguration` has no `snippets` field at all. The operator's decision "Glossary is a reference
in the agent config, like snippets" describes a mechanism this project does not have, and
"substitute only agent-bound glossaries" requires building it. The FRD declared the field and stopped
there.
**Address: step 6.** A field declared `in=` an entity that this change does not create must be backed
by a delta on the module that declares that entity.

**D2. Every Java interface is contract-less in the map, so tickets cannot name what to call.**
Ticket 20 must call `getAllByAgentId(agentId)` and is given, under "What you call",
`public interface IConversationMemory` — one line, no members. The file declares twenty methods,
`getAgentId()` among them. `.agent/graph-computed.xml` carries exactly ONE decl for that file.

Root, exactly: `steps/scope/computed.mjs:187` drops every decl whose visibility is not `public`, and
`steps/scope/source.mjs:188` calls a method public only when the literal keyword `public` is present.
**In a Java interface every method is implicitly public and the keyword is never written.** The class
`ConversationMemory.java` — same methods, explicit `public` — carries all of them. The same hole
empties `IResourceStorageFactory`, `IDocumentBuilder`, `IRestExportService`, `IRestImportService` in
every ticket that names them, and this codebase is interface-driven throughout.
**Address: step 3/5 (the scanner).** Visibility is grammar, and the grammar of an interface member is
public.

**D3. Boundary tickets name the actor's channel, not the use case's.**
Tickets 05, 06, 07 (UC6 export, UC7 import, UC8 remote sync) all say
"How to call it — ONLY through the program boundary: HTTP /glossarystore/glossaries". The real
channels are `@Path("/backup/export")` + `{agentId}`, `@Path("backup/import")`, and for UC8 not a local
endpoint at all. The executor is told to test agent export through the glossary CRUD path — that test
cannot be written. Cause: actor `api-client` has one `via`, and step 14 substitutes it into every use
case of that actor, while `UC6 step 1` already says "client requests agent export" in its own words.
**Address: step 14** (take the channel from the step text, fall back to the actor) — cheaper than
giving every use case its own `via` in step 6.

**D4. A module ticket gates on a test class the unit suite excludes.**
Ticket 22: `outputs: … RestImportServiceIT.java`, gate `./mvnw test -Dtest=RestImportServiceIT`, while
`pom.xml` gives surefire `<excludes>**/*IT.java</excludes>` and failsafe `<includes>**/*IT.java</includes>`.
The gate either runs nothing and is green, or fails for a reason that is not the ticket's. In the same
ticket the sample test is `RestImportServiceTest.java` — the ticket contradicts itself. The name came
from the plan's `verify` line (step 9 wrote `-Dit.test=RestImportServiceIT`); step 14 now rebuilds the
COMMAND from the map but still takes the CLASS NAME from the role unchecked.
**Address: step 14.** A ticket's own test name must match the unit suite's `match` pattern, or the cut
is red.

**D5. The data dictionary widened an explicit operator decision.**
Ticket 09 declares `Glossary(String id, Integer version, List<Term> terms, String resourceURI)`.
`TASK.md`: "fields of the Glossary resource — only id + version + terms". `brd.md` R4: "only id +
version + terms; no other fields". The FRD's dictionary nevertheless carries
`<field name="resourceURI" in="Glossary" … source="brd.md"/>` — sourced to the very document that
forbids it. And the sample the same ticket orders the executor to copy, `PromptSnippet.java`, carries
none of the three: id, version and the resource URI live in `AbstractResourceStore` and
`DocumentDescriptor`. One ticket, two incompatible instructions.
**Address: step 6 for the invention; step 11 for catching it** — judging the FRD against TASK.md is
the critic's job, and the critic is the step currently deferred (`docs/workflow.md` §3.11 TOBE). Until
it returns, the cheap partial is making the dictionary visible at gate 1.

**D6. Two open questions walked past gate 1 in silence, and a ticket answered one by itself.**
The FRD ships `<question subject="glossary-list-descriptor-endpoint">` and
`<question subject="glossary-cache-ttl-value">`. Gate 1 asked the operator to approve a plan and never
mentioned them; ticket 08 then declared `readGlossaryDescriptors(String filter, Integer index,
Integer limit)` — the answer to the first question, decided by the machine, never confirmed.
**Address: step 12.** An open question is exactly what the operator must see before approving.

**D7 (minor). The provider of a constant is neither an input nor a blocker.**
Ticket 19 owns "validates each term key: max 64 chars, matches `[a-z0-9_]+`", while
`TERM_KEY_PATTERN` is declared by ticket 15, which appears in 19's "Do not touch" list but not in its
`inputs` or `blocked_by`. The rule will be written twice. Same shape as the type edge, one level down:
a constant declared in one section and needed by another is an edge too.

**D8 (minor). "path" is ambiguous for the reader these tickets are written for.**
The boundary ticket says "Not one class and not one path of this change may appear in the text of the
test" and, four lines above, orders the executor to call `HTTP /glossarystore/glossaries`. A small
model cannot tell the source path from the URL. The rule means source files; the text must say so.

**D9 (accepted, not fixed). A constants-only ticket has no gate that can fail.**
Ticket 10 adds `GLOSSARY_EXT` and `GLOSSARY_URI_PATTERN` to `AbstractBackupService` and closes on
`./mvnw package -DskipTests`: two constants always compile, right or wrong. Nothing cheap can judge a
regex here; the first consumer (17, 22) is where it shows. Recorded so the next reader does not
mistake it for an oversight.

## What this run says about the cutter as a whole

Every defect above except D5 is COMPUTABLE — a visibility rule of the language, an edge, a name
checked against a pattern, a question already sitting in an XML element. None of them needs a role,
and none of them is a composition defect: the skeleton the cutter builds held on 22 tickets across
five waves. The failures are all at the seams where a fact was available and did not travel, or where
one document made a claim the next one never checked. D5 alone needs judgement, and it has an owner
already designed for it — the critic of step 11.

## Improvement plan — each step with its DoD

**S1. Interface members are public by grammar (fixes D2, unblocks D7's data).**
`steps/scope/source.mjs::javaDecls`: a member declared inside an `interface` body is public — no
keyword is written in Java — and so is a `default` method; `record` accessors likewise.
`steps/scope/computed.mjs:187` keeps its filter untouched: the visibility it reads becomes correct
instead of the filter becoming lax.
DoD: a fixture interface with three keyword-less methods yields three `kind="method"` decls with
`visibility="public"`; a private helper in a class stays out; `node --test` green; the seam is proven
by reverting `javaDecls` and watching the fixture go to one decl. Re-scanned on eddi,
`IConversationMemory.java` carries `getAgentId()`.

**S2. A field in a foreign entity demands a delta (fixes D1).**
`steps/intake/frd.mjs`: new rule F8 — for every `<field in="E">` where `E` is not a type this change
creates (no delta node declaring it), `E` must resolve through the map to a path, and that path must
be a delta node of this FRD. Otherwise the check is RED, naming the field, the entity and the module
that would have to change.
DoD: an FRD fixture declaring `glossaries in AgentConfiguration` with no delta on
`AgentConfiguration.java` is refused with that wording; the same FRD with the delta present is green;
a field in a NEW entity (`terms in Glossary`) stays green; `docs/intake.md` §4 gains F8.

**S3. Gate 1 shows the open questions and the dictionary of the new entities (fixes D6, surfaces D5).**
`ext/index.mjs::gate1`: the approval text gains two lines — every `<question subject=…>` of the FRD
verbatim, and the field list of each entity this change creates. An FRD with open questions may still
be approved; what it may not do is be approved silently.
DoD: a fixture FRD with two questions produces an approval text carrying both, and the field list
`id · version · terms · resourceURI`; an FRD without questions produces the text unchanged from today;
the gate's token still binds to the plan's sha256 as before.

**S4. The boundary channel comes from the step (fixes D3).**
`steps/tickets/tickets.mjs`: the boundary ticket's channel is the path named in the use case's own
step text (an HTTP verb and a path, or a named entry point); only when the step names none does it
fall back to the actor's `via`. Guardrail: a boundary ticket whose channel contradicts the path named
in its own step text is a blocker.
DoD: a fixture UC whose step says "client requests agent export via POST /backup/export/{agentId}"
yields that channel while the actor's `via` says otherwise; a UC naming no path keeps the actor's
`via`; the eddi re-cut gives tickets 05/06/07 the backup endpoints.

**S5. The own-test name must belong to the unit suite (fixes D4).**
`steps/tickets/tickets.mjs`: the class named by the plan's `verify` line is checked against the unit
suite's `match` from the map; a name that does not match (an `*IT` class under a `*Test.java` suite) is
a blocker of the cut, naming the ticket, the class and the pattern. The ticket's own test file is
named from the same pattern, so `outputs` and the sample can no longer disagree.
DoD: the RestImportService fixture is refused with "RestImportServiceIT does not match *Test.java";
after the plan line is corrected the ticket carries `RestImportServiceTest.java` in outputs, in the
sample line and in the gate; seam proven by planting the IT name.

**S6. A declared constant is an edge (fixes D7).**
`steps/tickets/tickets.mjs::declaredTypesOf` is widened from types to declared NAMES: an
upper-case-constant declared in one section's `declares`/`fields` and mentioned in another section's
body creates the same edge a type does, feeding `blocked_by`, `inputs` and the waves.
DoD: a fixture where section B's rule text mentions `TERM_KEY_PATTERN` declared by section A puts A
one wave below B with `blocked_by: [A]`; a constant mentioned by nobody changes nothing.

**S7. The boundary ticket says what it means (fixes D8).**
`steps/tickets/tickets.mjs`: the rule line becomes "no source file of this change and no class of this
change may appear in the test — the URL of the boundary is exactly what you DO call".
DoD: the text appears in the cut fixture; the test that pins boundary wording is updated.

**S8. Docs and live verification (constraint 7 — never in this repository).**
`steps/tickets/data-flow.md` gains the new guardrail rules one-to-one with `checkTickets`;
`docs/intake.md` gains F8. Then the live pass: re-run step 14 on the eddi runbox copy (cheap — no
role), and a FULL run on `t2` for S1-S3, which touch steps 3, 6 and 12 and therefore cost an intake
round.
DoD: on eddi the re-cut shows the backup endpoints in 05/06/07, `RestImportServiceTest` in 22,
`getAgentId()` under ticket 20's "What you call", and a `blocked_by` on ticket 19 for the constant;
on `t2` the band reaches step 14 green with F8 and the widened gate 1 in place; `node --test` green as
a whole before either launch.

## Order of execution

S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8.

S1 first: it changes what every later step is allowed to know, and both S2 and the tickets' inputs
read the map it fixes. S2 and S3 are the two steps that move the BAND (a red F8 rewinds to intake, a
wider gate 1 changes what the operator approves), so they land before anything that would have to be
re-cut afterwards. S4-S7 are independent cuts inside `tickets.mjs` but touch one function, so they
land in sequence. S8 closes the task and is the only step that may not be declared done from this
repository.
