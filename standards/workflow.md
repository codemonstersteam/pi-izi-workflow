# Standard: workflows on pi-extensible-workflows

$START_GOAL
Write pipeline steps that a machine can replay: order is code, artifacts are judged by scripts, and
every fact about the host below is evidence-backed, not remembered.
$END_GOAL

$START_CONTEXT
The host is `pi-extensible-workflows` (source: `/Users/mac/IdeaProjects/codemonstersdev/pi-extensible-workflows`).
A workflow is JavaScript executed in a sandbox by `runWorkflow` (`packages/core/src/execution.ts:422`).
Globals: `agent`, `shell`, `prompt`, `parallel`, `pipeline`, `checkpoint`, `withWorktree`, `phase`,
`log`, `args`, plus every function the extensions register.
Run state lives on disk: `~/.pi/workflows/projects/<slug>/sessions/<sid>/runs/<runId>/`
(`state.json`, `result.json`, `journal.json`, `summary.json`, `workflow.js`).
$END_CONTEXT

$START_CONSTRAINTS
1. **The sandbox has no `import`, no `fs`, no network, no timers.** Anything external goes through
   `shell()` or an extension function. Do not try to work around this.
2. **`shell()` is for verification, not mutation** (bundled skill, "Runtime and safety rules").
   Prefer an extension function whenever a file must be read or written.
3. **Extension functions resolve paths against the run's cwd** — `context.run.cwd`
   (`packages/core/src/types.ts:120-122`), never against the extension's own location. Anchoring to
   `import.meta.url` reads the wrong project the moment the harness is installed elsewhere.
4. **`registerWorkflowExtension` accepts exactly five capabilities**: `functions`, `modelAliases`,
   `agentSetupHooks`, `agentAttemptActions`, `roleDirectories` (`registry.ts:46`). Unknown top-level
   keys fail the load. `version` and `headline` are required; the npm build also requires
   `description` — declare all three.
5. **`outputSchema` replaces hand-written parsers.** The host validates the agent's return through
   `workflow_result`; do not write an envelope grammar. On `track:"err"` the schema requires `kind`
   and `subject` — conditionally, not just `track` (`workflows/izi.js`, `ENVELOPE`). The schema
   decides, not the workflow: the host compiles `outputSchema`
   (`pi-extensible-workflows/packages/core/src/agent-execution.ts:816`) and rejects a malformed
   envelope inside the role's own turn (`isError:true`) — no `LOOPS` spent, no re-delegation. Before
   this rule `track:"err"` alone was a valid envelope, and a role could return an error with no rail
   name: live run `fcc4c120` did exactly that (`{"track":"err","code":10,"subject":"…"}`, no `kind`),
   the question rail (`env.kind === "question"`) never armed, the run died terminal at a live
   question — 193 316 tokens, 5 role launches.
6. **A workflow launches only through the `workflow` tool** from a pi session
   (`host.ts:967`). `/workflow` is a run picker, not a launcher. The `piewf` CLI is documented but
   absent from 5.1.1 (no `bin` in the package).
$END_CONSTRAINTS

$START_OPERATOR_CHANNEL
`checkpoint({name, prompt, context})` returns `"approved" | "rejected"` and nothing else
(`validation.ts:17-22`). Free-text answers cannot travel through it.

- `foreground: true` renders the pause as a modal `ui.select` that owns the whole window; typing is
  swallowed and `esc` re-draws the same two buttons (`host.ts:686`). The operator is trapped.
- `foreground: false` delivers the pause as an ordinary chat message
  (`Workflow <name> checkpoint <label>: … Respond with workflow_respond`, `host.ts:673-677`). The
  editor stays free.

Therefore: launch in background, carry the question's key in a file the workflow itself writes, and
let a registered pi tool record the operator's text. Treat `approved` as a barrier over a fact —
re-read the file and confirm the answer actually arrived before calling the agent again.
$END_OPERATOR_CHANNEL

$START_STEP_SHAPE
A step is one vertical slice: one input → one artifact → its own guardrail.

```
steps/<id>/
  <role>.md        role file — the FILENAME is the role name pi resolves
  order.tpl        the order; placeholders match prompt() keys exactly, both ways
  <core>.mjs       pure rules, exported, unit-tested
  <core>.test.mjs
```

- The guardrail decides, not the role: a step closes on a script's verdict.
- Check the staging path **before** promoting it to the output path.
- `prompt(template, values)` requires an exact bidirectional match — an unused key fails the launch.
$END_STEP_SHAPE

$START_SUCCESS
- `node --test` green.
- A live run reaches its artifact in a project **other than** this repository — that is the only
  test that catches cwd-anchoring and installation defects.
- Diagnosis comes from `journal.json`, never from what the launching model printed.
- **A guardrail's refusal is re-tested by REPLAYING it over the artifact the run saved, not by
  running again.** A guardrail is a pure function of the artifact and the map, both of which survive
  in `.agent/` and `.agent/staging/` — so `checkX(parse(saved), map)` answers "does this rule still
  refuse this artifact" deterministically, in seconds, for zero tokens. A live run answers a
  DIFFERENT question — whether the role converges within its budgets — and it answers it with one
  sample of a stochastic process, which is why it must not be used to decide what a rule does.
  Live cost of learning this: run `a3597dd3` died on 19 blockers; replaying the guardrail over its
  own `staging/frd.xml` after two rule fixes left ZERO, and no run was needed to establish that.
$END_SUCCESS
