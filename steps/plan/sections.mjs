// MODULE_CONTRACT: sections — ЧТЕНИЕ ФОРМАТА ПЛАНА, и только оно
// Purpose:    один разбор документа плана на разделы: раздел на модуль, у раздела известные ключи.
//             Пишет план один, а читают его трое — нарезка тикетов (шаг 14), критик плана и гейт, —
//             и второй разбор того же текста означал бы, что зелёный план несёт очередь, которую
//             никто не собирает.
// io:         none
// Invariants: заголовок становится разделом, только если называет ПУТЬ; ключ раздела — из словаря
//             SECTION_KEYS; отсутствующая строка `calls:` отличается от строки со словом `none`.
// Interface:  SECTION_KEYS, sectionsOf, fitsMatch
//
// ОТКУДА ЭТОТ ФАЙЛ. Выделен из steps/design/card.mjs 21.08.2026, когда шаг 9 переписывался на два
// отношения (docs/plan.md). Карточка партии и её гардрейл удалены целиком; эти три вещи —
// не про написание карточки, а про ЧТЕНИЕ готового плана, и переживают переделку.

// КЛЮЧИ АНГЛИЙСКИЕ, ПОТОМУ ЧТО ИХ ЧИТАЕТ ИСПОЛНИТЕЛЬ. Тело раздела уезжает в наряд ДОСЛОВНОЙ
// вырезкой (steps/tickets/tickets.mjs::ticketText), а наряд исполняет слабая модель, пишущая код в
// английском репозитории. Кириллический ключ в её заказе — заголовок, на который она не может
// действовать; граница языка полосы проходит по FRD, и всё ниже него говорит на языке репозитория.
//
// `declares` — единственный ключ, которого не было до этого решения. Объявление модуля (пакет,
// аннотации, `class X extends Y implements Z`) жило ПРОЗОЙ внутри `sample`, и слабая модель угадывала
// базовый класс: живой счёт — файл на Spring Boot в проекте на Quarkus, дважды.
export const SECTION_KEYS = Object.freeze([
  "what", "fields", "signatures", "declares", "calls", "sample", "closes", "verify",
])

// A HEADING IS A FILE SECTION WHEN IT NAMES A PATH. Prose the role adds of its own accord is not a
// defect: a live run closed a contract with a `## Сводка:` heading and the rule read it as a
// decision about a file named «Сводка:».
const isPath = (x) => x.includes("/") || /\.[A-Za-z0-9]+$/.test(x)

// sectionsOf — the ONE parse of a partition's plan: a section per module, with its body.
// Two readers — the guardrail below and the assembly of `PLAN.md` (steps/design-data-flow.md ⑧) —
// and a second cut of the same text is how a plan judged green could carry an order nobody builds.
export function sectionsOf(text = "") {
  const src = String(text || "")
  const out = []
  const heads = [...src.matchAll(/^##\s+(\S+)[^\n]*$/gm)]
  for (const [k, h] of heads.entries()) {
    const path = h[1].trim()
    if (!isPath(path)) continue
    const from = h.index + h[0].length
    const to = k + 1 < heads.length ? heads[k + 1].index : src.length
    const body = src.slice(from, to)
    const calls = [...body.matchAll(/^\s*calls:\s*([^\n]*)$/gm)].map((m) => m[1])
    out.push(Object.freeze({
      path,
      body,
      // The declared calls: paths only. `none` is a legal answer and yields an empty list — what is
      // NOT legal is the line missing altogether, because then the order of work has no operand
      // (measured: 8 sections of a live contract declared 2 edges, the rest was prose).
      says: calls.length > 0,
      calls: Object.freeze([...new Set(calls.join(" ").match(/[\w./-]+\.[A-Za-z0-9]+/g) || [])]),
      checks: /^\s*verify:\s*\S/m.test(body),
      // The declaration a module opens with: package, annotations, `class X extends Y implements Z`.
      // Its ABSENCE is what the guardrail judges — the text itself is a verbatim cut for the ticket.
      declares: /^\s*declares:\s*\S/m.test(body),
      // `step 2a` is written the one way now: the number is taken AS WRITTEN and phase ⑥ compares it
      // with the FRD (steps/design/plandoc.mjs). While the card was Russian both alphabets were
      // observed for `2а` in ONE file of run e79a460e; an English card has one alphabet to write it in.
      closes: Object.freeze([...body.matchAll(/(UC\d+)\s+step\s+([^\s·,;]+)/g)].map((m) => `${m[1]}/${m[2]}`)),
      ucs: Object.freeze([...new Set([...body.matchAll(/\bUC\d+\b/g)].map((m) => m[0]))]),
    }))
  }
  return Object.freeze(out)
}

// ШАБЛОН ИМЕНИ ТЕСТА — ОДИН ПРИМИТИВ НА ВСЮ ПОЛОСУ. `<suite match>` карты (`*Test.java`,
// `test_*.py`, `*_spec.rb`) говорит, где у имени фиксированная часть; расширение отбрасывается,
// потому что сравнивается ИМЯ КЛАССА, а не файл. Судят по нему двое: шаг 9 (строка «verify»
// раздела, здесь) и шаг 14 (класс наряда, steps/tickets/tickets.mjs, правило 15) — одно правило,
// одно место, как требует standards/code.md.
export function fitsMatch(name, match) {
  const [head = "", tail = ""] = String(match || "*").split("*")
  const base = String(name || "")
  const end = tail.replace(/\.[^.]+$/, "")
  return base.startsWith(head) && base.endsWith(end) && base.length >= head.length + end.length
}
