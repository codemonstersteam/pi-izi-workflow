// MODULE_CONTRACT: cut — io-труба подшага 3A: дерево → план клеток + факты скрипта
// Purpose:    одно решение: ЧТО читается с диска и что из этого вычисляется. Обход, отпечатки,
//             источник для рёбер и сама резка — здесь; решение о форме клетки — в plan.core.mjs (pure).
// io:         fs
// EXTERNAL_DEPENDENCY: steps/scope/skip.mjs — граница графа; steps/scope/source.mjs::readSource —
//             вычислимые факты файла; steps/scope/computed.mjs — рёбра/маршруты/драйверы скриптом;
//             steps/brd/brd.mjs::parseBrd — предметы из артефакта шага 2; ext/state.mjs::sha1of.
// Invariants: ТОТАЛЕН — диск отвечает { why }, а не исключением; путь хребта — имя ЭКОСИСТЕМЫ,
//             перенесено из старой полосы (a097091:ext/index.mjs::SPINE) без изменения списка;
//             ни одно совпадение → клетки-хребта нет, и это ДАННЫЕ, а не отказ.
// Interface: HARNESS_INPUTS, SPINE, walk, planOf
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { ok, err } from "../../../core/result.mjs"
import { sha1of } from "../../../ext/state.mjs"
import { skipDir, skipFile } from "../skip.mjs"
import { readSource } from "../source.mjs"
import { newComputed, computedXml } from "../computed.mjs"
import { newPlan } from "./plan.core.mjs"
import { parseBrd } from "../../brd/brd.mjs"
import { ANCHORS, BRD } from "../paths.mjs"

// ХАРНЕС-ВХОДЫ — конвейер, а не приложение (skip.mjs, EXTERNAL_DEPENDENCY): их пропускает walk.
export const HARNESS_INPUTS = new Set(["TASK.md", "izi.config.json"])

// SPINE — хребет: где живут ответы на вопросы графа (сборка, тесты, переключатели, ветвление).
// ИМЕНА ЭКОСИСТЕМ, не раскладка конкретного репозитория; ни одно не совпало → клетки-хребта нет.
export const SPINE = [/^pom\.xml$/, /^build\.gradle(\.kts)?$/, /^settings\.gradle(\.kts)?$/, /^gradle\.properties$/,
                      /^package\.json$/, /^go\.mod$/, /^Makefile$/, /^pyproject\.toml$/,
                      /resources\/application\.[^/]+$/, /(^|\/)\.env/, /(^|\/)config\//,
                      /^\.github\/workflows\//, /^\.gitlab-ci\.yml$/, /^Jenkinsfile$/,
                      /^README/i, /^CONTRIBUTING/i]

const MAX_BYTES = 512 * 1024   // та же граница чтения, что у шага 2 (hits.mjs)

// FUNCTION_CONTRACT: walk — дерево проекта по границе пропуска
//   Consequent:   success: [{ path, bytes }] — пути со слэшем, относительные к корню ПРОГОНА
//   Purity:       io (fs); симлинк/сокет — не файл проекта, крупнее MAX_BYTES — не читаем вовсе
export function walk(root, rel = "", out = []) {
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    const path = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      if (skipDir(e.name)) continue
      walk(root, path, out)
      continue
    }
    if (!e.isFile()) continue
    if (skipFile(path, HARNESS_INPUTS)) continue
    const bytes = statSync(join(root, path)).size
    if (bytes > MAX_BYTES) continue
    out.push({ path, bytes })
  }
  return out
}

// FUNCTION_CONTRACT: planOf — план клеток и факты скрипта по дереву и артефактам шага 2
//   Input:        state — cwd прогона
//   Antecedent:   суд входа (inputs.mjs) уже зелёный: brd.md по отпечатку, anchors.json разбирается
//   Consequent:   success: { plan: Plan, planJson, computedXml, cells, files } — план клеток,
//                          сериализованный план и computed-факт для graph-computed.xml
//                 failure: err с именем — пустое дерево, неотделимый план
//   Purity:       io (fs)
export function planOf(state) {
  const files = walk(state.cwd)
  if (!files.length) return err("no-tree", "дерево проекта пусто по границе пропуска — картировать нечего")

  const brd = readFileSync(join(state.cwd, BRD), "utf8")
  const subjects = parseBrd(brd).subjects || []
  const spread = JSON.parse(readFileSync(join(state.cwd, ANCHORS), "utf8"))
  const marked = Array.isArray(spread.marked) ? spread.marked : []
  const markedSet = new Set(marked)

  // отпечаток каждого файла — ключ кэша частей (cache.mjs): считается ЗДЕСЬ, один раз на прогон
  const withText = []
  for (const f of files) {
    const text = readFileSync(join(state.cwd, f.path), "utf8")
    withText.push({ ...f, sha1: sha1of(text), text })
  }
  const sources = withText.map((f) => readSource({ path: f.path, text: f.text }))
  const goModule = (withText.find((f) => f.path === "go.mod") || {}).text || ""
  const computed = newComputed({ sources, paths: withText.map((f) => f.path), goModule })

  // ЯКОРЯ НА ФАЙЛ — ИЗ АРТЕФАКТА ШАГА 2, ПОСЛОВНО: карта обхода уже посчитана грепом по тексту
  // (шаг 2D), пересчитывать её здесь — расходиться с ней в числах (шов S2 в ext/design.test.mjs).
  const filesOf = new Map((spread.anchors || []).map((a) => [a && a.word, new Set((a || {}).files || [])]))
  const spine = withText.filter((f) => SPINE.some((re) => re.test(f.path))).map((f) => ({ path: f.path, bytes: f.bytes }))
  const rest = withText.map((f) => {
    const hit = markedSet.has(f.path)
      ? subjects.filter((s) => (filesOf.get(s) || new Set()).has(f.path))
      : []
    return { path: f.path, bytes: f.bytes, sha1: f.sha1, subjects: hit }
  })
  const plan = newPlan({ files: rest, spine, subjects, marked })
  if (!plan.ok) return err("no-plan", plan.error.detail)

  const planJson = `${JSON.stringify(plan.value, null, 2)}\n`
  return ok({ plan: plan.value, planJson, xml: computedXml(computed), cells: plan.value.cells.length, files: plan.value.files })
}
