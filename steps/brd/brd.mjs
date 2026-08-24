// MODULE_CONTRACT: brd — АРТЕФАКТ ШАГА 2 КАК ЗНАЧЕНИЕ: как он читается и что в тексте считается числом
// Purpose:    two decisions live here and nothing else. FIRST: how substep 2C's artifact is READ —
//             `R<n>`, `analogue`, `subjects[]` — so that every consumer judges ONE parse instead of
//             writing its own regular expression. SECOND: what counts as a NUMBER-AS-QUANTITY in a
//             text, which is provenance, and provenance is judged at step 6
//             (steps/intake/frd.mjs), not here.
// io:         none
// Invariants: pure and stateless — the result depends on the given text alone, never on history.
//             `R<n>` IS the row of `.agent/normalized.md` — number and text alike: the artifact is
//             assembled by a script (steps/brd/anchors/assemble.mjs), which copies the row whole.
//             So `statement` reads `verb | object | instrument | values`, and a consumer that wants
//             the columns splits it with steps/brd/normalize/normalize.mjs::parseRows — the one
//             place that knows what a row is.
// Interface:  numbersIn(text) -> Set<string>
//             parseBrd(text) -> { requirements, subjects, analogue }
//             analogueTerm(text) -> string
//
// ЧТО ОТСЮДА УШЛО И ПОЧЕМУ (тикет 03). Здесь жили `newFit`, `newRequirement`, `newSubjects`,
// `adviceFor` и `newBrd` — приёмка BRD со ОБЯЗАТЕЛЬНЫМИ `fit:` и `verify:` у каждого требования.
// Ворота их не пишут ПРИНЦИПИАЛЬНО: измеримый критерий собирает шаг 6, когда есть карта репозитория
// и ответы оператора, а на шаге 2 нет ни того ни другого — требовать критерий здесь значило требовать
// того, чего в артефакте быть не может (standards/guardrail.md: блокер, который нечем закрыть).
// Гардрейл ушёл вместе с ролью `gilb`, которая его писала; правило подшага одно — `anchors/judge/T4`.
//
// ЧТО ОТСЮДА УШЛО И ПОЧЕМУ (тикет A06, 23.08.2026). Поля `verdict` и `openQuestions` вместе со своими
// регулярками. Их разбирал ТОЛЬКО этот парсер, а судило снятое правило T1 — грeп по `steps/`, `ext/`,
// `core/`, `workflows/` не нашёл ни одного шага, который бы по значению ветвился. Обещание
// «`not-this-repo` останавливает полосу на входе» жило в `steps/brd/data-flow.md`, а не в коде, и
// строк этих в артефакте больше нет: его собирает скрипт из трёх частей — R-строки, `analogue:`,
// `subjects[]`.

// H1. A NUMBER IN A CRITERION MUST HAVE A SOURCE — the rule this function serves, at step 6.
//
// Only numeric literals are counted, and only where they stand as a quantity. A machine does not
// judge a criterion's meaning, but it does judge a number's provenance.
//
// FOUND BY A LIVE RUN: `numbersIn` did not tell a number-as-quantity from a digit inside a FORMAT
// DESIGNATION — `ISO-8601` read as the number 8601, demanded a source that exists in neither the task
// nor the answers, and the role was handed an `invented-default` for a format it never invented.
//
// THE RULE IN ONE SENTENCE: a number counts as a quantity only when it stands as a token of its own —
// it does not abut a letter directly or through a hyphen/slash, and it does not follow a word of ALL
// CAPITALS after exactly one space (a standard's designation: `RFC 3339`, `ISO 8601`). A unit suffix
// AFTER the number (`300ms`) does not spoil it: abutment is judged on the left only.
function isLetterCh(ch) {
  return !!ch && /\p{L}/u.test(ch)
}
// isDesignationDigit — the digit that starts a numbersIn match abuts a designation on its left rather
// than standing as a token of its own. Three shapes of abutment: directly against a letter ("base64",
// "p95"); through a hyphen or slash against a letter ("ISO-8601", "UTF-8", "SHA-256", "HTTP/2"); and
// through EXACTLY one space against a word of all capitals ("RFC 3339") — several spaces
// (`fit:    90 days`) do not count as this shape: between the word and the number there must be one
// single separator, not a form field.
function isDesignationDigit(s, start) {
  const before = s[start - 1]
  if (isLetterCh(before)) return true
  if ((before === "-" || before === "/") && isLetterCh(s[start - 2])) return true
  if (before === " " && s[start - 2] && s[start - 2] !== " " && isLetterCh(s[start - 2])) {
    let i = start - 2
    while (i > 0 && isLetterCh(s[i - 1])) i--
    const word = s.slice(i, start - 1)
    if (/^[A-ZА-ЯЁ]{2,}$/.test(word)) return true
  }
  return false
}

