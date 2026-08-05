# code.md — rational design of the harness

Adapted from `rationaldev-ai-sdlc-skills`: `program-design` (module tree, contracts, unit formula) and
`program-implementation`. This file governs **harness code** — `core/*.mjs`, `bin/*.mjs`,
`steps/*/*.mjs`. Role and order texts are governed by `standards/role.md`, the return envelope by
`standards/protocol.md`.

**Correctness here is established by construction, not by coverage.** Testing proves the presence of
defects, never their absence. If a rule below is not enforced by a seam, it is listed as a review gate —
never as prose pretending to be a mechanism.

---

## 1. Vocabulary — the skill's terms in this harness

| skill term | here | lives in |
|---|---|---|
| vertical slice | one pipeline step | `steps/<id>/` |
| `Request` | the step's declared named `in` | `step.json` |
| ingress adapter | `argv` parsing, stdin reading | `bin/*.mjs`, top |
| head module | the step's orchestrating pipe | `bin/*.mjs` |
| logic module | constructor or pure function | `core/*.mjs`, `steps/<id>/<name>.mjs` |
| I/O module | autonomous holder of `node:fs` / `node:child_process` | `bin/*.mjs` |
| component scenario | live step run in an installed sandbox | `bin/*.test.mjs` |
| unit | test over a logic module | `core/*.test.mjs`, `steps/*/*.test.mjs` |

`Result<T, E>` in JS is `{ ok: true, value }` or `{ ok: false, error }`. Never a bare `null` meaning
both "absent" and "failed" — those are two outcomes.

---

## 2. How correctness is established

```
Decompose into modules.
Every module validates the admissible range of its input.
Then the program is correct.
```

Three obligations follow, and they are the whole discipline:

1. **Antecedent** — stated on every module: what MUST hold of the input. Not "a string", but which
   strings.
2. **Consequent** — stated on every module: what is guaranteed on success, and which error classes on
   failure.
3. **Composition** — `consequent(A) ⊆ antecedent(B)` for every call `A → B`. A caller MUST NOT hand a
   callee anything the callee's antecedent does not admit. This is the proof obligation, and the call
   graph is where it is discharged.

A module whose antecedent is "anything" proves nothing and forces every caller to re-check.

---

## 3. Module rules — HARD

**3.1 One input, one output.** A module takes one input and returns one output. Single entry / single
exit is what makes it closed and substitutable. A second input means a second module.

**3.2 One data argument.** Exactly one data entity per node — the one that step owns. Two or more MUST
NOT appear: either bind the extra as a collaborator, or name the join as a type with its own
constructor. Probes, clocks and config are **dependencies**, not data arguments, and are bound before
the pipe.

**3.3 FORBIDDEN: a shared context object.** One input ≠ one bag holding everything. A carrier hands
every node access to everything, the antecedent stops being narrow, and the antecedent/consequent table
becomes fiction.

**3.4 Valid by construction.** A domain value MUST be produced by a single factory
`newT(raw) -> Result<T, Error>` that validates **every** field against its admissible range. A field is
either its own validated value object or a primitive explicitly range-checked in the factory. No field
passes unchecked. A naked object literal of a domain type MUST NOT appear outside its factory. JS cannot
enforce this at compile time — the factory MUST `Object.freeze` its result, and the rule is a review
gate (§6).

**3.5 Invariant = subtype, not guard.** An invariant over an already-valid value becomes a constructor
(`newFreshMark`), never a `check(x) -> void`. A guard leaves the type unchanged and is easy to skip; a
constructor makes "unchecked" unrepresentable.

**3.6 One module, one function, one phrase.** If the phrase needs "and", the module is composite —
split it.

**3.7 The head is a pipe.** A head module is a linear sequence of one-call steps carrying
`Result<T, E>`. No branches, no loops, no logic of its own. Reading the head MUST show the whole step in
five to ten lines. A decision inside a head belongs to a logic module the head calls.

**3.8 Decisions at the top.** A lower module MUST NOT decide for a higher one. The head decides; the
subordinate computes.

