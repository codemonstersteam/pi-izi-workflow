// MODULE_CONTRACT: order — наряд роли intake на ОДИН пласт
// Purpose:    одно решение: как пласт становится текстом наряда. Четыре шаблона — ДАННЫЕ
//             (order-{a,b,c,d}.tpl), подстановка слотов; PREVIOUS несёт staging предыдущего
//             пласта, FEEDBACK — блокеры прошлого круга ЭТОГО пласта.
// io:         fs (чтение шаблона — module-relative)
// EXTERNAL_DEPENDENCY: cut.mjs — карта, ответы, brd, normalized; frd.mjs::FRD_FORM.
// Invariants: ТОТАЛЕН; непоставленный слот — отказ, а не текст с дырой.
// Interface: orderText
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { FRD_FORM, parseFrd } from "./frd.mjs"
import { mapOf, answersText, typesOf, b0Of, blueprintOf, brdText, normalizedText } from "./cut.mjs"

const tpl = (pass) => readFileSync(new URL(`./order-${pass.toLowerCase()}.tpl`, import.meta.url), "utf8")

// FUNCTION_CONTRACT: orderText — наряд по пласту
//   Input:        state; pass — буква пласта; { previous, feedback, closed } — прошлый ответ,
//                 находки и список закрытых пластов
//   Consequent:   success: { text, staging }; failure: { why }
//   Purity:       io (fs)
export function orderText(state, pass, { previous = "", feedback = "", closed = "", lookup = "" } = {}) {
  const staging = `.agent/staging/frd~${pass}.xml`
  const answers = answersText(state)
  const map = mapOf(state)
  const slots = {
    "{STAGING}": staging,
    "{PREVIOUS}": previous,
    "{FEEDBACK}": feedback,
    "{CLOSED}": closed,
    // T61 — ОТВЕТЫ ОПЕРАТОРА НА КАЖДОМ ПЛАСТЕ. Прежде сюда ложились БУКВЫ закрытых пластов, а
    // ответы уезжали в {ANSWERS} — слот, которого в order-b/c/d.tpl нет: пласт B работал вслепую
    // (замер 25.08: ответ «привязка в самой модели AgentConfiguration» не доехал — дельты ушли в
    // AgentStore/RestAgentStore). Дубль в наряде дешевле молчания; буквы остаются в {CLOSED}.
    "{ANSWERED}": answers || "(the operator has answered nothing yet)",
    "{ANSWERS}": answers,
    "{CHECK}": `the script judges the file you write at ${staging} by the FRD guardrail for pass ${pass}`,
  }
  if (pass === "scenarios") slots["{BRD}"] = brdText(state), slots["{NORMALIZED}"] = normalizedText(state)
  if (pass === "owners") {
    // V2 МАТЕРИАЛЫ: кандидаты + чертёж + СКЕЛЕТ RTM — прожарка судится двусторонней матрицей
    // (rtm.mjs): строки-требования из brd.md, владельцы дописываются в неё этим подшагом.
    const b0 = b0Of(state)
    writeFileSync(join(state.cwd, ".agent/intake-b0.json"), JSON.stringify(b0, null, 1))
    const rIds = [...brdText(state).matchAll(/^R\d+ /gm)].map((m) => m[0].trim())
    if (rIds.length && !existsSync(join(state.cwd, ".agent/rtm.md"))) {
      writeFileSync(join(state.cwd, ".agent/rtm.md"), rIds.map((r) => `${r} | owners:`).join("\n") + "\n")
    }
    const rows = []
    for (const s of b0.steps) {
      rows.push(`${s.id}${s.disputed ? "  DISPUTED" : ""}  «${s.text}»`)
      if (!s.candidates.length) rows.push("    (нет кандидатов — новый модуль или вопрос оператору)")
      // T63 — ТОП-4; роль ПОЛНАЯ у топ-2 (решение о владельце читает её), урезана у остальных.
      // Наряд с полными ролями × шаги × кандидаты разбух до 107К и замедлял модель (замер 25.08).
      s.candidates.slice(0, 4).forEach((c, i) => {
        const role = i < 2 ? (c.role || "") : (c.role || "").slice(0, 120)
        rows.push(`    ${c.path} · ${c.score}${c.via ? ` · via edge of ${c.via}` : ""}${role ? ` — ${role}` : ""}`)
      })
    }
    slots["{CANDIDATES}"] = rows.join("\n") || "(скрипт кандидатов не нашёл — каждый шаг вопрос или new=yes)"
    // T63-0 — ЧЕРТЁЖ АНАЛОГА: связное ядро с ролями и вызовами. Функции отвечают «кто что
    // делает», чертёж — «из каких слоёв состоит образец»: новые модули заводятся по его
    // структуре, а не выдуманной архитектуре (замер 25.08: GlossaryResource/GlossaryLoader
    // вместо квинтета модель-интерфейс-REST-mongo-rest).
    const bp = blueprintOf(state)
    slots["{BLUEPRINT}"] = bp.length ? bp.join("\n") : "(у аналога нет связного ядра в карте — структуры нет, только функции)"
    slots["{ANALOGUE}"] = b0.analogueFunctions.length
      ? b0.analogueFunctions.map((f) => `${f.path}${f.steps.length ? ` · нужен шагам: ${f.steps.join(", ")}` : " · роль пересекается с шагами"} — ${f.role.slice(0, 160)}`).join("\n")
      : "(аналог не сопоставился ни с одним шагом)"
    // T61 — ТИПЫ ТАБЛИЦЕЙ (выпали из наряда при разложении T62 — вернули): конвенция имён видна.
    const types = typesOf(state)
    slots["{TYPES}"] = types.slice(0, 80).join("\n") || "(the repository declares no types)"
  }
  if (pass === "contracts") {
    // T62 — ФОРМЫ ТОЛЬКО НА ПОДТВЕРЖДЁННЫХ УЗЛАХ: таблица владельцев машиной из staging B1,
    // срез карты — роль/api каждого выбранного узла.
    const owners = parseFrd(previous).owners
    slots["{OWNERS}"] = owners.length
      ? owners.map((o) => `${o.step} → ${o.node}${o.new === "yes" ? " (new)" : ""}`).join("\n")
      : "(B1 не оставил владельцев — сначала закрой его)"
    const slice = []
    for (const o of owners) {
      const p = String(o.node || "")
      const role = map.roles?.get(p) || "(нет в карте — новый файл)"
      const api = (map.apis?.get(p) || []).slice(0, 3).join(", ")
      slice.push(`${p} — ${role}${api ? ` — api: ${api}` : ""}`)
    }
    slots["{MAPSLICE}"] = slice.join("\n") || "(пусто)"
    slots["{DELTA_FORMS}"] = FRD_FORM.deltaForms.join(" · ")
  }
  if (pass === "data-failures") {
    slots["{BRD}"] = brdText(state)
    slots["{NORMALIZED}"] = normalizedText(state)
    slots["{SOURCES}"] = FRD_FORM.sources ? Object.entries(FRD_FORM.sources).map(([k, v]) => `${k}: ${v}`).join("\n") : ""
  }
  if (pass === "critic") {
    // V2-4 — КРИТИК: последний взгляд перед планом; рубрика в шаблоне, данные — артефакт целиком
    slots["{BRD}"] = ""
  }
  if (pass === "coverage") {
    // T50 — СПИСОК ДОЛНЫХ ТРЕБОВАНИЙ из brd.md: модель видит КАЖДЫЙ id и копирует его
    // в <carried req="…">. Без списка модель не знает, что закрыть (замер 25.08: D круг 1 —
    // F11 на ВСЕ требования, потому что {OWED} был пуст).
    const brd = brdText(state)
    const ids = [...brd.matchAll(/^R\d+ /gm)].map((m) => m[0].trim())
    slots["{OWED}"] = ids.length ? ids.join("\n") : "(нет требований в brd.md — проверь формат)"
  }
  let text = tpl(pass)
  for (const [k, v] of Object.entries(slots)) text = text.split(k).join(v)
  const hole = text.match(/\{([A-Z_]+)\}/)
  if (hole) return { why: `слот {${hole[1]}} не подставлен — наряд уходит роли с дырой` }
  // T69 — ОТВЕТ РЕЛЬСЕ LOOKUP отдельным документом в КОНЦЕ, не слотом: шаблоны тотальны,
  // и машинный блок не должен дырявить четыре .tpl. Роль просила пути — наряд их несёт;
  // «нет в карте» — тоже ответ: искать больше нечего, путь один — в question.
  if (lookup.trim()) {
    text += `\n\n$START_DOCUMENT\npath: .agent/map-lookup (machine-answered — your last lookup, resolved by the script)\nThe paths and kinds you asked for. Use them; do not ask again.\n$END_DOCUMENT\n$START_CONTENT\n${lookup.trim()}\n$END_CONTENT`
  }
  return { text, staging }
}