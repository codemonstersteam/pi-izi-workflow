# Skill: как писать TypeScript в этом репозитории

Код корректен по построению — не потому что тесты зелёные, а потому что неверное
состояние невозможно создать. Каждый модуль — одна задача. Каждый тип — value object.
Каждая ошибка — Result. Каждый шов — исполняемый.

Основы: [Модульность](https://codemonsters.team/blog/2025/12/15/program-modules/) ·
[Правильность](https://codemonsters.team/blog/2025/12/30/program-correctness/) ·
[Компонентные тесты](https://codemonsters.team/blog/2026/04/25/testing-mythology-component-tests/)

---

## 1. Модуль — функция, решающая одну задачу

**Модуль — это не файл, а ответственность.**

```typescript
// ext/run.ts — ГОЛОВНОЙ МОДУЛЬ: три шага последовательно
export async function run(input: { key: string }, ctx: FunctionContext) {
  const plan = await writePlan(input, ctx);
  if (!plan.ok) return toError(plan.error);

  const approved = await checkPlan(plan.value, input, ctx);
  if (!approved.ok) return toError(approved.error);

  return await executePlan(approved.value, input, ctx);
}
```

| правило | проверка |
|---|---|
| один вход (Record параметров) | сигнатура читается одной строкой |
| один выход (`Result<T>` или терминал) | нет void + throw |
| одна задача — заголовок говорит ЧТО | первая строка = функциональное назначение |
| вызывает только модули уровнем ниже | нет циклов, иерархия — дерево |
| > 3 юнит-теста = под-decompose | дробить модуль, не писать четвёртый тест |

Запрещено:
- функция с 4+ параметрами-примитивами → собрать в Record
- функция, возвращающая null/undefined → Result
- модуль, знающий о соседях своего уровня → только вниз
- god function с 8 ветками → дробить по задачам

---

## 2. Value objects — корректные по построению

Невалидное значение невозможно создать. Конструктор проверяет и отказывает.

```typescript
const VALID_PHASES = ["plan", "critic", "questions", "confirm", "execute", "done"] as const;
export type PhaseName = (typeof VALID_PHASES)[number];

export class Phase {
  private constructor(readonly name: PhaseName) {}

  static of(raw: string): Result<Phase> {
    const name = raw.trim().toLowerCase() as PhaseName;
    return VALID_PHASES.includes(name)
      ? ok(new Phase(name))
      : fail("state", `неизвестная фаза «${raw}» — допустимо: ${VALID_PHASES.join(", ")}`)
  }

  static fresh(): Phase { return new Phase("plan") }
  get isTerminal(): boolean { return this.name === "done" }
}
```

| правило | пример |
|---|---|
| private constructor | `new Phase("banana")` → компилятор откажет |
| статическая фабрика → Result | `Phase.of(raw)` → ok или fail |
| инварианты проверяются В конструкторе | пустая строка → отказ на входе |
| immutable — только readonly | после создания не меняется |
| пара Raw → Validated | RawConfig → Config только через NewConfig |

---

## 3. Result<T> — единственная форма ошибки

Никаких throw, null, undefined для ожидаемых отказов.

```typescript
export type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError }
export interface DomainError { kind: ErrorKind; detail: string }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const fail = <T = never>(kind: ErrorKind, detail: string): Result<T> =>
  ({ ok: false, error: { kind, detail } })
```

| правило | пример |
|---|---|
| kind — то, по чему ветвится вызывающий | "state", "no-task", "escalate", "blocked" |
| detail — то, что читает человек | «TASK.md пуст или отсутствует» |
| негативный вердикт — значение, не ошибка | verdict: "REJECT" — легальный исход |
| обрыв — не круг | `if (err) continue` без round++ |
| escalate — именованный конец | fail("escalate", "не чинится за 3 круга") |

ROP — каждый шаг возвращает Result, вызывающий ветвится одним if:

```typescript
const plan = await writePlan(input, ctx);
if (!plan.ok) return toError(plan.error);  // отказ летит вверх нетронутым
```

---

## 4. Воркфлоу — ROP-пайп

Воркфлоу не имеет своей логики. Это труба из доказанных частей.

```typescript
// ext/run.ts — HEAD (не юнит-тестируется)
run(input, ctx) → writePlan → checkPlan → executePlan
```

Каждый шаг — модуль с лупом починки:

```typescript
// steps/plan/plan.ts — planner пишет, судья проверяет
async function writePlan(input, ctx): Promise<Result<string>> {
  for (let round = 1; round <= LOOPS; round++) {
    const answer = await ctx.agent(order, { role: "planner" });
    if (answer?.track === "err" && answer.kind === "blocked") {
      // blocked → вопрос оператору, круг НЕ тратится
      const resolved = await askWithRetry([answer.subject], ctx);
      draft += answers;
      continue;
    }
    if (answer?.track === "err") continue;  // обрыв → круг НЕ тратится

    const blockers = judgeForm(draft, task, cwd);
    if (blockers.length === 0) return ok(draft);   // зелёный

    draft = withFeedback(draft, blockers);          // красный → FEEDBACK → следующий круг
  }
  return fail("escalate", `план не прошёл за ${LOOPS} круга`);
}
```

Виды модулей и их тестирование:

| вид | что делает | чем доказывается |
|---|---|---|
| pure core (judge, extract, apply) | строит значения, возвращает Result | юниты по формуле |
| io pipe (readAt, writeAt, git) | читает/пишет диск | живой прогон |
| head (run.ts) | зовёт части по порядку | компонентный тест |
| workflow script (solo.md) | одна строка | живой прогон |

---

## 5. Формула тестов

### Юнит-тесты (pure core)

> **N = 1 (happy) + Σ (различимых ветвей антецедента)**

Ветвь, дающая тот же консеквент — НЕ отдельный тест.

```typescript
// judgeForm: ветви = пустой план, нет раздела, цитата не подстрока,
//             путь не существует, источник пуст = 5 различимых → 6 тестов
```

Анти-правила:
- тест, который никакой код не может сделать красным — комментарий, не тест
- > 3 юнитов на модуль = дробить модуль
- не переснимай ответ чтобы тест позеленел

### Компонентные тесты (head, шаги)

> **N = 1 (штатное) + Σ (различимых ветвей адаптера)**

Адаптер — граница с тем, чем модуль не управляет: LLM, оператор, файловая система, git.

```typescript
// tests/run.test.ts — 5 сценариев:
// 1. happy: план → критик → вопросы → да → dev → судьи → done
// 2. красный план → круг → зелёный
// 3. критик REJECT → repairPlan → APPROVE → done
// 4. оператор «нет» → repairPlan → «да» → done
// 5. сверка: РЕШЕНО без Ф-строки → planner добавляет
```

Шов формулы — исполняемый: последний тест собирает классы отказа из кода
и сверяет с SCENARIOS в обе стороны.

---

## 6. Самовалidация

| проверка | шов |
|---|---|
| Все функции возвращают Result | grep функций с Promise<T> без Result |
| Value objects через фабрики | grep new вне фабрики |
| Нет throw для ожидаемых отказов | grep throw в шагах |
| ≤ 3 юнитов на pure core | счётчик тестов |
| Head не юнит-тестируется | run.ts без run.test.ts |
| Формула шов краснеет | тест сверяет код ↔ SCENARIOS |
| Модули зовут только вниз | grep import от шага к шагу |
| Инварианты в конструкторе | value object невозможно создать невалидным |

Новое правило требует шов — линт или тест, краснеющий при нарушении.

---

## 7. Принципы

| принцип | применение |
|---|---|
| Одно правило — одно место | лимит в судье не дублируется в наряде |
| Отсутствие — случай, не пустое значение | нет графа → None, не [] |
| Unknown — рельса, не дефолт | не могу решить → err("question") |
| Отказ инструмента — не данные | git не ответил ≠ «нет изменений» |
| Негативный вердикт — данные | критик нашёл блокер — успех |
| Проверяемый антецедент проверяется кодом | непроверяемый — комментарий |
| Машина читает английский, оператор русский | спека, роли, наряды, фидбек и блокеры — английский; карточки, вопросы оператору и логи — русский |
| Защищённое программирование | проверка данных до использования |
| Отказ обрабатывается там где отвечают | не там где заметили |
