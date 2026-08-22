// MODULE_CONTRACT: шаг 5 — части роя в одну карту репозитория. Голова над вырожденной пятёркой.
// Purpose:    одно решение: собралась ли из частей одна карта, по которой можно судить проект.
// io:         fs
// EXTERNAL_DEPENDENCY: ext/state.mjs::put, sha1of; ext/values.mjs — конструктор вердикта.
// Invariants: РОЛИ НЕТ — склейка это скрипт. Отбитая карта НЕ ЛОЖИТСЯ: шаг 6 читал бы вчерашнюю.
// Interface:  id, next, fold
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { err } from "../../core/result.mjs"
import { put, sha1of } from "../../ext/state.mjs"
import { verdict as newVerdict } from "../../ext/values.mjs"
import { inputs, plan } from "./inputs.mjs"
import { mergeOf } from "./cut.mjs"
import { judgeGraph } from "./judge.mjs"
import { GRAPH } from "./paths.mjs"

export const id = "graph"

// FUNCTION_CONTRACT: next — ЧТО делать дальше
//   Consequent:   done · err · say; НИКОГДА role
//   Purity:       io (читает; не пишет)
export function next(state) {
  const bad = inputs(state)
  if (bad) return { do: "err", code: "blocked", subject: bad }
  if (state.at && state.at.appgraph) return { do: "done", state }

  const m = mergeOf(state)
  if (m.why) return { do: "err", code: "blocked", subject: m.why }
  return { do: "say", line: `graph: карта из ${m.cells} частей, ${m.nodes} узлов — скрипт, 0 токенов`, xml: m.xml }
}

// FUNCTION_CONTRACT: fold — куда кладётся результат
//   Consequent:   success: состояние с продвинутой картой и её отпечатком
//   Purity:       io (fs)
export function fold(state, event = {}) {
  if (event.do !== "say") return err("fold", `шаг ${id} не знает, что делать с событием «${event.do}»`)
  const xml = (event.instruction || {}).xml || ""
  const p = plan(state)
  // Судится СКЛЕЙКА, а не то, что уже лежит на диске: артефакт кладётся только после вердикта.
  const blockers = judgeGraph({ graph: xml ? { suites: suitesOf(xml), duplicates: [], subjects: subjectsOf(xml) } : null, plan: p.plan || {}, text: xml }).join("\n  ")
  const v = newVerdict({ step: id, scope: "whole", round: 1, ok: !blockers, blockers, at: GRAPH })
  if (!v.ok) return v

  const abs = join(state.cwd, GRAPH)
  if (blockers) {
    if (existsSync(abs)) rmSync(abs)
    return put(state, { verdicts: [...state.verdicts, v.value] })
  }
  mkdirSync(dirname(abs), { recursive: true })      // пишется ПОСЛЕ решения принять
  writeFileSync(abs, xml)
  return put(state, {
    verdicts: [...state.verdicts, v.value],
    at: { ...state.at, appgraph: { path: GRAPH, sha1: sha1of(readFileSync(abs, "utf8")) } },
  })
}

// Сьюты и якоря читаются из СОБРАННОГО текста: судить надо тот документ, который ляжет, а не тот
// объект, из которого он получился, — иначе грамматика записи остаётся непроверенной.
const suitesOf = (xml) => [...String(xml).matchAll(/<suite\b[^>]*\bid="([^"]+)"/g)].map((m) => ({ id: m[1] }))
const subjectsOf = (xml) => [...String(xml).matchAll(/<subject\b[^>]*\bname="([^"]+)"/g)].map((m) => ({ name: m[1] }))
