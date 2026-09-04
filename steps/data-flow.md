# Data flow воркфлоу solo: план → проверка → разработка

Три шага, каждая папка — модуль со своей ролью, нарядом, судьёй. Полоса — inline-скрипт
команды `/solo` (`ext/prompts/solo.md`), запускается в фоне (`foreground: false`): чат-модель
= кнопка старта + реле ответов оператора через `solo_answer`.

## Полоса целиком

```
TASK.md [+ PROMPT.md] в корне проекта
  │
  │  /solo → чат-модель: ОДИН tool call workflow(solo, foreground:false) — кнопка
  ▼
stepStart: маркер .agent/progress.json — есть? → resume (фаза с маркера); нет → fresh
  ▼
┌─ steps/plan ────────────────────────────────────────────────────────────────────┐
│  роль planner (read/bash/write, thinking high)                                  │
│  наряд: PROMPT-спека ДОСЛОВНО + TASK.md + свой черновик как PREVIOUS на починке │
│  выход: .agent/staging/PLAN~draft.md                                            │
│  судья judge.ts: 6 разделов (EN) · цитаты — подстроки TASK · пути/new+sample    │
│  красное → круг починки (FEEDBACK = блокеры судьи)                              │
│  зелёное → promote → .agent/PLAN.md                                             │
└─────────────────────────────────────────────────────────────────────────────────┘
  ▼
┌─ steps/plan-check ──────────────────────────────────────────────────────────────┐
│  фаза critic:                                                                   │
│    роль critic (read)                                                           │
│    наряд: PLAN~draft.md + TASK.md + чек-лист 6 разделов                          │
│    выход: конверт {verdict:"APPROVE"} или {verdict:"REJECT", blockers, questions}│
│    REJECT → круг plan с блокерами; questions → ask-рельса                       │
│                                                                                 │
│  фаза questions:                                                                │
│    вопросы раздела 6 плана → .agent/pending.json → В ЧАТ (followUp)             │
│    оператор отвечает сообщением → чат-модель зовёт solo_answer → answers.md     │
│    ответы ВПИСЫВАЮТСЯ В ПЛАН (questions.ts applyAnswers: «→ RESOLVED: …»)       │
│                                                                                 │
│  фаза confirm:                                                                  │
│    карточка-синтез (card.ts) → say → log() в чат                                │
│    ask: «Запускаем execute? да / нет: причина»                                  │
│    «да» → фаза execute; «нет: …» → причина в круг plan                          │
└─────────────────────────────────────────────────────────────────────────────────┘
  ▼
┌─ steps/execute ─────────────────────────────────────────────────────────────────┐
│  роль dev (read/bash/edit/write, thinking high)                                 │
│  наряд: .agent/PLAN.md (с «→ RESOLVED») + три правила                          │
│  работает по строкам C: итерация = строка C = коммит                            │
│  выход: коммиты в git проекта (от solveStart-HEAD)                              │
│  судьи judges.ts:                                                               │
│    (a) каждая строка C ↔ коммит (git log от solveStart)                         │
│    (b) существующие тест-файлы только расширены (lostLines: токен-проверка)      │
│    (c) гарантии §5 аддитивны (дифф не удаляет строки гарантированных файлов)    │
│  зелёное → done-карточка (C↔коммиты таблицей) → say → done                      │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Контракты модулей

### ext/engine.ts — станционный движок

| контракт | значение |
|---|---|
| вход | `soloStart({key}, ctx)` — cwd из контекста хоста; `soloNext({state})` — инструкция; `soloFold({state, event})` — ответ |
| выход | `{do: "role"|"ask"|"say"|"done"|"err", …}` — глагол полосы |
| инвариант | круг тратится только на красный вердикт СВОЕЙ фазы; обрыв не тратит; done говорит только next |
| переходы | `plan → critic → questions → confirm → execute → done`; маркер `.agent/progress.json` на каждом переходе |

### ext/ask.ts — вопрос оператору в чат

| контракт | значение |
|---|---|
| вход | `ask.run({items})` — массив вопросов |
| канал | followUp в чат (pi.sendMessage) + question.txt (файловый фолбэк) |
| ответ | answers.md (exchange-грамматика answers.ts) — пишут solo_answer ИЛИ answer.txt-поллинг |
| инвариант | пустой ответ → переспрос (не отвержение); таймаут 30 мин → переспрос |

### ext/answer-tool.ts — инструмент solo_answer

| контракт | значение |
|---|---|
| формат | `parameters: Type.Object({exchange: Type.String})` + `execute(toolCallId, params, …)` — pi.registerTool |
| вход | exchange: XML-блок `<exchange><question_N>…</question_N><answer_N>…</answer_N></exchange>` |
| сверка | по НОМЕРАМ против `.agent/pending.json`; частичный вызов отвергается |
| выход | таблица «N. вопрос → ответ» для показа оператору |

### steps/plan/plan.step.ts — фаза «план»

| контракт | значение |
|---|---|
| next(state) | `{do:"role", role:"planner", text, staging}` — наряд с спекой, TASK, PREVIOUS, FEEDBACK |
| fold(state, it, env) | судья judge.ts: зелёный → phase 'critic'; красный → round+1, blockers=FEEDBACK |

### steps/plan-check/plan-check.step.ts — фазы «критик/вопросы/подтверждение»

| контракт | значение |
|---|---|
| next(critic) | наряд критику (план + TASK + чек-лист) |
| fold(APPROVE) | promote staging→PLAN.md; extractQuestions; вопросы → state.question |
| next(questions) | (движок ask-рельсой) — state.question.items в чат |
| fold(ask answers) | applyAnswers(plan, answers) — «→ RESOLVED» в план; phase 'confirm' |
| next(confirm) | say карточка → ask «да/нет» |
| fold(confirm) | «да» → phase 'execute' (solveStart=HEAD); «нет: …» → причина в план |

### steps/execute/execute.step.ts — фаза «разработка»

| контракт | значение |
|---|---|
| next(state) | наряд dev: план + три правила (итерация=Ф=коммит; §4/§5; тесты не переписывать) |
| fold(state, it, env) | judgeSolve: (a)(b)(c); зелёный → doneCard; красный → round+1, blockers |

## Что уезжает дальше

После done — план и код в самом проекте; конвейер ничего больше не пишет. Оператор
проверяет тесты и коммиты своими руками (итоговая карточка показывает таблицу Ф↔коммиты).
