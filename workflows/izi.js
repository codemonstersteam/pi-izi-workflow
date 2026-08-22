// MODULE_CONTRACT: workflows/izi.js — ГОЛОВА: линейная ROP-цепочка шагов. Своей логики нет.
// io:         none
// EXTERNAL_DEPENDENCY: песочница — agent, parallel, checkpoint, log, args; расширение — stepStart,
//             stepNext, stepFold. Их отсутствие читается как «X is not defined» и означает одно:
//             расширение старше полосы, ПЕРЕЗАПУСТИ pi (сессия читает ext один раз, этот файл —
//             каждый прогон).
// Invariants: голова не принимает НИ ОДНОГО решения о содержании шага; ошибка поднимается
//             непреобразованной и мапится один раз, на краю.
// Interface:  исполняется хостом целиком; экспортов нет (vm, execution.ts:302).

const ok  = (fields) => ({ track: "ok", code: 0, ...fields });
const err = (kind, fields) => ({ track: "err", kind, code: kind === "crashed" ? 2 : 10, ...fields });

// ENVELOPE — единственная форма, которую роль возвращает через outputSchema; хост валидирует её сам,
// поэтому грамматики конверта нигде не написано.
// BUG_FIX_CONTEXT: прогон fcc4c120 — роль вернула {"track":"err","code":10,"subject":"…"} БЕЗ kind.
// Рельса вопроса включается по kind, и конверт-ошибка без имени рельсы пролетел мимо всех ветвей:
// оператор не увидел вопросов ценой 193 316 токенов и пяти запусков роли. allOf ниже требует kind и
// subject при track:"err", и хост отбивает такой конверт В ХОДЕ САМОЙ РОЛИ — это дешевле переделегации.
const ENVELOPE = {
  type: "object",
  properties: {
    track: { type: "string", enum: ["ok", "err"] },
    artifact: { type: "string" },
    requirements: { type: "number" }, values: { type: "number" }, routes: { type: "number" },
    modules: { type: "number" }, gaps: { type: "number" }, deltas: { type: "number" },
    scenarios: { type: "number" }, unknown: { type: "number" },
    kind: { type: "string", enum: ["blocked", "invalid", "question", "lookup", "escalate", "crashed"] },
    subject: { type: "string" },
    items: { type: "array", items: { type: "string" } },
    evidence: { type: "string" },
    answer_cmd: { type: "string" },
  },
  required: ["track"],
  additionalProperties: false,
  allOf: [{ if: { properties: { track: { const: "err" } }, required: ["track"] }, then: { required: ["kind", "subject"] } }],
};

// РОЙ ЛИТЕРАЛЕН ПО КОНТРАКТУ ХОСТА.
// BUG_FIX_CONTEXT: живой запуск в /private/tmp/izi-sandbox-scope, до единого потраченного токена.
//   Было:     parallel(`scope-b${n}`, Object.fromEntries(batch.map(...))) — читается естественно.
//   Сломалось: хост валидирует ИСХОДНИК до исполнения и требует ОБА аргумента литералами: литеральную
//             строку имени и ObjectExpression задач (validation.js:862). Прогон не стартовал вовсе:
//             «The workflow metadata is invalid: parallel requires an operation name string and
//             tasks record». Рой, чья ширина приходит из конфига в рантайме, здесь НЕВОЗМОЖЕН.
//   Чинит:    литеральная запись из SWARM слотов; пустой слот возвращает null и ничего не стоит.
// Ширина — литерал ЭТОГО файла; budgets.maxParallel умеет её только ПОНИЗИТЬ. Порций больше ширины —
// шаг эмитит их пачками: лимитера параллельности в песочнице нет, parallel это Promise.all.
const SWARM = 8;
const seat = (calls, i) => (calls && calls[i]
  ? agent(calls[i].text, { role: calls[i].role, outputSchema: ENVELOPE })
  : null);

