// MODULE_CONTRACT: one — слайс укороченного трека intake: ОДИН наряд вместо шести пластов
// Purpose:    одно решение: ЧТО видит модель в единственном вызове укороченного трека — все
//             материалы шести пластов разом: BRD и таблицу normalized (scenarios), кандидатов
//             и чертёж аналога (owners), список требований к списанию (coverage), словарь
//             источников чисел (data-failures). Сюда же ложится на диск материал суда — те же
//             файлы, что пишет owners: .agent/intake-b0.json и скелет .agent/rtm.md. Форму
//             наряда несёт шаблон one/order-one.tpl; тотальность подстановки — голова
//             (order.mjs). Суд — ПОЛНЫЙ двор одним прогоном (fold головы, intake.step.mjs).
// io:         fs (пишет intake-b0.json и скелет rtm.md; читает через cut.mjs)
// EXTERNAL_DEPENDENCY: steps/intake/cut.mjs — b0Of/blueprintOf/typesOf/brdText/normalizedText;
//             steps/intake/frd.mjs::FRD_FORM — словарь источников чисел; пути против state.cwd
//             ПРОГОНА (не этого репо). b0Of читает staging слоя scenarios — в укороченном
//             треке его нет, таблица придёт пустой: это ИМЕНОВАННАЯ пустота наряда, владелец
//             выбирается по чертежу/типам/карте, а суд F17a судит по шагам самого артефакта.
// Invariants: слоты приходят ВСЕГДА, пустота — ИМЕНОВАННАЯ («скрипт не нашёл»), не выдумка;
//             скелет rtm.md НЕ затирает начатую матрицу (круг починки не роняет её работу).
// Interface:  orderSlice
import { writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { FRD_FORM } from "../frd.mjs"
import { b0Of, blueprintOf, typesOf, brdText, normalizedText } from "../cut.mjs"

// FUNCTION_CONTRACT: orderSlice — слоты укороченного трека + материал суда на диск
//   Input:        state — состояние прогона (cwd); prev — свой прошлый staging (круг вопроса
//                 T64: наряд круга 2 несёт артефакт с вопросами и ответы {ANSWERED}), здесь
//                 самим слайсом не читается — текст приезжает общим слотом {PREVIOUS} головы
//   Dependencies: cut.mjs::b0Of/blueprintOf/typesOf/brdText/normalizedText; frd.mjs::FRD_FORM;
//                 node:fs — запись b0 и скелета rtm
//   Antecedent:   brd.md/карты/anchors может не быть — именованные пустоты, не бросок
//   Consequent:   success: { "{CANDIDATES}", "{BLUEPRINT}", "{ANALOGUE}", "{TYPES}", "{OWED}",
//                 "{SOURCES}", "{BRD}", "{NORMALIZED}" } — строки; побочно: .agent/intake-b0.json
//                 (судья F17 читает ЕГО ЖЕ) и скелет .agent/rtm.md из R-строк brd, если матрицы
//                 ещё нет
//   Purity:       io (fs)
export function orderSlice(state, _prev) {
  // МАТЕРИАЛЫ СУДА — как у owners: кандидатная таблица на диск (модель видит то, по чему её
  // судят), скелет матрицы — из R-строк brd, БЕЗ затирания начатого.
  const b0 = b0Of(state)
  writeFileSync(join(state.cwd, ".agent/intake-b0.json"), JSON.stringify(b0, null, 1))
  const brd = brdText(state)
  const rIds = [...brd.matchAll(/^R\d+ /gm)].map((m) => m[0].trim())
  if (rIds.length && !existsSync(join(state.cwd, ".agent/rtm.md"))) {
    writeFileSync(join(state.cwd, ".agent/rtm.md"), rIds.map((r) => `${r} | owners:`).join("\n") + "\n")
  }
  const rows = []
  for (const s of b0.steps) {
    rows.push(`${s.id}${s.disputed ? "  DISPUTED" : ""}  «${s.text}»`)
    if (!s.candidates.length) rows.push("    (нет кандидатов — новый модуль или вопрос оператору)")
    s.candidates.slice(0, 4).forEach((c, i) => {
      const role = i < 2 ? (c.role || "") : (c.role || "").slice(0, 120)
      rows.push(`    ${c.path} · ${c.score}${c.via ? ` · via edge of ${c.via}` : ""}${role ? ` — ${role}` : ""}`)
    })
  }
  const bp = blueprintOf(state)
  return {
    "{CANDIDATES}": rows.join("\n") || "(скрипт кандидатов не нашёл — владелец по чертежу, типам и карте, либо new=yes, либо вопрос оператору)",
    "{BLUEPRINT}": bp.length ? bp.join("\n") : "(у аналога нет связного ядра в карте — структуры нет, только функции)",
    "{ANALOGUE}": b0.analogueFunctions.length
      ? b0.analogueFunctions.map((f) => `${f.path}${f.steps.length ? ` · нужен шагам: ${f.steps.join(", ")}` : " · роль пересекается с шагами"} — ${f.role.slice(0, 160)}`).join("\n")
      : "(аналог не сопоставился ни с одним шагом)",
    "{TYPES}": typesOf(state).slice(0, 80).join("\n") || "(the repository declares no types)",
    // Список требований — как coverage: ids копируются МАШИНОЙ из brd, суд F11 — та же
    // разность двух списков номеров.
    "{OWED}": rIds.length ? rIds.join("\n") : "(нет требований в brd.md — проверь формат)",
    // Словарь источников чисел — как data-failures: одна и та же строка служит наряду и суду.
    "{SOURCES}": FRD_FORM.sources ? Object.entries(FRD_FORM.sources).map(([k, v]) => `${k}: ${v}`).join("\n") : "",
    "{BRD}": brd,
    "{NORMALIZED}": normalizedText(state),
  }
}
