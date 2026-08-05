# План: перенос шагов `task` и `brd` из izi-flow-v2 в pi-workflow

## 0. Что уже проверено на живом стенде (не гипотеза)

- `pi install npm:pi-extensible-workflows` → v5.1.1, стоит глобально (`~/.pi/agent/npm`).
- Запуск: **только через tool `workflow` внутри сессии pi**. CLI `piewf` (`run`, `doctor`, `bundle`)
  в опубликованной 5.1.1 **отсутствует** — в пакете нет `bin`. Значит headless-раннер строим сами.
- `workflows/smoke.js` — `shell()` + `agent()` → вернул `{"exitCode":0,"stdout":"hello-from-shell","say":"PONG"}`.
- `workflows/smoke2b.js` — `outputSchema` работает: агент вернул валидированный объект `{word,letters:8}`.
- `workflows/smoke2a.js` — роль подхватывается из **глобального** каталога
  `~/.pi/agent/pi-extensible-workflows/roles/<name>.md`. Роль из **проектного**
  `.pi/pi-extensible-workflows/roles/` не подхватилась (запуск не создал run) — проект не «trusted»;
  `--approve` не помог.
- Результат прогона всегда лежит на диске:
  `~/.pi/workflows/projects/<slug>-<hash>/sessions/<sid>/runs/<rid>/{state,result,journal,summary}.json`.
  Это надёжный канал чтения результата — печать модели-запускатора ненадёжна (`pi -p` дважды повис,
  хотя сам прогон был `completed`).
- `checkpoint()` в headless-режиме не применяем (документация прямо говорит: headless-запуск
  воркфлоу с чекпоинтами не исполняет).

## 0.1 Решения оператора (акцепт плана)

- Конверт роли — **`outputSchema`**, а не текстовый IZI/1: форму валидирует хост,
  `core/envelope.mjs` и его парсер не переносим. Поля конверта сохранены.
- Модели — **как в `pipeline.json`**: все три тира `openrouter/qwen/qwen3.6-27b`
  (модель подтверждена в инвентаре pi).

## 1. Что переносим

Два первых шага `pipeline.json`:

| шаг | род | вход | выход | гардрейл |
|---|---|---|---|---|
| `task` | human | оператор | `TASK.md` | `steps/task/validate-task.mjs` (≤300 строк, непуст) |
| `brd` | role `gilb` | `TASK.md` + `.agent/answers.md` | `.agent/brd.md` | `steps/brd/validate-brd.mjs` → ядро `brd.mjs` |

Несущие контракты, которые обязаны выжить дословно:

1. **Квитанция закрывает шаг**, а не наличие `out` (`.agent/receipts/<id>.json`).
2. **Промоут staging→out только на зелёном чеке**; чек исполняется по staging-пути ДО промоута.
3. **Число в `fit` обязано иметь источник** (`TASK.md` или ЗНАЧЕНИЕ ответа оператора, не текст вопроса).
4. **Улика (`advice`) не роняет приёмку** — печатается, уходит оператору.
5. **Ключ `--q="<subject>"` дословно равен `subject`** — единственная связь вопрос→ответ.
6. **Красный чек на `task` уходит оператору** (код 10), а не в пере-делегацию.
7. **Язык артефакта = язык наряда** (LAW 4 роли).

## 2. Отображение izi-flow → pi-extensible-workflows

| izi-flow-v2 | izi-pi-v2 | почему |
|---|---|---|
| `izi.md` роутер + `bin/next-step.mjs` + `bin/accept.mjs` | `workflows/izi.js` — детерминированный скрипт DSL | порядок и ветвление становятся кодом, а не суждением модели |
| конверт `IZI/1` (текст) + `core/envelope.mjs` + парсер | `outputSchema` у `agent()` | хост валидирует форму сам; парсер и его тесты уходят |
| `pipeline.json.loops` | `for`-цикл в скрипте, число приходит из `args` | воркфлоу-JS не имеет fs — конфиг подаёт раннер |
| `pipeline.json.models` (тиры) | `modelAliases` в `~/.pi/agent/pi-extensible-workflows/settings.json` + `model:` во фронтматтере роли | тир остаётся объявленным один раз |
| `steps/brd/role.md` (frontmatter permission-карта) | `roles/gilb.md` (pi-формат: `model`, `thinking`, `tools`) | пер-путевых прав в pi нет — держат те же два шва: квитанция и чек по staging (izi-flow это уже признаёт вслух) |
| `bin/compose.mjs` + `order.tpl` | `prompt(tpl, {...})` в скрипте, шаблон приходит через `args` | плейсхолдеры резолвит хост, неразрешённый роняет сборку |
| `bin/stall-watch.mjs` | `agent(..., { timeoutMs, retries })` | сторож встроен в рантайм |
| `bin/answer.mjs` + `.agent/answers.md` | **остаётся как есть** | вопрос оператору = терминальный возврат прогона; ответ пишется на диск, прогон перезапускается |
| `bin/run-script.mjs` | `shell()` | |

**Цикл вопроса оператору (без `checkpoint`):** прогон, упёршийся в `err(question)`, завершается
терминальным значением с `subject`/`evidence`/`answer_cmd`. Оператор исполняет `node bin/answer.mjs
--q="…" --text="…"`, перезапускает — накопленные ответы приезжают в наряд. Это ровно та механика,
что уже есть в izi-flow, и она headless-совместима.

