// MODULE_CONTRACT: branch — step 13's pure core: от какого транка и каким именем режется ветка
// Purpose:    one decision, and it is a JUDGEMENT, not an action: можно ли резать ветку прямо сейчас
//             и как она называется. Резать — работа io (ext/index.mjs::cutBranch), потому что ядро,
//             умеющее звать git, нельзя проверить без git.
//             PURE: knows no disk and no git; git приезжает СНИМКОМ ФАКТОВ.
// io:         none
// EXTERNAL_DEPENDENCY: steps/plan/plan.mjs::TASK_KEY — форма ключа задачи объявлена один раз, и
//             судит её тот же код, что проверяет ответ оператора на шаге 1. Две копии формы — это
//             ключ, который прошёл гейт и не прошёл ветку.
// Invariants: newBranch TOTAL — любой вход, включая undefined, даёт Result и никогда не бросает;
//             результат — функция входов, поэтому два вызова на одном снимке совпадают байт в байт.
// Interface:  newBranch({ gate, planText, git }) -> Result<Branch, refusal>

import { ok, err } from "../../core/result.mjs"
import { TASK_KEY } from "../plan/plan.mjs"

// Префикс ветки решает ВЕС изменения, и решает он его один раз — на шаге 7. `patch` значит, что все
// дельты были `Fixed`, то есть чинили дефект; всё остальное — функциональность.
const PREFIX = Object.freeze({ patch: "bugfix", minor: "feature", major: "feature" })

// FUNCTION_CONTRACT: newBranch — можно ли резать ветку, и как она называется
//   Input:        { gate, prior, planText, mode, git }
//                 prior    — разобранный .agent/branch.json прошлого прогона, или null
//                 gate     — разобранный .agent/gate1.json: { key, plan, answer }
//                 planText — текст task/<КЛЮЧ>/PLAN.md, того самого, что утверждали
//                 mode     — одно слово .agent/mode (вес по SemVer), решает префикс
//                 git      — снимок фактов: { dirtyPaths[], refs[], trunk, trunkSha, remote, planHash }
//                            dirtyPaths — ПУТИ, а не счётчик: что считать грязью, решает это ядро,
//                            потому что решение зависит от ключа задачи, а git о нём не знает
//   Dependencies: TASK_KEY, PREFIX
//   Antecedent:   любые значения — каждое отсутствие названо отказом, а не умолчанием
//   Consequent:   success: { name, base, baseSha, remote, key }
//                 failure: no-gate · plan-changed · dirty-worktree · no-trunk · branch-exists
//   Purity:       pure
//   Interface:    newBranch({ gate, planText, mode, git }) -> Result<Branch, refusal>
//
// ПЯТЬ ОТКАЗОВ, И НИ ОДНОГО КРУГА ПОЧИНКИ. Роли на шаге нет, чинить некому и нечего: занятое имя
// ветки и грязная рабочая копия — это состояние машины оператора, а не дефект артефакта. Поэтому
// каждый отказ терминальный и несёт улику, по которой человек чинит за минуту.
//
// `plan-changed` — самый важный из пяти и единственный неочевидный. Токен гейта несёт sha256 плана,
// который оператор ЧИТАЛ; если между гейтом и срезом план переписали, ветка отрезалась бы под работу,
// которую никто не утверждал. Это то же правило, которым гардрейл судит staging до промоута.
const str = (v) => (v === undefined || v === null ? "" : String(v))

export function newBranch({ gate = null, prior = null, planText = "", mode = "", git = null } = {}) {
  if (!gate || gate.answer !== "approve") {
    return err("no-gate", "плана без акцепта нет: .agent/gate1.json отсутствует либо не несёт approve — оператор ветку не разрешал")
  }
  const key = String(gate.key || "").trim()
  if (!TASK_KEY.test(key)) {
    return err("no-gate", `ключ задачи «${key}» не той формы — токен гейта повреждён, ветку назвать нечем`)
  }
  if (!gate.planHash || gate.planHash !== git?.planHash) {
    return err("plan-changed", `план изменился после акцепта: утверждали ${String(gate.planHash).slice(0, 12)}…, на диске ${String(git?.planHash).slice(0, 12)}… — покажи оператору новый план и утверди заново`)
  }
  if (!String(planText || "").trim()) {
    return err("plan-changed", `task/${key}/PLAN.md пуст — резать ветку под пустой план нельзя`)
  }
  // СВОЯ ПОСТАВКА — НЕ ЧУЖАЯ РАБОТА. `task/<КЛЮЧ>/` пишет шаг 9 за минуты до среза, и ветка режется
  // ПОД неё: она уедет на ветку вместе с работой, ради которой ветка и существует. Считать её грязью
  // — отказывать на собственном выходе, что и случилось на живом прогоне c87db886, где `?? task/`
  // было единственной строкой `git status`. Всё прочее остаётся терминальным отказом: чужие
  // незакоммиченные правки на рабочую ветку уезжать не должны.
  const mine = `task/${key}/`
  const dirt = git ? (git.dirtyPaths || []).filter((p) => p !== "task/" && !String(p).startsWith(mine)) : []
  if (!git || dirt.length) {
    return err("dirty-worktree", `рабочая копия грязная — ветка от неё унесёт чужие правки: ${dirt.slice(0, 5).join(", ")}${dirt.length > 5 ? ` и ещё ${dirt.length - 5}` : ""}; закоммить или спрячь их и перезапусти`)
  }
  if (!String(git.trunk || "").trim()) {
    return err("no-trunk", "транк не найден: ни origin/HEAD, ни локальных main/master — базу ветки взять неоткуда")
  }

  const name = `${PREFIX[String(mode || "").trim()] || "feature"}/${key}`

  // СВОЯ ВЕТКА — НЕ ЗАНЯТОЕ ИМЯ. Артефакт шага говорит, что эту ветку отрезал он сам; если она на
  // месте и HEAD стоит на ней, работа по ключу не «начата кем-то», а продолжается — резать нечего и
  // отказывать не в чем. Три условия вместе, потому что каждое по отдельности лжёт: рецепт без ветки
  // — след удалённой работы, ветка без рецепта — чужая, а рецепт с уехавшим HEAD означает, что
  // человек ушёл в другое место и молча возвращать его туда нельзя.
  //
  // BUG_FIX_CONTEXT: живой прогон c87db886. Ветка отрезана, .agent/branch.json на диске, стоим на
  // ней — и перезапуск отказал `branch-exists`. Тот же класс, что у гейта, не признававшего
  // собственный токен: артефакт шага есть РЕЦЕПТ, и предъявлять его должен тот, кто его выдал.
  if (prior && prior.name === name && (git.refs || []).includes(name) && git.head === name) {
    return ok(Object.freeze({ name, key, base: str(prior.base), baseSha: str(prior.baseSha), remote: prior.remote || null, kept: true }))
  }
  if ((git.refs || []).includes(name)) {
    return err("branch-exists", `ветка ${name} уже есть — работа по этому ключу начата; продолжай в ней либо удали её`)
  }

  return ok(Object.freeze({
    name,
    key,
    base: git.trunk,
    baseSha: git.trunkSha || "",
    remote: git.remote || null,
  }))
}
