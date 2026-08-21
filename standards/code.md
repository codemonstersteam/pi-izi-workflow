# Standard: writing code

$START_GOAL
Every rule lives in exactly one place, and every rule has a seam that turns red when it is broken.
$END_GOAL

$START_CONTEXT
Plain Node ESM, no dependencies and no `package.json` in the pipeline itself — only `node:test`,
`node:fs`, `node:path`, `node:child_process` and regular expressions. The one exception is `ext/`,
which imports `pi-extensible-workflows`: that is the host contract, not a pipeline dependency.

Four kinds of module, and they are not mixed:

| kind | may do | tested by |
|---|---|---|
| pure core | build values, decide, return `Result` | units, by the formula below |
| io pipe | read/write disk, translate to exit codes or JSON | a live run of the slice |
| head | parse argv, call the parts in order | nothing — it is the pipe of proven parts |
| workflow script | call host functions and roles in order — the pipeline's own program | a live run |

The workflow script (`workflows/izi.js`) is a module like the rest: same contracts, same rules. It
runs in a sandbox with no `import` and no `fs`, so everything it uses arrives from outside the file —
which makes its `EXTERNAL_DEPENDENCY` lines the most load-bearing ones in the repository, not the
most optional.
$END_CONTEXT

$START_CONTRACTS
**Zero-Context Survival is the measure.** An agent that downloads this one file — no chat history,
no neighbouring files, no repository — must be able to change it correctly. Everything below exists
for that reader, and nothing else decides how much comment is enough.

Every module carries `MODULE_CONTRACT`; every exported function carries `FUNCTION_CONTRACT`.

Как пишется ГАРДРЕЙЛ и его блокер — `standards/guardrail.md`. Как вести живой прогон и по каким
признакам искать ошибку В ТЕКСТЕ, а не в модели — `standards/live-run.md`. Коротко: блокер это
наряд на правку — код правила, элемент и ОБРАЗЕЦ строки, которую надо написать; блокер без выхода
запрещён.

```js
// MODULE_CONTRACT: <name> — one line, what it is
// Purpose:    the single decision hidden here
// io:         fs | proc | none — must match the imports
// EXTERNAL_DEPENDENCY: <what this file uses but cannot show> — where it comes from, and how its
//             absence reads at runtime
// Invariants: what holds regardless of input
// Interface:  exactly what the module exports

// FUNCTION_CONTRACT: <name> — one line
//   Input:        the arguments, and what each one is
//   Dependencies: what it calls — pure helpers by name, external things by EXTERNAL_DEPENDENCY
//   Antecedent:   what must be true of the input
//   Consequent:   success: … / failure: …
//   Purity:       pure | io
//   Interface:    signature
//   BUG_FIX_CONTEXT: <run id | issue> — what the previous shape did, why it broke, what this
//                 shape prevents. Only where a live defect bought the decision
```

`Interface:` lists exactly what is exported, and `io:` matches the imports. A contract that
disagrees with the code is a defect of the module, not of the comment.

**`EXTERNAL_DEPENDENCY` names what the file cannot show**: host functions injected as sandbox
globals, a config file read at startup, a role resolved by FILENAME, an environment variable, a
path anchored to someone else's cwd. Say where it comes from AND how its absence looks — a reader
who knows that `X is not defined` means "the extension is older than the workflow" fixes it in a
minute instead of hunting a typo.

**`BUG_FIX_CONTEXT` is written where the shape was bought by a defect**, and it carries the
evidence: a live run id, a `file:line` in the host, a failing test. Three lines — what was there,
what broke, what this prevents. A "fix" note with no defect behind it is decoration, and decoration
is how a comment starts lying.
$END_CONTRACTS

$START_CONSTRAINTS
1. **One rule, one place.** A limit declared in a guardrail is never restated in prose, an order or a
   role. Substitute it from the single source instead.