## 3. Целевая раскладка репозитория

```
izi-pi-v2/
  TASK.md                      вход конвейера (кладёт оператор)
  pipeline.json                порядок, loops, тиры моделей — данные
  workflows/izi.js             скрипт воркфлоу: шаги task → brd
  roles/gilb.md                роль шага brd (pi-формат)
  steps/task/validate-task.mjs гардрейл входа (порт 1:1)
  steps/brd/brd.mjs            чистое ядро: newFit · newRequirement · newSubjects · adviceFor · newBrd
  steps/brd/brd.test.mjs       порт тестов
  steps/brd/validate-brd.mjs   io-гардрейл
  steps/brd/order.tpl          наряд роли
  core/answers.mjs (+test)     разбор .agent/answers.md
  bin/answer.mjs               накопитель ответов оператора
  bin/install.mjs              роль → ~/.pi/agent/.../roles/, тиры → settings.json
  bin/run.mjs                  раннер: запустить прогон и прочитать result.json со стенда
  .agent/                      состояние прогона: staging/ receipts/ answers.md decisions.log
  standards/                   protocol.md (две рельсы) + code.md — переносим как есть
```

## 4. Скелет `workflows/izi.js`

```js
// args = { pipeline, orderTpl }  — подаёт bin/run.mjs
log("izi: start");

// ── шаг task ─────────────────────────────────────────────
const t = await shell("node steps/task/validate-task.mjs TASK.md");
if (t.exitCode !== 0) return { step: "task", track: "err", kind: "blocked",
                               subject: t.stderr.trim(), code: 10 };
await shell("node bin/receipt.mjs --step=task");

// ── шаг brd ──────────────────────────────────────────────
const TASK = (await shell("cat TASK.md")).stdout;
let feedback = "";
for (let i = 0; i < args.pipeline.loops.brd; i++) {
  const ANSWERS = (await shell("cat .agent/answers.md || true")).stdout || "(no operator answers yet)";
  const order = prompt(args.orderTpl, { TASK, ANSWERS, feedback });
  const env = await agent(order, { role: "gilb", outputSchema: ENVELOPE, timeoutMs: 180000 });

  if (env.track === "err") return { step: "brd", ...env, code: 10 };   // вопрос оператору

  const check = await shell("node steps/brd/validate-brd.mjs .agent/staging/brd.md" +
                            " --task=TASK.md --answers=.agent/answers.md");
  if (check.exitCode === 0) {
    await shell("node bin/promote.mjs --step=brd");   // staging→out, потом квитанция
    return { step: "brd", track: "ok", artifact: ".agent/brd.md", advice: check.stdout, code: 0 };
  }
  feedback = check.stderr;                            // пере-делегация с уликами
}
return { step: "brd", track: "err", kind: "escalate", subject: "повторы исчерпаны", code: 10 };
```

`ENVELOPE` — JSON Schema, повторяющая конверт: `track ∈ {ok,err}`, при `ok` — `artifact`,
`requirements`, `questions`; при `err` — `kind ∈ {blocked,invalid,question,escalate,crashed}`,
`subject`, `evidence`, `answer_cmd`.

## 5. Порядок работ (субагенты, sonnet)

- **S1 — ядро и гардрейлы.** Порт `steps/task/validate-task.mjs`, `steps/brd/{brd.mjs,validate-brd.mjs,brd.test.mjs,order.tpl}`,
  `core/answers.mjs(+test)`, `standards/`. Критерий: `node --test` зелёный целиком; `MODULE_CONTRACT`/`FUNCTION_CONTRACT`
  на месте; ни одной новой зависимости.
- **S2 — воркфлоу и роль.** `workflows/izi.js`, схема конверта, `roles/gilb.md` (перенос LAW/STRATEGY/FORBIDDEN/EXAMPLE
  без permission-карты), `pipeline.json`. Критерий: скрипт проходит preflight (запуск с фиктивным `TASK.md`
  доходит до первого агента).
- **S3 — обвязка прогона.** `bin/{install,run,answer,receipt,promote}.mjs` + `.agent/` контракт + тесты на них.
  Критерий: `node bin/run.mjs` возвращает JSON результата прогона, читая `result.json` со стенда,
  а не печать модели.
- **S4 — живой прогон и приёмка.** Фикстура `TASK.md` без числа → ждём `err(question)`; `bin/answer.mjs`;
  повторный прогон → `.agent/brd.md` + квитанция + advice. Негатив: `TASK.md` >300 строк → шаг 1 красный,
  квитанции нет. Плюс `README.md`/`CLAUDE.md` репозитория.

S1 и S2 идут параллельно, S3 после S2, S4 последним.

## 6. Риски, объявленные вслух

1. **Проектные роли не подхватились** — работаем через глобальный каталог + `bin/install.mjs`.
   Задача S3: перепроверить проектный путь после установления trust проекта.
2. **Запуск опосредован моделью** (tool `workflow` вызывает агент-запускатор). `bin/run.mjs` снимает риск,
   читая результат с диска; повисание `pi -p` при этом уже наблюдалось при живом `completed` прогоне.
3. **Прав «писать только в staging» в pi нет** — держат квитанция и чек по staging-пути. Тот же долг,
   что и в izi-flow, переносим осознанно, а не молча.
4. Репозиторий не под git — первым делом `git init`.
