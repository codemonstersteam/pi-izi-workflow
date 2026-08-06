# izi-pi — how to work here

$START_GOAL
Turn a human's raw requirement into a plan they accept, where every decision on the way left a trace
a machine can check. Two steps exist today: `task` → `brd`. The rest is `docs/concept.md`.
$END_GOAL

$START_CONTEXT
The pipeline runs on `pi-extensible-workflows` — a pi extension for deterministic multi-agent runs.

- `workflows/izi.js` — the whole program: two rails, ~95 lines, no step manifest, no config file.
- `ext/index.mjs` — the extension: host functions (`readText`, `answers`, `checkTask`, `checkBrd`,
  `promote`, `setPending`, `clearPending`) plus the pi tool `izi_answer`. All disk work lives here —
  the sandbox has no `fs`.
- `steps/<id>/` — one vertical slice: role, order template, pure core, its test.
- `core/` — rules shared by several slices. `bin/answer.mjs` — the operator's fallback channel.

Read before touching anything: `standards/workflow.md` (the host's real constraints, with
file:line evidence), `standards/code.md` (module and test contracts), `standards/role.md` (how a
role is written).
$END_CONTEXT

$START_RUN
```bash
cd ext && npm install && pi install ./      # once per machine: functions, role, /izi template
node bin/install.mjs --to=<project>         # copies workflows/ steps/ core/ bin/ into a project
cd <project> && pi                          # then type /izi
node --test                                 # the whole line, before any live run
```

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
   the workflow writes `.agent/pending.json`, `izi_answer` reads the key from there.
5. **Paths resolve against the run's cwd** (`context.run.cwd`), never against this repository.
   Proven by a live defect: the installed project read this repo's `TASK.md` for three redelegations.
6. **Verify in a project other than this one.** Everything green here can still be broken there.
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
