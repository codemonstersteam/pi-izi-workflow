# izi-pi — how to work here

$START_GOAL
Turn a human's raw requirement into a plan they accept, where every decision on the way left a trace
a machine can check. Nine steps exist today: `task → brd → survey-plan → scope → graph → intake →
weight → ripple → design`. The rest is `docs/concept.md`.
$END_GOAL

$START_CONTEXT
The pipeline runs on `pi-extensible-workflows` — a pi extension for deterministic multi-agent runs.

- `workflows/izi.js` — the whole program: two rails, ~95 lines, no step manifest, no config file.
- `ext/index.mjs` — the extension: host functions (`readText`, `answers`, `checkTask`, `checkBrd`,
  `promote`, `setPending`, `clearPending`, `design`) plus the pi tool `izi_answer`. All disk work
  lives here — the sandbox has no `fs`.
- `steps/<id>/` — one vertical slice: role, order template, pure core, its test.
- `core/` — rules shared by several slices. `bin/answer.mjs` — the operator's fallback channel.

Read before touching anything: `standards/workflow.md` (the host's real constraints, with
file:line evidence), `standards/code.md` (module and test contracts), `standards/role.md` (how a
role is written).
$END_CONTEXT

$START_RUN
**THE RUNBOOK IS A FILE, AND IT IS NOT IN THIS REPOSITORY — READ IT BEFORE PREPARING ANY LIVE RUN:**
`~/IdeaProjects/codemonstersdev/sandbox/pi-runbox.md`. It carries what only live runs taught: the
MASTER form (`sandbox/quarkus-rest-json-app-v2-t1-3`, never run in — copied to `sandbox/runbox/` and
run there),
the three preconditions before every launch (restart pi; no `*.md` under
`~/.pi/agent/pi-extensible-workflows/roles/`, which silently OVERRIDES this repo's role; start `pi`
FROM the run directory), why herdr panes are off-limits until the transport is fixed, and the log
this form is expected to print. Do not reconstruct any of that from memory or from this file.

```bash
node --test                                 # the whole line, before any live run
node bin/install.mjs --to=<master form>     # copies workflows/ steps/ core/ bin/ into a project
cp -R <master form> ~/IdeaProjects/codemonstersdev/sandbox/runbox/ && cd <runbox>/<form> && pi   # then /izi
```

`pi install ./ext` is NOT part of this: the extension is wired BY PATH in
`~/.pi/agent/settings.json` (`packages`), so an edit under `ext/` is live after a session restart —
and only after one.

The operator answers the role's question **in the chat** — the run is launched with
`foreground: false`, so the pause arrives as a message and the editor stays free.
Diagnosis lives on disk: `~/.pi/workflows/projects/<slug>/sessions/<sid>/runs/<runId>/journal.json`.
Never trust what the launching model printed.
$END_RUN

$START_CONSTRAINTS
1. **The guardrail decides, not the role.** A step closes on a script's verdict; a role never
   certifies itself.
2. **Check the staging path before promoting it.** An artifact written on the error rail must not
   close a step.
3. **A number in `fit:` must have a source** — the task or an operator's answer value. Anything else
   is `invented-default`.
4. **The question key is copied by the machine**, not retyped by a human or recalled by a model:
   the workflow writes `.agent/pending.json`, `izi_answer` reads the questions and their NUMBERS from
   there and answers by number.
5. **Widening the SHAPE of a value is a change to every consumer of it.** One line → many, one → a
   list, required → optional: walk the consumers, read their antecedents, and name them in the task.
   A widening with no consumer named is unfinished work — that is the price of run `46edab60`, where a
   question grew into a batch and the file format that carried it stayed two lines long.
6. **Paths resolve against the run's cwd** (`context.run.cwd`), never against this repository.
   Proven by a live defect: the installed project read this repo's `TASK.md` for three redelegations.
7. **Verify in a project other than this one.** Everything green here can still be broken there.
$END_CONSTRAINTS

$START_FORBIDDEN
- Do not declare work done with red tests. Red is a result — report it.
- Do not edit a test to make it green.
- Do not restate a rule in prose when it already lives in code — substitute it from one place.
- Do not add dependencies to the pipeline; `ext/` may depend only on the host package.
- Do not write into `.agent/` by hand — it is run state.
- Do not generalise for steps that do not exist yet.
$END_FORBIDDEN

$START_SUCCESS
- `node --test` green as a whole.
- A live run in an installed project reaches `.agent/brd.md`.
- Every new rule has a seam, and the seam was proven by reintroducing the defect.
$END_SUCCESS