// FUNCTION_CONTRACT: numbersIn — a text's numbers-as-quantities, normalised for comparing provenance
//   Input:        text — raw text (an artifact, the task or an operator's answer)
//   Dependencies: isDesignationDigit
//   Antecedent:   ANY value — coerced with String(text || ""); total on its input
//   Consequent:   success: Set<string> — every match of /\d+(?:[.,]\d+)?/ MINUS the matches abutting
//                          a designation on the left; a comma becomes a dot and leading zeros are
//                          stripped; repeats collapse. "007" → "7", "1,5" → "1.5", "ISO-8601" → none,
//                          "300ms" → "300"
//                 failure: none — total
export function numbersIn(text) {
  // РЕГУЛЯРНОЕ ВЫРАЖЕНИЕ — НЕ ИСТОЧНИК ЧИСЕЛ. Внутри класса символов и квантора цифры описывают
  // ГРАММАТИКУ значения, а не его меру, и мерой их читать нельзя.
  //
  // BUG_FIX_CONTEXT: живой прогон eddi 19.08.2026. Роль написала домен ключа термина верно —
  //   `^[a-z0-9_]{1,64}$`, — а провенанс прочитал квантор `{1,64}` как ЧИСЛО «1.64» и класс `a-z0-9`
  //   как число «9». Блокер обвинил роль в значении, которого в артефакте нет: починить его нельзя
  //   ничем, кроме удаления правильной регулярки, — то есть правило создавало ТУПИК.
  //
  // Вырезаются ровно два места: `[…]` и `{…}`. Число в прозе («до 64 символов», «300ms») правило
  // видит по-прежнему.
  const s = String(text || "").replace(/\[[^\]\n]*\]/g, " ").replace(/\{[^}\n]*\}/g, " ")
  const out = new Set()
  for (const m of s.matchAll(/\d+(?:[.,]\d+)?/g)) {
    if (isDesignationDigit(s, m.index)) continue
    out.add(m[0].replace(",", ".").replace(/^0+(?=\d)/, ""))
  }
  return out
}

// FUNCTION_CONTRACT: analogueTerm — the greppable head of the `analogue:` line
//   Input:        text — the raw value of the line, or null
//   Dependencies: —
//   Antecedent:   any value
//   Consequent:   success: the term before the first separator, trimmed; "" for a declared absence
//                          (`none …`) and for nothing at all
//                 failure: none — total
//   Purity:       pure
//   Interface:    analogueTerm(text: unknown) -> string
//
// BUG_FIX_CONTEXT: eddi, the first run with this field. The role wrote
//   `analogue: Prompt Snippet (PromptSnippetService, eddi://ai.labs.snippet) — по образцу него …`
//   and step 3b searched the repository for that WHOLE STRING: no path contains it, the phase found
//   nothing, and the focus fell to 1 of the 10 files the change needs. The field was free text and
//   the consumer wanted a token.
export function analogueTerm(text) {
  const raw = String(text == null ? "" : text).trim()
  if (!raw || /^none\b/i.test(raw)) return ""
  return raw.split(/[—(,:]|\s+-\s+/)[0].trim()
}

// FUNCTION_CONTRACT: parseBrd — substep 2C's artifact read into fields
//   Input:        text — the raw bytes of `.agent/brd.md` (or of the staged draft)
//   Dependencies: —
//   Antecedent:   ANY value — coerced with String(text || "") and split into lines; total
//   Consequent:   success: { requirements: [{ id, statement, line }], subjects, analogue }
//                          · a line never seen → null, NOT "" and not [] — «строки нет» и «строка
//                            пуста» это разные находки разных правил (standards/code.md, ограничение 2);
//                          · `R<n> …` opens a requirement and becomes CURRENT; its `statement` is the
//                            row of `.agent/normalized.md` copied whole — `verb | object | instrument
//                            | values` — so `values` travels WITH the requirement and step 6 no longer
//                            has to match it up in a neighbouring file by meaning;
//                          · a following line that opens no service field is appended to the wording:
//                            the assembler writes one line per requirement, but a hand-written or an
//                            older document may wrap;
//                          · `subjects[]: …` splits on `·`/`,`/`;`, empties filtered out;
//                          · `line` is the 1-based number of the `R<n>` header — the address a repair
//                            order puts in front of the finding.
//                 failure: none — total on any input
export function parseBrd(text) {
  const lines = String(text || "").split("\n")
  const requirements = []
  let cur = null
  let subjects = null
  let analogue = null
  const service = /^\s*(R\d+|subjects|analogue)\b/i
  lines.forEach((line, i) => {
    const r = /^\s*(R\d+)\b[.:)\s]*(.*)$/.exec(line)
    if (r) { cur = { id: r[1], statement: r[2].trim(), line: i + 1 }; requirements.push(cur); return }
    const sub = /^\s*subjects\s*\[\s*\]\s*:\s*(.*)$/i.exec(line)
    if (sub) { subjects = sub[1].split(/[·,;]/).map((s) => s.trim()).filter(Boolean); return }
    const an = /^\s*analogue\s*:\s*(.*)$/i.exec(line)
    if (an) { analogue = an[1].trim(); return }
    // a wrapped line of the current requirement's wording
    if (cur && line.trim() && !service.test(line)) cur.statement = (cur.statement + " " + line.trim()).trim()
  })
  return { requirements, subjects, analogue }
}
