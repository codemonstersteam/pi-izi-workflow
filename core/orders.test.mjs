// Наряд — единственный канал между полосой и ролью, и он собирается ПОДСТАНОВКОЙ: `{SLOT}` шаблона
// против ключей, которые перечисляет `sized(...)` в workflows/izi.js. Подстановка молчалива в обе
// стороны: слот без ключа приезжает роли ПУСТЫМ (а «пусто» у шага 6 значит «первая попытка»), ключ
// без слота не приезжает вовсе. Ни то ни другое не ловится ни одним гардрейлом — они судят артефакт,
// а не заказ, — и увидеть это можно только в живом прогоне, по тому, что роль ведёт себя странно.
//
// Шов заведён вместе со слотом PREVIOUS (прогон 7f3a8431): роль переписывала FRD с нуля каждый круг,
// потому что своего прошлого ответа не получала.
//
// Хост требует ТОЧНОГО совпадения в обе стороны: `prompt()` бросает и на «Missing prompt value», и на
// «Unused prompt value» (execution.ts) — то есть расхождение убивает прогон на запуске, а не на
// разборе. Раньше это сверялось в steps/intake/frd.test.mjs со списком ключей, набранным в тесте
// руками: такой список сходится с шаблоном всегда, потому что третьей стороны договора — полосы — в
// сверке нет. S33 — след того же места: ключ `QUESTIONS_LEFT` ушёл вместе с бюджетом вопросов, и
// счётчик, выданный роли как «осталось в прогоне», два живых прогона читали как разрешение потратить.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const WORKFLOW = readFileSync(join(ROOT, "workflows/izi.js"), "utf8")

// Ключи одного вызова: `sized("intake", orderTpl, { BRD, MAP: map.text, … })` — читается имя шага и
// имена ключей объекта, до закрывающей скобки. Ключ стоит в начале объекта или после запятой, и
// пишется двумя способами: `MAP: map.text` и сокращённо `CHECK` — второй бывает и последним, перед
// самой скобкой, поэтому конец объекта здесь такая же граница, как запятая.
const callsOf = (src) =>
  [...src.matchAll(/sized\(\s*"([a-z-]+)"\s*,\s*\w+\s*,\s*\{([^}]*)\}/g)].map((m) => ({
    step: m[1],
    keys: new Set([...`{${m[2]}}`.matchAll(/[{,]\s*([A-Z_]+)\s*(?=[:,}])/g)].map((k) => k[1])),
  }))

const slotsOf = (tpl) => new Set([...tpl.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1]))

test("у каждого слота наряда есть ключ в полосе, и наоборот", () => {
  const calls = callsOf(WORKFLOW)
  assert.ok(calls.length >= 3, `в полосе найдено вызовов sized: ${calls.length} — разбор сломался`)

  for (const { step, keys } of calls) {
    const path = join(ROOT, "steps", step, "order.tpl")
    if (!existsSync(path)) continue // наряд, собранный не из файла шага
    const slots = slotsOf(readFileSync(path, "utf8"))

    const empty = [...slots].filter((s) => !keys.has(s))
    assert.deepEqual(empty, [], `${step}: слот шаблона без ключа полосы — роль получит пустоту: ${empty.join(", ")}`)

    const lost = [...keys].filter((k) => !slots.has(k))
    assert.deepEqual(lost, [], `${step}: ключ полосы без слота шаблона — данные не доедут: ${lost.join(", ")}`)
  }
})

// ПРОШЛЫЙ ОТВЕТ РОЛИ КОПИРУЕТ МАШИНА. Читать его с диска — ДЕЙСТВИЕ, а действие роль на `thinking:
// low` может тихо не сделать; наряд не приехать не может. Та же дисциплина, что у ключа вопроса в
// `.agent/pending.json` (CLAUDE.md, ограничение 4).
test("починка шага 6 несёт прошлый ответ роли, а не путь к нему", () => {
  const tpl = readFileSync(join(ROOT, "steps/intake/order.tpl"), "utf8")
  assert.ok(slotsOf(tpl).has("PREVIOUS"), "в наряде intake нет слота PREVIOUS")
  assert.match(WORKFLOW, /const PREVIOUS = await readText\(\{ path: STAGING \}\)/)

  const role = readFileSync(join(ROOT, "steps/intake/intake.md"), "utf8")
  assert.match(role, /PREVIOUS/, "текст роли не называет блок, в котором приезжает её прошлый ответ")
})

// Шаблоны шагов не должны расходиться со списком слотов ВООБЩЕ: пустой слот — это тихая потеря.
test("ни один наряд не оставлен без разбора", () => {
  const steps = readdirSync(join(ROOT, "steps"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, "steps", d.name, "order.tpl")))
    .map((d) => d.name)
  const seen = new Set(callsOf(WORKFLOW).map((c) => c.step))
  const orphans = steps.filter((s) => !seen.has(s))
  assert.deepEqual(orphans, [], `наряд есть, а вызова в полосе нет: ${orphans.join(", ")}`)
})

// ШАГ БЕЗ ОТМЕТКИ МОЛЧА ЛОМАЕТ ВОЗОБНОВЛЕНИЕ. Лестница (core/runlog.mjs::resumeAt) входит в ПЕРВЫЙ
// шаг без отметки — значит шаг, который отработал и ничего не записал, будет переигрываться вечно, а
// весь путь за ним никогда не откроется. Увидеть это можно только в живом прогоне, поэтому проверка
// статическая: каждая ветка `if (from <= N)` полосы обязана нести `runlogMark({ step: N`.
test("каждый шаг полосы кончается отметкой в журнале", () => {
  const guards = [...WORKFLOW.matchAll(/if \(from0? <= (\d+)\)/g)].map((m) => Number(m[1]))
  const marked = new Set([...WORKFLOW.matchAll(/runlogMark\(\{ step: (\d+)/g)].map((m) => Number(m[1])))
  // Шаги, отложенные до своего наряда (10 и 11 — их артефакты не собираются сегодня), не в счёт.
  const alive = [...new Set(guards)].filter((n) => n !== 10 && n !== 11).sort((a, b) => a - b)

  const mute = alive.filter((n) => !marked.has(n))
  assert.deepEqual(mute, [], `шаги без отметки — возобновление будет входить в них вечно: ${mute.join(", ")}`)
  assert.ok(marked.has(1), "шаг 1 не отмечается — лестница не сдвинется с первой ступени")
})
