// MODULE_CONTRACT: values — конструкторы ЗНАЧЕНИЙ конвейера
// Purpose:    одно решение спрятано здесь: КАКОЕ значение имеет право появиться в памяти. Всё, что
//             ездит между модулями кроме состояния, строится тут и невалидным не создаётся.
// io:         none
// EXTERNAL_DEPENDENCY: core/result.mjs — форма Result; ext/index.mjs зовёт эти конструкторы на
//             границе процессов, песочница о них не знает.
// Invariants: конструктор ничего не чинит и ничего не дополняет молча — он либо строит, либо
//             отказывает С ИМЕНЕМ поля. Построенное значение сериализуемо в JSON: оно едет по RPC.
// Interface:  WORDS, KINDS, PROMPT_MAX, instruction, verdict, err, portion
//
// Почему это отдельный модуль, а не поля в state. Valid-by-construction, объявленный для ОДНОГО
// значения из шести, не работает: привод делает `it.do` на том, что приехало, и инструкция без
// `text` и без `role` проходит шов словаря, а падает уже внутри agent(undefined, {role: undefined}).
// Разбор 21.08.2026, redesign.md §3.

import { ok, err as fail } from "../core/result.mjs"

// СЛОВАРЬ ИНСТРУКЦИЙ. Одно место на всю программу: полоса сверяет с ним свои PRIMITIVES, компонентный
// тест — ветви своего привода (standards/workflow-design.md, правило 3).
export const WORDS = ["role", "roles", "ask", "say", "done", "err"]

// КЛАССЫ ОТКАЗА. blocked — вход не годен; invalid — артефакт не разбирается; question — вопрос
// человеку; lookup — вопрос диску; escalate — круги исчерпаны; crashed — дефект программы.
export const KINDS = ["blocked", "invalid", "question", "lookup", "escalate", "crashed"]

// Предел текста паузы — контракт хоста (validation.js:19), не наша осторожность: длиннее означает
// INVALID_METADATA и падение прогона, а не усечение.
export const PROMPT_MAX = 1024

const isStr = (v) => typeof v === "string" && v.trim() !== ""
const bytes = (s) => new TextEncoder().encode(String(s)).length

// FUNCTION_CONTRACT: instruction — что шаг просит сделать полосу
//   Input:        raw — { do, … поля этого слова }
//   Dependencies: WORDS, PROMPT_MAX
//   Antecedent:   `do` — слово из WORDS; поля ЭТОГО слова на месте:
//                   role  → role, text, staging
//                   roles → calls[] непуст, у каждого id, role, text, staging
//                   ask   → name, prompt (≤ PROMPT_MAX БАЙТ), items[]
//                   say   → line
//                   done  → state
//                   err   → code из KINDS, subject
//   Consequent:   success: Result.ok(инструкция) — плоский JSON-объект
//                 failure: Result.err("instruction", …) с ИМЕНЕМ недостающего поля
//   Purity:       pure
//   Interface:    instruction(raw) -> Result<Instruction>
export function instruction(raw) {
  if (!raw || typeof raw !== "object") return fail("instruction", "инструкция не объект")
  const word = raw.do
  if (!WORDS.includes(word)) return fail("instruction", `слово «${word}» вне словаря: ${WORDS.join(" · ")}`)

  const need = (fields) => {
    for (const f of fields) if (!isStr(raw[f])) return `${word}: пусто поле ${f}`
    return ""
  }
  let why = ""
  if (word === "role") why = need(["role", "text", "staging"])
  else if (word === "say") {
    why = need(["line"])
    // `say` — единственное слово, которое имеет право нести ДАННЫЕ: состав работы, посчитанный
    // скриптом на этом ходе. Класть его в состояние из next нельзя (next не пишет состояние), а
    // считать дважды — значит дать двум ходам разойтись.
    if (!why && raw.portions !== undefined && !Array.isArray(raw.portions)) why = "say: portions не список"
  }
  else if (word === "err") {
    why = need(["subject"])
    if (!why && !KINDS.includes(raw.code)) why = `err: code «${raw.code}» вне словаря: ${KINDS.join(" · ")}`
  } else if (word === "ask") {
    why = need(["name", "prompt"])
    if (!why && bytes(raw.prompt) > PROMPT_MAX) why = `ask: prompt ${bytes(raw.prompt)} байт > ${PROMPT_MAX} — хост отвергнет паузу целиком`
    if (!why && (!Array.isArray(raw.items) || !raw.items.length)) why = "ask: items пуст — отвечать будет не по чему"
  } else if (word === "roles") {
    if (!Array.isArray(raw.calls) || !raw.calls.length) why = "roles: calls пуст"
    else for (const c of raw.calls) {
      for (const f of ["id", "role", "text", "staging"]) if (!isStr(c && c[f])) { why = `roles: у вызова пусто поле ${f}`; break }
      if (why) break
    }
  } else if (word === "done") {
    if (!raw.state || typeof raw.state !== "object") why = "done: нет состояния"
  }
  return why ? fail("instruction", why) : ok({ ...raw })
}

