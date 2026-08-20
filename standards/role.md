# Standard: writing a role

$START_GOAL
A role file is an API contract for one judgement: given an order, return one validated result.
Everything the role may not decide is decided outside it.
$END_GOAL

$START_CONTEXT
A role is `steps/<step>/<name>.md`. **The filename is the role name** pi resolves — `gilb.md` is
called as `agent(order, { role: "gilb" })`; a file named `role.md` installs as the role "role".
The extension exposes the directory through `roleDirectories`. Frontmatter is YAML; the body is
appended to pi's system prompt unless `overrideSystemPrompt: true`.

```yaml
---
description: Requirements front door — raw business request into a measurable BRD
model: openrouter/qwen/qwen3.6-27b
thinking: low
tools: [read, write]
---
```

Supported keys: `description`, `model`, `thinking`, `tools`, `overrideSystemPrompt`, `contextFiles`,
`disabledAgentResources`.

**`model` may name a provider id OR an ALIAS, and the difference decides who owns the choice.** A
value with no slash is resolved against `modelAliases` of the workflow settings
(`pi-extensible-workflows/packages/core/src/utils.ts::modelAliasName`), whose three names are
`routing`, `execution`, `judgment`. A provider id — what every role here carries today — pins the
repository to one vendor's one model, and the machine's settings then have no say at all.

**РЕШЕНО 21.08.2026 оператором: роли этого репозитория несут АЛИАС, а не идентификатор.** Кто
судит — `judgment` (критик требования, критик плана), кто пишет артефакт — `execution` (все
остальные). Третий алиас, `routing`, ОСТАВЛЕН ПУСТЫМ намеренно: маршрут находки (план · дизайн ·
требование) разводит скрипт `planRoute`, и роли с этим смыслом в конвейере нет — модель здесь не
нужна. Под обоими занятыми алиасами сегодня лежит один и тот же `qwen3.6-27b`; смысл перевода в том, что
модель кругов починки 4-5 поднимается тиром выше ОДНОЙ строкой в машинных настройках, а не правкой
семи файлов ролей (`docs/plan-design.md` §6). Шов держит это за язык: роль с идентификатором в
`model:` краснит тест.

Ловушка, которая и заставила решать, стоила двух прогонов 2026-08-13: с идентификатором во
frontmatter правка `modelAliases` не делает НИЧЕГО, молча — and the status line shows the CHAT model, so the screen
does not contradict the assumption either. The same silence follows an alias pointing at a model the
session does not have: execution falls back with no message. **The only honest check is the run's own
`state.json`** (`"model":…`) against `snapshot.json`'s `models` — both are on disk after every run. **There is no per-path permission map in pi** — "writes only to staging" is
discipline plus the guardrail, not a host-enforced boundary. Say so in the role; do not pretend.
$END_CONTEXT

$START_LAYERS
Use paired tags. Each layer answers one question and nothing else.

| tag | content |
|---|---|
| `$START_ROLE` | who you are, in two sentences; what you never do |
| `$START_LAW` | rules that hold on every run, whatever the order says |
| `$START_INPUT` | what arrives in the order — and that nothing else exists |
| `$START_STRATEGY` | numbered steps, each with a verb and a stop condition |
| `$START_FORBIDDEN` | explicit prohibitions, each with the machine check that catches it |
| `$START_OUTPUT_FORMAT` | the artifact's shape and the `outputSchema` fields |
| `$START_EXAMPLE` | one worked example, from a different domain |
$END_LAYERS

$START_CONSTRAINTS
1. **State the rule once.** A limit that lives in the guardrail is not restated in the role — two
   copies drift, and the machine copy is the one that runs.
2. **Every prohibition names its check.** "Do not invent a number — machine-checked as
   `[invented-default]`" beats "be careful with numbers".
3. **The example uses a different domain from any real input.** An example indistinguishable from
   live input stops being an example: the role returns the prepared answer instead of reading the
   order. This has happened in a live run.
4. **The order carries the data; the role does not go looking for files.** If the role has `read`,
   say explicitly what it may read and why — otherwise it will browse.
5. **The artifact speaks the order's language**, not the role's. Write the role in English and say
   this out loud; a Russian request must yield a Russian artifact.
6. **The role never self-certifies.** "Done" is the guardrail's exit code. A role that found a
   blocker succeeded — a negative verdict is data, not an error.
7. **A line of a role is an INSTRUCTION, not an account.** What to do and in what form — nothing
   else. No run ids, no cost, no history of why the rule appeared, no argument for it. Evidence
   belongs in three other places, each of which the role never reads: `docs/` for the rule's reason,
   a `BUG_FIX_CONTEXT` comment for the code that judges it, `tasks/` for the work that bought it.
   A role is executed by a small model, and every line that is not an instruction competes with the
   ones that are.
8. **The form is shown by EXAMPLE, and the instruction is unambiguous.** `Renewed(loanId,dueOn)`
   teaches more than a paragraph about naming. Two readings of one line is a defect of the line: if
   a sentence can be obeyed in two ways, the model will pick the wrong one, and the guardrail will
   pay for it a redelegation at a time. A sentence that says the same thing as the line above it is
   deleted, not kept for emphasis.
$END_CONSTRAINTS

$START_OUTPUT_FORMAT
The role returns through `outputSchema` — the host validates it, so the role only has to describe
the fields:

```
track: "ok" | "err"
ok  → artifact (path), plus the numbers the next step consumes
err → kind: "question" | "invalid" | "escalate", subject, evidence, answer_cmd
```

`subject` is one closed question with a recommended answer and alternatives, so the operator can
reply in one word. The key inside `answer_cmd` must equal `subject` verbatim — it is the only link
between a question and its answer.
$END_OUTPUT_FORMAT

$START_SUCCESS
- Every prohibition in the role is enforced by a script somewhere, or it is decoration.
- The role's own test asserts the rules it claims (e.g. `steps/brd/brd.test.mjs` greps the role for
  `invented-default`).
- A live run produces the artifact without the role explaining itself in prose.
$END_SUCCESS

$START_EXAMPLE
Prompting model to copy — `/Users/mac/IdeaProjects/turboai/LESSON_2/.kilo/agents/grok_searcher.md`:
frontmatter with tool permissions, a numbered strategy where every step names the tool and its
argument, then a short prohibition list ("Bash denied. Do not read whole files. Only chunks.").
Short, imperative, checkable — no persona, no encouragement.
$END_EXAMPLE
