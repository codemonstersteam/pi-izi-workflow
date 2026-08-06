#!/usr/bin/env node
// MODULE_CONTRACT: answer.mjs — записывает ответ оператора в .agent/answers.md по ключу вопроса
// Purpose:    одно решение — answer_cmd печатает роль в своём конверте, ОТВЕЧАЕТ на него эта
//             команда, а не оператор вручную: формат и накопление держит код, а не аккуратность
//             человека, и правило invented-default сверяет числа именно с этим файлом
// io:         fs
// Invariants: answers.md только растёт — предыдущие записи не переписываются и не теряются;
//             одна и та же пара (вопрос, ответ) не попадает в файл дважды подряд
// Interface:  — (нет экспорта: CLI труба, 0 токенов, io поверх bin/decisions-log.mjs)
//
// Перенос izi-flow-v2/bin/answer.mjs 1:1 (PLAN.md §3, задача S3), с одним отличием от донора:
// журнал .agent/decisions.log пишется через bin/decisions-log.mjs, а не core/log.mjs — core/*.mjs
// в этой полосе не в зоне S3 (см. bin/decisions-log.mjs MODULE_CONTRACT), а не потому что формат
// изменился: строка журнала байт-в-байт того же вида.
//
//   node bin/answer.mjs --q="предел размера ответа?" --text="20"
//
// Команду печатает САМА роль в поле `answer_cmd` своего конверта, роутер её исполняет. Почему не
// «оператор допишет файл руками»: формат тогда держится аккуратностью человека, связь вопрос→ответ
// теряется, а правило `invented-default` сверяет числа именно с этим файлом — опечатка оператора
// превращается в красный чек роли.
//
// Ключ `--q=` ЗДЕСЬ НЕ сверяется с заданным вопросом — эту проверку делает разбор конверта роли
// (`answer-cmd-key-mismatch`, донор F5). Дублировать её тут значило бы держать одно требование в
// двух местах — а они однажды разойдутся.
//
// S13: запись на диск (mkdir/read/dedupe/write) переехала в bin/write-answer.mjs — второй вызывающий
// появился (ext/index.mjs::izi_answer, tool-вызов ассистента из фонового чекпоинта), и правило
// «повтор того же (вопрос, ответ) не дублируется» не может жить в двух копиях. Эта команда — CLI-
// оболочка того же правила, не вторая его реализация.

import { appendDecision } from "./decisions-log.mjs"
import { looksLikeTemplate } from "../core/answers.mjs"
import { writeAnswer } from "./write-answer.mjs"

const args = process.argv.slice(2)
const opt = (n) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : "" }
const ROOT = opt("root") || process.cwd()
const Q = opt("q")
const TEXT = opt("text")

if (!Q || !TEXT) { console.error('usage: answer.mjs --q="<вопрос>" --text="<ответ>"'); process.exit(2) }
// Шаблон из примера роли, попавший в файл дословно, — не ответ. Это тот же класс, что «модель
// скопировала форму вместо значения»: дальше он молча станет источником числа для fit.
if (looksLikeTemplate(TEXT)) { console.error("✗ ответ выглядит шаблоном, а не ответом оператора"); process.exit(2) }

// Накопительно: ответы прошлых обменов остаются, иначе роль потеряет их при следующем вопросе.
const written = writeAnswer(ROOT, { question: Q, text: TEXT })
if (!written.written) { console.log("✓ ответ уже записан"); process.exit(0) }
console.log(`✓ .agent/answers.md: ${written.count} ответов`)

// Журнал — след, а не гейт (F2): пишем ТОЛЬКО когда ответ реально дописан — дубликат выше уже
// остановил процесс раньше, и повторной строки в журнале не будет. "_answer" — не id шага:
// answer_cmd протоколом несёт только вопрос и ответ, шаг, которому вопрос принадлежит, в его форме
// не передаётся (standards/workflow.md, operator channel). actor=izi, как и в остальных точках
// перехода — команду исполняет роутер, хоть значение и принёс оператор.
try {
  appendDecision(ROOT, { step: "_answer", actor: "izi", note: `ответ оператора записан по ключу «${Q}»` })
} catch { /* журнал — след, не гейт: сбой записи не должен ронять answer.mjs */ }
