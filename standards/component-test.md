# Standard: writing component tests

$START_GOAL
A step is proven the way it actually runs — artifacts in, order assembled, role answered, guardrail
judged, artifact promoted — in milliseconds, offline, without a live run.
$END_GOAL

$START_CONTEXT
`standards/code.md` covers units: one pure function, one antecedent branch. Units cannot reach a
STEP. The rail (`workflows/izi.js`) executes inside the host sandbox and is imported by nobody, so
until a component test exists the only proof that a step works is a live run — a separate `pi`
session, 4–9 minutes per role call, and a journal to read afterwards.

A component test closes that gap. It is the same path the rail walks, driven from `node --test`:

```
fixture on disk → script skeleton → order slots → order text → RECORDED role answer
                → guardrail of the portion → join → guardrail of the whole → promoted artifact
```

Three things are real in it — the input artifacts, the guardrails, the promotion. One thing is
recorded — the model's answer. Nothing is simulated.

Worked example, and the shape every new one copies: `steps/plan/tree/component/`.
$END_CONTEXT

$START_LAYOUT
One component test per step, INSIDE the step's own directory — a step is one folder and everything
about it lives there (`standards/workflow-design.md`, `$START_SHAPE`):

```
steps/<step>/
  <step>.step.mjs                head of the step: id, next, fold
  inputs.mjs cut.mjs order.mjs route.mjs      the fivesome
  judge.mjs  judge/<RULE>.mjs                 a judge PER RULE
  order-<step>.tpl                            order templates, read module-relative
  <role>.md                                   the role — where roleDirectories points
  judge/<RULE>.test.mjs                       units, one file per judge
  component/
    fixture/                     THE INPUT ARTIFACTS OF THE STEP, side by side
      .agent/frd.xml             …exactly the files the step reads, nothing else
      src/…                      …including the repository files it samples
    order.txt                    the assembled order, for a human to read
    answer-<model>.txt           the RECORDED answer of that model to THIS order
    <step>.component.test.mjs    the test
```

The test imports the step it proves as `../<step>.step.mjs` — a neighbour, not a journey through the
extension. Anything else in the import list is a dependency the step should not have had.

`fixture/` is copied into a fresh `mkdtempSync` directory per test — the step runs against
`context.run.cwd`, never against this repository (`CLAUDE.md`, constraint 6). A test that writes
into the repo is a defect, not a shortcut.

`order.txt` is not read by the test. It exists so the operator can read what actually leaves for the
model, and it is regenerated whenever the template or the slots change.
$END_LAYOUT

$START_CONTRACTS
**The test DRIVES the step the way the rail does — `next` then `fold`, in a loop.** It does not
reassemble slots, staging paths or portion arithmetic: all of that lives inside the step, and a test
that rebuilds any of it proves its own copy instead of the step.

```js
import * as step from "../<step>.step.mjs"

const drive = (state, answer) => {
  const trace = []
  for (let it = step.next(state); it.do !== "done"; it = step.next(state)) {
    trace.push(it)
    if (it.do === "err") return { state, trace }
    state = step.fold(state, { do: it.do, result: answer(it, trace.length) }).value
  }
  return { state, trace }
}
```

A copy of the loop is unavoidable — the sandbox has no `import`, and `agent`/`parallel`/`checkpoint`
exist only inside it, so a shared driver module cannot exist (`standards/workflow.md`, constraint 1).
Therefore the copy is GUARDED: the words a step emits, the keys of `PRIMITIVES` in the rail, and the
branches of this `drive` are three sets checked pairwise by a seam
(`standards/workflow-design.md`, rule 3).

**AAA, and the arrange block is documentation.** Head the arrange with a list of the input artifacts
and one line each on what the step takes from them — that list is the step's real input contract,
and the reader has no other place to find it. Assert the fixture is complete before acting: a
missing file must read as `фикстура неполна: нет .agent/ripple.xml`, not as a guardrail blocker
fifty lines later.

**The stub is a RECORDED answer, never an invented one.** Obtain it by sending the order THIS code
assembles to the real model, and keep it verbatim:

```bash
node -e 'import("./ext/index.mjs").then(…)' > /tmp/order.txt   # the order the rail would send
curl -sS https://openrouter.ai/api/v1/chat/completions -H "Authorization: Bearer $OPENROUTER_API_KEY" …
```