const PRIMITIVES = {
  role:  (i) => agent(i.text, { role: i.role, outputSchema: ENVELOPE }),
  roles: (i) => parallel("roles", {
    s0: () => seat(i.calls, 0), s1: () => seat(i.calls, 1), s2: () => seat(i.calls, 2), s3: () => seat(i.calls, 3),
    s4: () => seat(i.calls, 4), s5: () => seat(i.calls, 5), s6: () => seat(i.calls, 6), s7: () => seat(i.calls, 7),
  }),
  // checkpoint берёт ОДИН объект и ровно три поля (validation.js:15), prompt ≤ 1024 байт.
  // ИМЯ КЛЮЧУЕТ ПАУЗУ: два хода с одним именем — одна пауза, и второй вопрос оператор не увидит
  // никогда. Имя и уже урезанный текст считает ШАГ и кладёт в инструкцию — полоса текстов не собирает.
  ask:   (i) => checkpoint({ name: i.name, prompt: i.prompt, context: { pending: ".agent/pending.json" } }),
  say:   (i) => log(i.line),
};

// Слова, после которых события нет: log возвращает undefined, и складывать нечего.
const VOID = { say: true };

// Круги внутри шага наружу не видны — как не виден снаружи `for` внутри функции.
// СЛОВО, КОТОРОГО ПОЛОСА НЕ ЗНАЕТ, — ОТКАЗ С ИМЕНЕМ, а не TypeError: расширение читается при старте
// сессии pi, этот файл — при каждом прогоне, поэтому новое слово в старой полосе штатно возможно.
const run = async (id, state) => {
  for (;;) {
    const it = await stepNext({ id, state });
    if (it.do === "done") return ok({ value: it.state });
    if (it.do === "err")  return err(it.code, { subject: it.subject, evidence: it.evidence });
    const primitive = PRIMITIVES[it.do];
    if (!primitive) return err("crashed", { subject: `шаг ${id} просит «${it.do}» — полоса такого не умеет: перезапусти pi` });
    const result = await primitive(it);
    // СОБЫТИЕ НЕСЁТ ИНСТРУКЦИЮ, НА КОТОРУЮ ОТВЕЧАЕТ. Без неё fold не знает, ни куда была послана
    // роль, ни что посчитал скрипт на этом ходе, — и шаг, объявивший состав порций, не может его
    // положить: следующий next снова видит пустой состав и снова говорит то же самое. Вечный круг
    // на первом же ходе, пойманный первым же компонентным тестом 21.08.2026.
    const folded = await stepFold({ id, state, event: { do: it.do, instruction: it, result: VOID[it.do] ? null : result } });
    if (folded.track === "err") return folded;     // ROP: отказ поднимается, а не рушит state в undefined
    state = folded.value;
  }
};

async function plan(state) {
  const values = await run("plan/values", state);      if (values.track === "err") return values;
  const tree   = await run("plan/tree", values.value); if (tree.track === "err")   return tree;
  return await run("plan/flows", tree.value);
}

try {
  const started = await stepStart({ cwd: args.cwd, run: args.run, key: args.key || "" });
  if (started.track === "err") return started;
  const state0 = started.state;

  const task   = await run("task", state0);          if (task.track === "err")   return task;
  const brd    = await run("brd", task.value);       if (brd.track === "err")    return brd;
  const scope  = await run("scope", brd.value);      if (scope.track === "err")  return scope;
  const graph  = await run("graph", scope.value);    if (graph.track === "err")  return graph;
  const intake = await run("intake", graph.value);   if (intake.track === "err") return intake;
  const weight = await run("weight", intake.value);  if (weight.track === "err") return weight;
  const ripple = await run("ripple", weight.value);  if (ripple.track === "err") return ripple;

  // ГРАНИЦА ПЕРВОЙ ПОСТАВКИ. plan/book, review и gate1 объявлены с ship="0", и звать их отсюда
  // нельзя: мост на неизвестный шаг обязан вернуть отказ, и прогон кончался бы ошибкой НА УСПЕХЕ.
  return await plan(ripple.value);
} catch (e) {                      // адаптер на краю — единственное место, где ошибка мапится
  const msg = String((e && e.message) || e);
  const HOST = ["agent", "parallel", "checkpoint", "log", "stepStart", "stepNext", "stepFold"];
  // Сверяем ИМЯ из списка, а не форму сообщения: «ok is not defined» это дефект ЭТОГО файла, и
  // совет «перезапусти pi» увёл бы оператора в сторону на каждом прогоне.
  if (HOST.some((n) => msg === `${n} is not defined`)) {
    return err("crashed", { subject: `${msg} — функции хоста нет в этой сессии pi: перезапусти pi` });
  }
  return err("crashed", { subject: msg });
}
