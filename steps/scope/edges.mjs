// MODULE_CONTRACT: edges — рёбра графа, посчитанные скриптом, а не выданные ролью
// Purpose:    одно решение — как строка импорта превращается в путь файла ЭТОГО репозитория.
//             ЧИСТОЕ: диска не знает, тексты читает ext/index.mjs, факты из них добывает
//             steps/scope/source.mjs, а здесь их сопоставляют с индексом путей плана.
// io:         none
// EXTERNAL_DEPENDENCY: steps/scope/source.mjs — форма `imports` (`spec`/`via`/`kind`) и признак
//             `rules`. Импорт языка без правил сюда доезжает с `rules: false` и попадает в
//             `langs`, а не в тишину.
// Invariants: newEdges тотальна; ребро существует, только если его цель ЕСТЬ в индексе — библиотека
//             и фреймворк не резолвятся и рёбрами не становятся без единого правила о них; два
//             кандидата на один импорт — ОТКАЗ с уликой (`ambiguous`), а не выбор наугад; рёбра
//             дедуплицированы по паре (from,to) и не бывают петлями.
// Interface:  newEdges({ sources, paths, goModule }) -> { edges, langs, ambiguous }
//
// BUG_FIX_CONTEXT: три живых прогона одного измерения — 6e3b9455 (фреймворковые импорты стали
//   рёбрами), c9580ff8 (ребро наоборот, цикл Fruit ↔ FruitResource), 337b957f (все 17 модулей
//   `deps="none"`, рёбер ноль). Роль выбирает самый дешёвый зелёный ответ, и каждое новое требование
//   к ней только меняет, какой ответ дешевле: улика `via` сделала ребро дороже молчания, и рёбра
//   исчезли совсем. Направление, цитата и принадлежность репозиторию ВЫЧИСЛИМЫ — значит вычисляются
//   (backlog W4b). Роли осталось то, где дешёвого ответа нет.

// PATH_EXTS — чем достраивается импорт без расширения в ts/js. Порядок — порядок предпочтения.
const PATH_EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]
const INDEX_FILES = PATH_EXTS.map((e) => `/index${e}`)

const dirOf = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "")

// normalize — свернуть `a/b/../c` и `./`. Импорты пишут относительными путями, а индекс держит
// нормализованные: несвёрнутый путь не найдётся, и ребро молча исчезнет.
function normalize(path) {
  const out = []
  for (const seg of path.split("/")) {
    if (!seg || seg === ".") continue
    if (seg === "..") { out.pop(); continue }
    out.push(seg)
  }
  return out.join("/")
}

// index — то, чем сопоставляются импорты: множество путей и раскладка по базовому имени (иначе
// суффиксный поиск java/python пришлось бы делать перебором всего дерева на каждый импорт).
function makeIndex(paths) {
  const all = new Set(paths)
  const byName = new Map()
  const byDir = new Map()
  for (const p of paths) {
    const name = p.slice(p.lastIndexOf("/") + 1)
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name).push(p)
    const d = dirOf(p)
    if (!byDir.has(d)) byDir.set(d, [])
    byDir.get(d).push(p)
  }
  return { all, byName, byDir }
}

// suffixMatches — все файлы, чей путь ЗАКАНЧИВАЕТСЯ данным относительным путём. Это и есть правило
// java («пакет = каталог») и python («модуль = файл»): точное соответствие полного пакета, а не
// догадка по базовому имени. Два совпадения — реальный случай монорепо (`moduleA/.../Fruit.java` и
// `moduleB/.../Fruit.java`), и он обязан кончиться отказом.
function suffixMatches(index, rel) {
  const name = rel.slice(rel.lastIndexOf("/") + 1)
  return (index.byName.get(name) || []).filter((p) => p === rel || p.endsWith(`/${rel}`))
}