Record in the test's header which model answered, at what temperature, and what it cost in tokens
(input, output, of which reasoning). An invented answer proves our expectations of the model; a
recorded one proves the model. The difference is the entire value of the file.

**The stub does what the role does with its hands**: writes the answer to the staging path and
returns the envelope the role would return. It does not parse, fix or normalise anything.
$END_CONTRACTS

$START_CONSTRAINTS
0. **The step judges its own INPUT first.** The arrange block asserts the fixture is complete, and
   the step itself is asserted to refuse BY NAME when an input artifact is missing or its sha1 moved
   — «вход зелен» is a comment until something checks the content
   (`standards/workflow-design.md`, rule 11).
1. **The verdict is the judge — not the file's existence.** `existsSync(artifact)` answers "did
   something get written", and in a stand where promotion is not locked behind the verdict a REJECTED
   answer still lands. Assert on `blockers` first, and separately that the artifact did NOT appear on
   the rejected rail (`CLAUDE.md`, constraint 2). Cost of ignoring this: an ablation run scored six
   role variants "ПРИНЯТО" while one of them had invented two non-existent files.
2. **Three rails for a step with a role, four when its portions run in parallel.** Accepted answer ·
   rejected answer · the model REFUSING (a dropped connection). The rejected test spoils the recorded
   answer at exactly the defect the step exists to prevent, and asserts the spoiling APPLIED
   (`assert.notEqual(broken, ANSWER)`) — a corruption that silently missed its target turns the test
   into a green comment. The refusal test asserts three things at once: the step did NOT close, the
   artifact was NOT written, and **the repair budget was NOT spent** — a dropped connection is not
   the role's mistake, and charging a round for it burns the step's budget on the network.
   When portions run in parallel (`scope`, `plan/flows`) the refusal splits in two: ONE portion of
   seven dropped — its neighbours keep their verdicts and their rounds, and the step stays open — and
   all of them dropped. A step without a role has two rails: accepted and rejected.
3. **The rejected test carries the repair path too.** A guardrail verdict is a work order: assert
   that the repair task names an ADDRESS, and that the repair order carries the previous answer and
   does not carry dead weight (a skeleton the role is not building any more).
4. **Assert the ORDER, not only the artifact.** Name the things the role cannot answer without — the
   sample's declaration, the annotation that carries the convention, line numbers on the digest, the
   rule the whole step was rewritten for — and assert no slot stayed unfilled (`{SKELETON}` in the
   text is data that never arrived).
5. **A seam guards the MEANING of a rule, not its wording.** Role files change language as they
   mature (`standards/role.md`, constraint 5); a seam matching a Russian phrase turns red on a
   translation, which is a revision mark and not a defect. Match either form, or match the structure.
6. **Assert what the step exists to decide.** The last assertions are not plumbing: they read the
   promoted artifact and check the decision itself — that `needs` holds declarations and not calls,
   that the order of work is acyclic, that the first wave is what it must be. That is the assertion
   the live run used to be needed for.
7. **Offline and fast.** No network, no `pi`, no host. If a component test cannot run on a plane, it
   is a live run wearing a test's name.
$END_CONSTRAINTS

$START_FORBIDDEN
- **Do not re-record the answer to make a test green.** That is `standards/code.md`'s "do not edit a
  test to make it green" with extra steps. A recorded answer is re-taken only when the ORDER
  deliberately changed — and then the header's numbers and the reason are updated with it.
- Do not hand-edit the recorded answer. Spoil it in the test, in the open, at a named defect.
- Do not let the component test replace units — it cannot tell WHICH function decided wrongly.
- Do not write one for a head or an adapter: there is no decision inside to judge.
- Do not stub a guardrail. The guardrail is the thing under test.
$END_FORBIDDEN

$START_SUCCESS
- `node --test` green as a whole, the component test among it, with no network.
- The folder holds fixture, assembled order, recorded answer and test — a reader who opens only that
  folder can see what goes in, what comes back, and who judged it.
- Both rails covered, and the rejected rail proven by a corruption that is asserted to have applied.
- The rail and the test assemble the order from the SAME module.
$END_SUCCESS
