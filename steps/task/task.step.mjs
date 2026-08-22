// MODULE_CONTRACT: шаг 1 — ключ задачи. Голова над своей пятёркой, ВЫРОЖДЕННОЙ до inputs+cut+judge.
// Purpose:    одно решение спрятано здесь: годится ли вход конвейера и как зовётся эта работа.
// io:         fs (через пятёрку)
// EXTERNAL_DEPENDENCY: ext/state.mjs::put — состояние строится только конструктором;
//             ext/values.mjs — конструктор вердикта.
// Invariants: РОЛИ НЕТ. Ни одной инструкции к модели: next сразу говорит done либо err. Вырожденная
//             пятёрка — законный частный случай формы (standards/workflow-design.md, $START_SHAPE).
// Interface:  id, next, fold
import { ok, err } from "../../core/result.mjs"
import { put, sha1of } from "../../ext/state.mjs"
import { verdict as newVerdict } from "../../ext/values.mjs"
import { inputs } from "./inputs.mjs"
import { judgeTask } from "./judge.mjs"
import { keyOf, KEY_QUESTION, readAt, TASK_KEY } from "./cut.mjs"
import { TASK } from "./paths.mjs"

export const id = "task"

// FUNCTION_CONTRACT: next — ЧТО делать дальше
//   Dependencies: inputs, judgeTask, keyOf
//   Antecedent:   — (тотальна)
//   Consequent:   success: done · err · say · ask — но НИКОГДА role: модели на этом шаге нет
//   Purity:       io (читает TASK.md и ответы оператора; ничего не пишет)
export function next(state) {
  // ОТКАЗ НЕСЁТ КЛАСС. По нему сценарий компонентного теста находит свою ветвь, а шов считает, что
  // ни одна ветвь не осталась без сценария. Текст читает человек, класс — машина.
  const bad = inputs(state)
  if (bad) return { do: "err", code: "blocked", cls: bad.cls, subject: bad.why }
  if (state.key) return { do: "done", state }

  const found = judgeTask({ text: readAt(state.cwd, TASK) })
  if (found.length) {
    return { do: "err", code: "blocked", cls: found[0].cls, subject: found.map((f) => f.text).join("\n  ") }
  }

  // КЛЮЧ СПРАШИВАЕТСЯ ЗДЕСЬ, В ПЕРВОМ ЖЕ ШАГЕ, а не в середине полосы: им зовутся ветка, тикет и
  // каталог плана, которые полоса создаёт много позже. Один вопрос на старте дешевле прерывания
  // посередине.
  // ВОПРОС, УЖЕ ОТКРЫТЫЙ, ПОВТОРЯЕТСЯ ИЗ СОСТОЯНИЯ, а не собирается заново: его имя уникально по
  // ходу, и пересобрать его здесь значит выдать старое имя.
  if (state.question) {
    return { do: "ask", name: state.question.name, prompt: KEY_QUESTION, items: state.question.items }
  }
  const key = keyOf(state)
  if (!key) {
    return { do: "ask", name: `task-q${state.asked + 1}`, prompt: KEY_QUESTION, items: [KEY_QUESTION] }
  }
  return { do: "say", line: `task: ключ ${key}, вход ${readAt(state.cwd, TASK).split("\n").length} строк — скрипт, 0 токенов`, key }
}

// FUNCTION_CONTRACT: fold — куда кладётся результат
//   Antecedent:   event несёт слово хода
//   Consequent:   success: Result.ok(состояние с ключом и вердиктом); failure: Result.err
//   Purity:       io
export function fold(state, event = {}) {
  const it = event.instruction || {}
  if (event.do === "ask") {
    // `approved` — БАРЬЕР НАД ФАКТОМ: ответ ищется на диске, а не предполагается по нажатию.
    const key = keyOf(state)
    if (key) return put(state, { key, question: null })

    // ПЕРЕСПРОС ИДЁТ ПОД НОВЫМ ИМЕНЕМ.
    // BUG_FIX_CONTEXT: первая версия сохраняла имя прошлой паузы. Хост ключует паузу по ИМЕНИ, и два
    // хода под одним именем — это ОДНА пауза: второго вопроса оператор не видит никогда, а шаг
    // считает круги переспросов, которых для человека не было (izi.js:317-320). Поймано шестым
    // шестым сценарием компонентного теста — тем, которого в нём не было, пока формула его не потребовала.
    const asked = state.asked + 1
    const retry = (state.question ? state.question.retry : 0) + 1
    if (retry > state.budgets.checkpointRetries) {
      return err("fold", `оператор ${retry - 1} раз ответил не ключом — форма ключа ${TASK_KEY.source}; шаг дальше не идёт`)
    }
    return put(state, { asked, question: { of: "", name: `task-q${asked}-retry${retry}`, items: it.items, retry } })
  }
  if (event.do !== "say") return err("fold", `шаг ${id} не знает, что делать с событием «${event.do}»`)

  const text = readAt(state.cwd, TASK)
  const blockers = judgeTask({ text }).map((f) => f.text).join("\n  ")
  const v = newVerdict({ step: id, scope: "whole", round: 1, ok: !blockers, blockers, at: TASK })
  if (!v.ok) return v
  if (blockers) return put(state, { verdicts: [...state.verdicts, v.value] })

  // Артефакта-файла у шага нет: ключ едет В СОСТОЯНИИ. Отпечаток входа кладётся всё равно — по нему
  // следующий шаг узнает, что TASK.md с тех пор не правили.
  return put(state, {
    key: it.key || keyOf(state),
    verdicts: [...state.verdicts, v.value],
    at: { ...state.at, task: { path: TASK, sha1: sha1of(text) } },
  })
}
