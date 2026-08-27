// MODULE_CONTRACT: contracts — слайс пласта contracts наряда intake (формы дельт, B2)
// Purpose:    одно решение: ЧТО видит модель на пласте «дельты на подтверждённых узлах» —
//             таблица владельцев МАШИНОЙ из staging прошлого слоя (B1), срез карты с ролью
//             и api каждого выбранного узла, словарь форм дельт. Формы ставятся ТОЛЬКО на
//             узлах, которые B1 уже назначил, — выдуманные узлы отсюда исключены.
// io:         fs (через cut.mjs — карта из .agent/appgraph.xml)
// EXTERNAL_DEPENDENCY: steps/intake/frd.mjs — parseFrd/FRD_FORM; steps/intake/cut.mjs — mapOf;
//             prev — staging слоя owners, его приносит голова (order.mjs) против cwd прогона.
// Invariants: слоты приходят ВСЕГДА, пустота — ИМЕНОВАННАЯ («B1 не оставил владельцев»);
//             тотальность наряда проверяет голова (order.mjs).
// Interface:  orderSlice
import { FRD_FORM, parseFrd } from "../frd.mjs"
import { mapOf } from "../cut.mjs"

// FUNCTION_CONTRACT: orderSlice — слоты пласта contracts
//   Input:        state — состояние прогона (cwd); prev — staging слоя owners (его владельцы)
//   Dependencies: frd.mjs::parseFrd, frd.mjs::FRD_FORM, cut.mjs::mapOf
//   Antecedent:   prev может быть пуст или без <owner> — именованная пустота, не выдумка
//   Consequent:   success: { "{OWNERS}", "{MAPSLICE}", "{DELTA_FORMS}" } — строки
//   Purity:       io (fs через cut.mjs)
export function orderSlice(state, prev) {
  // T62 — ФОРМЫ ТОЛЬКО НА ПОДТВЕРЖДЁННЫХ УЗЛАХ: таблица владельцев машиной из staging B1,
  // срез карты — роль/api каждого выбранного узла.
  const owners = parseFrd(prev).owners
  const map = mapOf(state)
  const slice = []
  for (const o of owners) {
    const p = String(o.node || "")
    const role = map.roles?.get(p) || "(нет в карте — новый файл)"
    const api = (map.apis?.get(p) || []).slice(0, 3).join(", ")
    slice.push(`${p} — ${role}${api ? ` — api: ${api}` : ""}`)
  }
  return {
    "{OWNERS}": owners.length
      ? owners.map((o) => `${o.step} → ${o.node}${o.new === "yes" ? " (new)" : ""}`).join("\n")
      : "(B1 не оставил владельцев — сначала закрой его)",
    "{MAPSLICE}": slice.join("\n") || "(пусто)",
    "{DELTA_FORMS}": FRD_FORM.deltaForms.join(" · "),
  }
}