**3.9 I/O is an autonomous object.** `node:fs` and `node:child_process` live inside an object exposing
domain methods. The head sees methods, never a raw handle. An I/O module is an empty pipe: take a domain
value, call the outside, return a result or an error class. No business logic; mapping foreign error
codes to error classes is allowed.

**3.10 Pure core.** `core/*.mjs` and a slice's logic module import nothing from `node:`. State arrives
through probes, time through an argument. A function that reads the clock itself cannot be proven by a
test.

**3.11 No call history.** A module MUST NOT keep state between calls to steer its own behaviour.

**3.12 Absence, tool failure, unknown.** Three distinctions defined once in `standards/protocol.md` and
not restated here: "file missing" ≠ "file empty"; "the tool did not answer" ≠ "there is no data";
"cannot decide" ⇒ return a question, never a silent default.

---

## 4. Contract — frozen template

Every module carries a module contract. Every exported logic function carries a function contract. The
shape is fixed: fields are not renamed, dropped or added.

```js
// MODULE_CONTRACT: <name> — <one phrase: the secret it hides>
// Purpose:      <the ONE design decision hidden here>
// io:           none | fs | proc
// Invariants:   <what holds always, regardless of call order>
// Interface:    <one exported name per line, with its signature>
```

```js
// FUNCTION_CONTRACT: <name> — <one phrase>
//   Input:        <one data entity; its type>
//   Dependencies: <probes, clock, config — or «—»>
//   Antecedent:   <the admissible RANGE of the input; what must hold>
//   Consequent:   success: <what is guaranteed>
//                 failure: <one line per error class>
```

`Antecedent` is the load-bearing field. "a string" is not an antecedent; "a non-empty string matching
`^[a-z][a-z0-9-]*$`" is. If the antecedent cannot be written as a range, the input is not yet a domain
type — introduce one (§3.4).

A contract that has drifted from its code is worse than none: it orders the next author to satisfy a
requirement the code no longer has.

---

## 5. Test count — a consequence, not a goal

```
N_units(logic module) = 1 (happy path) + Σ (antecedent branches)
```

An antecedent branch counts **only if it yields a distinguishable consequent** — a different value or a
different error class. Three ways to supply a bad field that produce one error class are **one** branch.

**A correctly decomposed logic module has a narrow antecedent — one or two branches — hence two or
three units. More than three units on one logic module means the module is under-decomposed: split it
(§3.6), do not write the fourth test.**

**NOT unit-covered — MUST NOT be:** the head module, I/O modules, the ingress adapter. All three are
pipes of already-proven parts; a unit over them is an integration test wearing a unit's name. They are
proven by component scenarios through the step's real input.

