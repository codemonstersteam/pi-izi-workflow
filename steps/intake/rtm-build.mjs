// MODULE_CONTRACT: rtm-build — СБОРКА rtm.md ИЗ АРТЕФАКТА, СКРИПТОМ, НЕ МОДЕЛЬЮ
// Purpose:    одно решение: кто ведёт бухгалтерию матрицы. Живой круг 25.08 доказал: наряд с
//             двумя выходными файлами (staging + rtm.md) пишет только staging — форма роли
//             допускает ОДИН write. Сборка здесь: owner-строки артефакта → строки матрицы;
//             UC→R сопоставляется по тексту use case (в нём живут R-ссылки), либо R не покрывается
//             и forward-суд назовёт пустую строку.
// io:         fs
// EXTERNAL_DEPENDENCY: ./frd.mjs::parseFrd — owners/usecases артефакта; ../brd/brd.mjs::parseBrd.
// Invariants: ПЕРЕЗАПИСЬ ЦЕЛИКОМ — матрица производная, источник один (артефакт); строки без
//             владельцев остаются пустыми (forward-суд их назовёт по имени).
// Interface:  writeRtmFromArtifact, rtmFrom
import { writeFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseFrd } from "./frd.mjs"
import { parseBrd } from "../brd/brd.mjs"

// FUNCTION_CONTRACT: rtmFrom — чистое ядро сборки
//   Input:        { brdText, artifactXml }
//   Consequent:   success: string — текст rtm.md; строка на каждое R из brd.md (порядок brd);
//                 owners артефакта агрегированы по R через UC→R (R упомянут в тексте use case);
//                 questions артефакта — в свою колонку
//   Purity:       pure
export function rtmFrom({ brdText = "", artifactXml = "" } = {}) {
  const brd = parseBrd(brdText)
  const frd = parseFrd(artifactXml)

  // UC → R ДВУМЯ ПУТЯМИ: (1) R-id упомянут в тексте use case — точное сопоставление;
  // (2) СЛОВО-ПЕРЕКРЫТИЕ: слова R-строки (все четыре колонки, длина ≥4) против текста UC.
  // Живой круг 25.08: scenarios-наряд не просил R-ссылок, артефакт их не нёс — точный путь
  // пуст. Слово-путь ловит «export | Glossary | agent ZIP archive» ↔ «export glossaries in
  // agent ZIP archive» по четырём общим словам; R без единого сопоставления остаётся пустой
  // строкой — forward-суд назовёт её по имени, и это правильный исход (не молчание).
  const words = (s) => new Set(String(s || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4))
  const rWords = new Map()
  for (const r of brd.requirements || []) rWords.set(r.id, words(r.statement))
  const ucText = new Map()
  for (const uc of frd.usecases) {
    ucText.set(uc.id, [uc.goal || "", uc.pre || "", uc.post || "", ...(uc.steps || [])].join(" "))
  }
  const reqOfUc = new Map()
  for (const [ucId, text] of ucText) {
    const t = text.toLowerCase()
    const tw = words(text)
    const hits = (brd.requirements || []).filter((r) => {
      if (t.includes(r.id)) return true
      const rw = rWords.get(r.id)
      let n = 0
      for (const w of rw) if (tw.has(w)) n++
      return n >= 2
    }).map((r) => r.id)
    reqOfUc.set(ucId, hits)
  }

  const byReq = new Map((brd.requirements || []).map((r) => [r.id, { owners: [], questions: [] }]))
  for (const o of frd.owners) {
    const uc = String(o.step || "").split("/")[0]
    const tok = `${o.node}${o.new === "yes" ? "(new" + (o.after ? `, after=${o.after}` : "") + ")" : ""}`
    for (const r of reqOfUc.get(uc) || []) byReq.get(r)?.owners.push(tok)
  }
  for (const q of frd.questions) {
    const uc = String(q.step || "").split(/[\s/]/)[0]
    if (!uc || !reqOfUc.has(uc)) continue
    for (const r of reqOfUc.get(uc)) byReq.get(r)?.questions.push(String(q.subject || "").replace(/[|,]/g, " ").trim())
  }

  const lines = []
  for (const r of brd.requirements || []) {
    // КЛЮЧ — r.id (строка), не объект требования: byReq.get(r) на объекте молча давал пустоту
    // при полных owners — «матрица не собирается» живого круга 26.08.
    const cell = byReq.get(r.id) || { owners: [], questions: [] }
    const uniq = [...new Set(cell.owners)]
    const qs = [...new Set(cell.questions)]
    lines.push(`${r.id} | owners: ${uniq.join(", ")}${qs.length ? ` | questions: ${qs.join("; ")}` : ""}`.replace(/ \| owners: $/, " | owners:"))
  }
  return lines.join("\n") + "\n"
}

// FUNCTION_CONTRACT: writeRtmFromArtifact — положить сборку на диск
//   Consequent:   success: перезаписывает <cwd>/.agent/rtm.md
//   Purity:       io (fs)
export function writeRtmFromArtifact(cwd, stagedXml) {
  const brdText = readFileSync(join(cwd, ".agent/brd.md"), "utf8")
  writeFileSync(join(cwd, ".agent/rtm.md"), rtmFrom({ brdText, artifactXml: stagedXml }))
}
