// MODULE_CONTRACT: owners — слайс пласта owners наряда intake (выбор владельцев, B1)
// Purpose:    одно решение: ЧТО видит модель на пласте «каждый шаг получает владельца» —
//             кандидаты СКРИПТА (b0), чертёж аналога, функции аналога, таблица типов; сюда же
//             ложится на диск материал суда: .agent/intake-b0.json и скелет .agent/rtm.md.
// io:         fs (пишет intake-b0.json и скелет rtm.md; читает через cut.mjs)
// EXTERNAL_DEPENDENCY: steps/intake/cut.mjs — b0Of/blueprintOf/typesOf/brdText; ядро кандидатов
//             steps/intake/owners/b0.mjs (только этого пласта); пути против state.cwd ПРОГОНА.
// Invariants: слоты приходят ВСЕГДА, пустота — ИМЕНОВАННАЯ («скрипт не нашёл»), не выдумка;
//             тотальность наряда проверяет голова (order.mjs).
// Interface:  orderSlice
import { writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { b0Of, blueprintOf, typesOf, brdText } from "../cut.mjs"

// FUNCTION_CONTRACT: orderSlice — слоты пласта owners + материал суда на диск
//   Input:        state — состояние прогона (cwd); prev — staging прошлого слоя, здесь не нужен
//   Dependencies: cut.mjs::b0Of/blueprintOf/typesOf/brdText; node:fs — запись b0 и скелета rtm
//   Antecedent:   слоёв A/anchors/карты может не быть — пустая таблица, не бросок
//   Consequent:   success: { "{CANDIDATES}", "{BLUEPRINT}", "{ANALOGUE}", "{TYPES}" } — строки;
//                 побочно: .agent/intake-b0.json (судья читает ЕГО ЖЕ — модель видит то, по чему
//                 её судят) и скелет .agent/rtm.md, если в brd.md есть R-строки, а rtm.md ещё нет
//   Purity:       io (fs)
export function orderSlice(state, _prev) {
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
  // T63-0 — ЧЕРТЁЖ АНАЛОГА: связное ядро с ролями и вызовами. Функции отвечают «кто что
  // делает», чертёж — «из каких слоёв состоит образец»: новые модули заводятся по его
  // структуре, а не выдуманной архитектуре (замер 25.08: GlossaryResource/GlossaryLoader
  // вместо квинтета модель-интерфейс-REST-mongo-rest).
  const bp = blueprintOf(state)
  return {
    "{CANDIDATES}": rows.join("\n") || "(скрипт кандидатов не нашёл — каждый шаг вопрос или new=yes)",
    "{BLUEPRINT}": bp.length ? bp.join("\n") : "(у аналога нет связного ядра в карте — структуры нет, только функции)",
    "{ANALOGUE}": b0.analogueFunctions.length
      ? b0.analogueFunctions.map((f) => `${f.path}${f.steps.length ? ` · нужен шагам: ${f.steps.join(", ")}` : " · роль пересекается с шагами"} — ${f.role.slice(0, 160)}`).join("\n")
      : "(аналог не сопоставился ни с одним шагом)",
    // T61 — ТИПЫ ТАБЛИЦЕЙ (выпали из наряда при разложении T62 — вернули): конвенция имён видна.
    "{TYPES}": typesOf(state).slice(0, 80).join("\n") || "(the repository declares no types)",
  }
}