**Aggregate validators** — those returning a list of independent findings instead of one decision — are
the sign that a factory was never built. While one exists, the rule is coverage, not count: every
finding code MUST appear in a test that **imports that module** (a code of the same name in a
neighbour's tests proves nothing). Convert the validator to a factory and the codes become antecedent
branches; this coverage rule then disappears with it.

**A test holds if there exists a code change that reddens it alone.** A test that can never redden alone
is a duplicate and MUST be deleted. Verify by mutation, not by reading.

Test form, RED-first discipline, corpus-versus-unit asymmetry, derived-not-literal numbers: stated once
in `README.md`, «Правила тестирования». Not restated here.

---

## 6. Enforcement — seam or review gate, stated honestly

| rule | seam | where |
|---|---|---|
| §4 module carries `MODULE_CONTRACT` with all fields | lint | `core/core.test.mjs` |
| §4 exported function carries `FUNCTION_CONTRACT` with all fields | lint | `core/core.test.mjs` |
| §4 `Interface:` names match actual exports | lint | `core/core.test.mjs` |
| §4 declared `io:` matches imports | lint | `core/core.test.mjs` |
| §3.10 pure core imports no `node:` | lint | `core/core.test.mjs` |
| §5 head / I/O exports no function | lint | `core/core.test.mjs` |
| §5 finding code covered by a test importing that module | lint | `core/core.test.mjs` |
| a role may not write its step's `out` | lint | `core/core.test.mjs` |
| no text references a `.mjs` path absent from disk | lint | `core/core.test.mjs` |

**Review gates — not mechanizable, and not pretended to be.** §3.1 one input/one output · §3.2 one data
argument (a validator cannot tell a port from data by signature) · §3.3 no shared context · §3.4 valid
by construction · §3.5 subtype over guard · §3.6 one phrase · §3.7 head is a pipe · §3.8 decisions at
the top · §3.9 I/O autonomy · §2 `consequent ⊆ antecedent` across the call graph.

A lint that does not redden when the defect is reintroduced is a comment. Introduce every seam by
putting the defect back, watching it redden, and removing it again.

---

## 7. STOP

Stop and return to design; do not write code or tests around it:

- a node needs two data arguments → name the join or bind a collaborator (§3.2);
- a logic module needs a fourth unit → it is under-decomposed (§5);
- a head module needs a branch → the decision belongs to a logic module (§3.7);
- an antecedent cannot be written as a range → the input is not a domain type yet (§3.4);
- a caller must re-check what the callee already validated → the contracts do not compose (§2);
- a rule is about to be written into a role text with no seam behind it → it will not hold (§6).

---

## 8. Debt — where this harness violates the rules above

Stated, not hidden. Each line is work, not decoration.

| `io:` is declared and linted, but nothing routes on it | — | honest about facts: the field states what a module touches, but no sub-skill is attached to it here |
| there is no machine sign for "the run is standing, not hanging" | — | the stall watchdog sees silence, not non-advance. `run-4` stood on a step it could have closed: the model kept answering, no check reddened, and only a human stopped it. `.agent/decisions.log` repeating one line is the fact that would show it |

**Two-argument nodes that remain, and why each is not a violation.** `readDeclarations(pipeline,
readStep)`, `stepDone(step, state)`, `nextStep(list, state)` — the second is a probe. `newPathMap(raw,
field)`, `newCommand(raw, field)` — the second is a label for the diagnosis, not data.
`missingLayers(text, required)`, `newLoops(raw, required)`, `newPlan(raw, subjects)` — the second is a
registry or a fact bound by the caller. `newFit(raw, known)`, `newRequirement(raw, known)` — `known` is
computed once and bound before the loop, a collaborator. `stagingStale(cell, state)`,
`receiptsToWrite(cell, closed)`, `cellsOf(step, plan)` — the second is a probe or a fact of the run the
caller already holds; the cell owns the data. `newOrder({template, vars, docs})`, `newCell({step,
entry})`, `newPartList({plan, files})`, `newMergedGraph({parts, plan})` and `newBrd(text, sources)`
are the join constructors themselves, which the rule explicitly permits and which nothing else
takes 2+ for.

**Closed:** `parseEnvelope` → `newEnvelope` (phase 1) · rail decision → `core/move.mjs` (phase 2) ·
`validateSteps` → `newStep`/`newStepList` (phase 3) · `fillTemplate` → `newOrder`/`render` (phase 4) ·
`assembleDoc` → `readDeclarations`/`newLoops`, folded into `newStepList` (phase 5) · the
rail-violation decision → `railViolated` (phase 6) · every `FUNCTION_CONTRACT` migrated from the old
edition (Input/Output/Side effects/Guarantees/Raises) to the frozen §4 template
(Input/Dependencies/Antecedent/Consequent); the lint now accepts only the new form (phase 7) ·
`resolveCheck(step, artifact)` → `resolveCheck(cell)`: the join of a step's check with the artifact it
judges is now a type (`Cell`), and both pipes stopped choosing that artifact by the same copied
expression (phase 8).
No aggregate validator remains, and no decision is left inside a head module.
An invalid envelope, step, step list and order are no longer representable, and no node outside a
constructor takes two data arguments.

---

## Related

- `standards/protocol.md` — envelope `IZI/1`, two rails, receipt closes a step, the three distinctions
- `standards/role.md` — role skeleton, layers, permissions
- `README.md` — pipeline design rules, testing rules
- source: `rationaldev-ai-sdlc-skills/skills/lib/program-design`, `.../program-implementation`