2. **Absence is a case, not an empty value.** No graph → `None`, not `[]`. `[]` is truthy in JS and
   "there is no graph" silently becomes "the graph is empty".
3. **Unknown is a rail, not a default.** Cannot decide → return `err(question)`. A silent default is
   indistinguishable from a fact.
4. **A tool failure is not data.** `git` did not answer ≠ "no changes". `catch { out = "" }` turns a
   fault into a fact.
5. **A negative verdict is data.** The reviewer that found a blocker succeeded.
6. **The artifact is written only after the decision to accept it.** Otherwise a broken file closes
   the step.
7. **A checkable antecedent is checked BY CODE.** If a factory can tell a bad input apart — a newline
   in a one-line field, an empty string, a number outside the range, a text carrying its own format's
   closing tag — it returns `err`, it does not write and hope. An antecedent that nothing checks is a
   comment, and a comment does not stop the caller. Live cost: run `46edab60`. `answerEntry` declared
   "no newlines: each field is one line", a batch of six questions arrived multi-line anyway, the
   file parsed back into a stump, and an operator who HAD answered was re-asked twice.
8. **Machines read English, the operator reads Russian.** Code, comments, contracts, order templates,
   host-function descriptions and test names are English — a model reads them. Russian stays where
   the operator reads: the `subject` of a question, a `blocked` diagnosis, `log()`, `docs/*.md`,
   `backlog.md`. **У файла роли язык означает ЗРЕЛОСТЬ, а не вкус автора**
   (решение оператора 21.08.2026; подробно — `standards/role.md`, ограничение 5). Машина пишет роль и
   её наряд по-русски; оператор, проработав шаг вручную, переводит их на английский — и перевод здесь
   отметка о ревизии, а не косметика: переводя, читают каждую строку и выбрасывают всё, что не
   инструкция. Русский файл роли читается как «через руки не проходил».
   Артефактов это не касается: LAW роли «артефакт говорит языком ЗАКАЗА» не тронут — русский
   `TASK.md` даёт русский BRD и при английской роли, а гардрейл языка — `core/lang.mjs`.
$END_CONSTRAINTS

$START_TESTS
```
N_units(pure module) = 1 happy path + Σ antecedent branches with a DISTINGUISHABLE consequent
```

- More than three units on one module means the module is under-decomposed: split it, do not write
  the fourth test.
- Heads, io pipes and adapters are not unit-tested — a live run of the slice proves them.
- A new rule needs a **seam**: a lint or test that turns red when the rule is broken. Prove the seam
  by reintroducing the defect, watching it go red, then restoring it.
- A test that no code change can turn red is a comment. Do not write it.
- **Touch a FORMAT — leave a round-trip unit on its hardest legal value.** A format is a file this
  repository both writes and reads (`.agent/answers.md`, the graph and part XML, `frd.xml`). The unit
  is `parse(write(x)) === x` where `x` carries what the format is hardest on: several lines, Cyrillic,
  angle brackets, a blank line. When the writer lives in an io module, its pure part comes out into a
  core module — otherwise the format is untestable by construction and its first proof is a live run.
  This is not a licence to sweep every existing format; it binds whoever changes one.
$END_TESTS

$START_FORBIDDEN
- Do not call the work done while tests are red. Red is a result — say it out loud.
- Do not edit a test to make it green. A red test reports a defect in the code until proven
  otherwise.
- Do not add dependencies to the pipeline.
- Do not duplicate a rule in prose when it already lives in code.
$END_FORBIDDEN

$START_SUCCESS
- `node --test` green as a whole, not per file.
- New module carries `MODULE_CONTRACT`; new exported function carries `FUNCTION_CONTRACT`.
- Everything the file uses but cannot show is an `EXTERNAL_DEPENDENCY` line; every decision bought
  by a live defect carries `BUG_FIX_CONTEXT` with its evidence.
- The new rule's seam was verified by reintroducing the defect.
$END_SUCCESS