// FUNCTION_CONTRACT: verdict — что сказал гардрейл
//   Input:        raw — { step, scope, id, round, ok, blockers, at }
//   Dependencies: —
//   Antecedent:   step непуст; scope — "portion" | "whole"; round — целое ≥ 1;
//                 ok — булево; ПРИ ok:false блокеры НЕПУСТЫ
//   Consequent:   success: Result.ok(вердикт)
//                 failure: Result.err("verdict", …)
//   Purity:       pure
//   BUG_FIX_CONTEXT: гардрейл, отбивающий молча, оставляет наряд починки пустым, а роль — без
//                 работы: «блокер, который нечем закрыть» запрещён standards/guardrail.md. Поэтому
//                 ok:false без блокеров не создаётся, а не «допускается и логируется».
//   Interface:    verdict(raw) -> Result<Verdict>
export function verdict(raw) {
  if (!raw || typeof raw !== "object") return fail("verdict", "вердикт не объект")
  if (!isStr(raw.step)) return fail("verdict", "вердикт без шага — по нему нельзя понять, что судили")
  if (raw.scope !== "portion" && raw.scope !== "whole") return fail("verdict", `scope «${raw.scope}» — только portion или whole`)
  if (typeof raw.ok !== "boolean") return fail("verdict", "вердикт без ok")
  if (!Number.isInteger(raw.round) || raw.round < 1) return fail("verdict", `round «${raw.round}» — целое от 1`)
  if (raw.scope === "portion" && !isStr(raw.id)) return fail("verdict", "вердикт порции без её id")
  if (!raw.ok && !isStr(raw.blockers)) return fail("verdict", "красный вердикт без блокеров — наряд починки будет пуст")
  return ok({ step: raw.step, scope: raw.scope, id: raw.id || "", round: raw.round, ok: raw.ok, blockers: raw.blockers || "", at: raw.at || "" })
}

// FUNCTION_CONTRACT: err — отказ шага
//   Input:        kind — класс из KINDS; fields — { subject, evidence }
//   Dependencies: KINDS
//   Antecedent:   kind в KINDS; subject непуст — отказ без подлежащего нечитаем
//   Consequent:   success: Result.ok({ kind, subject, evidence })
//                 failure: Result.err("err", …)
//   Purity:       pure
//   Interface:    err(kind, fields) -> Result<Err>
export function err(kind, fields = {}) {
  if (!KINDS.includes(kind)) return fail("err", `kind «${kind}» вне словаря: ${KINDS.join(" · ")}`)
  if (!isStr(fields.subject)) return fail("err", `отказ ${kind} без subject — оператору нечего читать`)
  return ok({ kind, subject: fields.subject, evidence: fields.evidence || "" })
}

// FUNCTION_CONTRACT: portion — одна порция работы шага
//   Input:        raw — { id, staging, status, round, blockers }
//   Dependencies: —
//   Antecedent:   id — НЕПУСТАЯ СТРОКА (у 9C это «UC1», а не номер); staging непуст;
//                 status — todo | green | red; round — целое ≥ 1
//   Consequent:   success: Result.ok(порция)
//                 failure: Result.err("portion", …)
//   Purity:       pure
//   BUG_FIX_CONTEXT: два счётчика portion/portions не выражают ни семь конвертов, приехавших разом,
//                 ни адресата блокера, ни круг у каждой порции свой. Поэтому состав — список этих
//                 значений, а id — строка: .agent/staging/flows~UC1.xml адресуется именем use case.
//   Interface:    portion(raw) -> Result<Portion>
export function portion(raw) {
  if (!raw || typeof raw !== "object") return fail("portion", "порция не объект")
  if (!isStr(raw.id)) return fail("portion", "порция без id — её нечем адресовать в наряде починки")
  if (!isStr(raw.staging)) return fail("portion", `порция ${raw.id} без staging-пути — роль некуда послать`)
  const STATUS = ["todo", "green", "red"]
  if (!STATUS.includes(raw.status)) return fail("portion", `порция ${raw.id}: status «${raw.status}» вне словаря: ${STATUS.join(" · ")}`)
  if (!Number.isInteger(raw.round) || raw.round < 1) return fail("portion", `порция ${raw.id}: round «${raw.round}» — целое от 1`)
  return ok({ id: raw.id, staging: raw.staging, status: raw.status, round: raw.round, blockers: raw.blockers || "" })
}