// resolve — кандидаты одного импорта. Возвращает МАССИВ: пусто — не наш файл (библиотека, фреймворк,
// stdlib), один — ребро, больше одного — отказ с уликой.
function resolve({ imp, src, index, goModule }) {
  const { spec, kind } = imp
  if (kind === "wildcard") return []                          // `import org.acme.*` — целый пакет, не файл

  if (src.lang === "java") {
    if (kind === "same-package") {
      // Своё имя — не ссылка. Java требует, чтобы публичный тип звался как файл, поэтому имя типа
      // встречается в его же тексте всегда. БЕЗ этой строки два `Model.java` в разных модулях
      // монорепо получают ребро друг на друга: собственный путь отфильтровался как петля, и остался
      // ровно один «кандидат» — чужой файл. Поймано юнитом, не живым прогоном.
      const own = src.path.slice(src.path.lastIndexOf("/") + 1).replace(/\.[^.]*$/, "")
      if (spec === own) return []
      const cand = `${src.pkg ? `${src.pkg.split(".").join("/")}/` : ""}${spec}.java`
      const hits = suffixMatches(index, cand)
      // Пакет мог не совпасть с каталогом (или его вовсе нет) — тогда сосед по КАТАЛОГУ, и это
      // единственный случай, когда базовое имя используется без пакета: каталог уже сузил область.
      return hits.length ? hits : (index.byDir.get(dirOf(src.path)) || []).filter((p) => p.endsWith(`/${spec}.java`))
    }
    const parts = spec.split(".")
    for (let cut = parts.length; cut > 0; cut--) {            // `org.acme.Fruit.CONST` → `org.acme.Fruit`
      const hits = suffixMatches(index, `${parts.slice(0, cut).join("/")}.java`)
      if (hits.length) return hits
    }
    return []
  }

  if (src.lang === "go") {
    // `module` из go.mod — единственное, что превращает путь импорта в каталог этого репозитория.
    // Без него ни одно ребро go не вычислимо, и это состояние ОБЪЯВЛЯЕТСЯ (langs ниже), а не молчит.
    if (!goModule || !(spec === goModule || spec.startsWith(`${goModule}/`))) return []
    const dir = spec === goModule ? "" : spec.slice(goModule.length + 1)
    // Импорт go указывает на ПАКЕТ, то есть на каталог: ребро идёт в каждый его файл. Свернёт их
    // до одного модуль→модуль шаг 5; терять здесь нечего, а выбирать один файл из пакета не на чем.
    return (index.byDir.get(dir) || []).filter((p) => p.endsWith(".go") && !p.endsWith("_test.go"))
  }

  if (src.lang === "ts") {
    if (kind !== "path") return []                            // пакет из node_modules — не наш файл
    const base = normalize(`${dirOf(src.path)}/${spec}`)
    for (const cand of [base, ...PATH_EXTS.map((e) => base + e), ...INDEX_FILES.map((i) => base + i)]) {
      if (index.all.has(cand)) return [cand]
    }
    return []
  }

  if (src.lang === "py") {
    if (kind === "path") {                                    // `from .ledger import post` / `from .. import x`
      const up = spec.match(/^\.+/)[0].length
      const rest = spec.slice(up).split(".").filter(Boolean).join("/")
      const base = normalize(`${dirOf(src.path)}${"/..".repeat(up - 1)}/${rest}`)
      return [`${base}.py`, `${base}/__init__.py`].filter((c) => index.all.has(c))
    }
    const rel = spec.split(".").join("/")
    const hits = [...suffixMatches(index, `${rel}.py`), ...suffixMatches(index, `${rel}/__init__.py`)]
    return hits
  }

  return []
}

// FUNCTION_CONTRACT: newEdges — рёбра репозитория из фактов его файлов
//   Input:        { sources, paths, goModule }
//                 sources — [Source] от steps/scope/source.mjs, по одному на файл
//                 paths — ВСЕ пути репозитория (индекс целей); шире, чем sources: цель ребра может
//                         лежать в клетке, которую никто ещё не читал
//                 goModule — `module` из go.mod, или "" — тогда рёбра go необъявляемы, и это в langs
//   Dependencies: makeIndex, resolve
//   Antecedent:   любые значения; отсутствующие читаются как пустые
//   Consequent:   success: { edges, langs, ambiguous }
//                          edges — [{ from, to, via }], без петель и без повторов пары (from,to);
//                          langs — [{ lang, rules, files }] по всем встреченным языкам, ВКЛЮЧАЯ те,
//                                  у которых правил нет: «рёбер ноль» и «правил нет» обязаны
//                                  различаться в графе, иначе баг 337b957f переезжает на скрипт;
//                          ambiguous — [{ from, spec, candidates }]: импорт, у которого целей больше
//                                  одной. Отказ объявлен, потому что выбор наугад неотличим от факта
//                 failure: нет — тотальна
//   Purity:       pure
//   Interface:    newEdges({ sources, paths, goModule }) -> { edges, langs, ambiguous }
export function newEdges({ sources = [], paths = [], goModule = "" } = {}) {
  const index = makeIndex(paths)
  const edges = []
  const seen = new Set()
  const ambiguous = []
  const langs = new Map()

  for (const src of sources) {
    const lang = src.lang || "(unknown)"
    if (!langs.has(lang)) langs.set(lang, { lang, rules: Boolean(src.rules), files: 0 })
    langs.get(lang).files += 1
    if (!src.rules) continue

    for (const imp of src.imports) {
      const hits = resolve({ imp, src, index, goModule }).filter((p) => p !== src.path)
      if (!hits.length) continue                              // библиотека, фреймворк, stdlib — не ребро
      if (hits.length > 1 && src.lang !== "go") {             // go: пакет — это каталог, много файлов норма
        // Один и тот же неразрешимый набор целей приезжает дважды — из импорта и из ссылки на тип в
        // теле; это ОДИН отказ, а не два, и читателю списка нужен он один.
        const k = `${src.path}|${hits.join(" ")}`
        if (!seen.has(k)) { seen.add(k); ambiguous.push({ from: src.path, spec: imp.spec, candidates: hits.slice(0, 8) }) }
        continue
      }
      for (const to of hits) {
        const k = `${src.path} ${to}`
        if (seen.has(k)) continue
        seen.add(k)
        edges.push({ from: src.path, to, via: imp.via })
      }
    }
  }

  // Go без go.mod — не «рёбер нет», а «правило неприменимо». Помечаем прямо в объявлении языка.
  const goRow = langs.get("go")
  if (goRow && !goModule) goRow.rules = false

  return {
    edges,
    langs: [...langs.values()].sort((a, b) => a.lang.localeCompare(b.lang)),
    ambiguous,
  }
}
