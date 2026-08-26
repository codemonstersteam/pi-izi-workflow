// ШВЫ ПОЛОСЫ. Тикет T07. Голова юнитами не покрывается — её держат размер и эти три шва.
// Каждый сторожит дефект, который иначе ловится ТОЛЬКО живым прогоном, а один из трёх — ещё и
// дороже: он не ловится даже прогоном, потому что прогон не стартует.
import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { WORDS } from "./values.mjs"
import { ROLES } from "./roles.mjs"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const RAIL = join(ROOT, "workflows", "izi.js")
const rail = readFileSync(RAIL, "utf8")
const rel = (p) => p.replace(`${ROOT}/`, "")

// ШОВ ЧИТАЕТ КОД, А НЕ КОММЕНТАРИИ. В полосе комментарии ЦИТИРУЮТ сломанные формы — тем самым
// BUG_FIX_CONTEXT и полезен, — и шов, считающий цитату кодом, краснеет на объяснении дефекта вместо
// самого дефекта. Первая версия этого файла ровно так и сделала.
const code = rail
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
  .replace(/\/\*[^]*?\*\//g, "")

// Слова, которые полоса исполняет примитивом. Терминальные (done, err) она разбирает сама.
const primitives = () => [...code.matchAll(/^\s{2}(\w+):\s*\(i\)\s*=>/gm)].map(([, k]) => k)
const TERMINAL = ["done", "err"]

const stepModules = () => {
  const found = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith(".step.mjs")) found.push(p)
    }
  }
  walk(join(ROOT, "steps"))
  return found
}

// --- ШОВ 1: словарь инструкций, в обе стороны ------------------------------------------------------
test("шов словаря: ключи PRIMITIVES ⊆ словаря значений, и словарь ⊆ полоса + терминальные", () => {
  const keys = primitives()
  assert.ok(keys.length >= 4, `в полосе найдено ${keys.length} примитивов — разбор сломался, шов ослеп`)
  for (const k of keys) assert.ok(WORDS.includes(k), `полоса умеет «${k}», а конструктор инструкции такого слова не знает`)
  for (const w of WORDS) {
    assert.ok(keys.includes(w) || TERMINAL.includes(w),
      `слово «${w}» есть в словаре, но полоса его не исполняет и терминальным не считает — прогон встанет с «полоса такого не умеет»`)
  }
})

test("шов словаря: слово, которое эмитит модуль шага, полоса обязана знать", () => {
  const known = new Set([...primitives(), ...TERMINAL])
  for (const file of stepModules()) {
    const text = readFileSync(file, "utf8")
    for (const [, word] of text.matchAll(/\bdo:\s*"([a-z]+)"/g)) {
      assert.ok(known.has(word), `${file.replace(ROOT + "/", "")} просит «${word}», а полоса такого слова не знает`)
    }
  }
})

// --- ШОВ 2: рой литерален -------------------------------------------------------------------------
// Дефект, который этот шов ловит, УЖЕ был оплачен живым запуском: хост валидирует ИСХОДНИК полосы, и
// динамический parallel не даёт прогону стартовать вовсе — ни токенов, ни диагностики.
test("шов роя: у parallel первый аргумент — строковый литерал, второй — объектный", () => {
  const calls = [...code.matchAll(/parallel\(([^]{0,40})/g)]
  assert.ok(calls.length >= 1, "в полосе нет ни одного parallel — шов ослеп")
  for (const [, tail] of calls) {
    assert.match(tail, /^"[^"]+"\s*,\s*\{/,
      `parallel вызван не литералами: «${tail.trim().slice(0, 40)}…» — хост отвергнет ИСХОДНИК, прогон не стартует`)
  }
})

test("шов роя: ширина роя — литерал этого файла, а не значение из бюджета", () => {
  assert.match(code, /const SWARM = \d+;/, "ширина роя перестала быть литералом — рой из конфига здесь невозможен")
  const seats = [...code.matchAll(/s(\d+):\s*\(\)\s*=>/g)].length
  const width = Number(code.match(/const SWARM = (\d+);/)[1])
  assert.equal(seats, width, `слотов ${seats}, а SWARM = ${width} — рой молча уже или шире объявленного`)
})

// --- ШОВ 3: РЕЕСТР РОЛЕЙ СХОДИТСЯ С ДИСКОМ, С ХОСТОМ И С ШАГАМИ ------------------------------------
// Каталоги ролей ОБЪЯВЛЕНЫ (`ext/roles.mjs`), а не считаются обходом дерева, и объявление законно
// только вместе с этим швом — рукописный список однажды уже сгнил, указав на снесённый каталог.
// Правил шесть, и каждое сторожит дефект, который иначе стоит живого прогона либо самого запуска.
test("шов реестра ролей: объявленное лежит на диске, необъявленного на диске нет", () => {
  const dirOf = (id) => join(ROOT, "steps", id)
  const entries = Object.entries(ROLES)
  assert.ok(entries.length, "реестр пуст — шов ослеп")

  const declared = new Map()   // имя роли → каталог, где она объявлена
  for (const [id, names] of entries) {
    assert.ok(names.length, `шаг «${id}» объявлен в реестре без единой роли — строка ни о чём`)
    for (const name of names) {
      // 3. ИМЕНА УНИКАЛЬНЫ. Хост валит загрузку расширения на совпадении имён между его каталогами
      // (`Duplicate extension role`), и прогон не стартует вовсе — 24.08.2026 так и случилось на
      // трёх файлах `data-flow.md`. Здесь это ловится в `node --test`, до запуска pi.
      assert.ok(!declared.has(name),
        `роль «${name}» объявлена дважды: ${declared.get(name)} и ${id} — хост откажется грузить расширение`)
      declared.set(name, id)

      // 1. ОБЪЯВЛЕННОЕ ЕСТЬ НА ДИСКЕ. Прежний рукописный список пережил чистку и стал указывать на
      // снесённый каталог; хост сканирует каждый URL при регистрации и валит загрузку.
      const file = join(dirOf(id), `${name}.md`)
      assert.ok(existsSync(file), `реестр объявляет роль «${name}» шага «${id}», а файла ${rel(file)} нет`)
      const text = readFileSync(file, "utf8")
      assert.ok(text.startsWith("---\n"), `${rel(file)} без фронтматтера — это документ, а не роль`)
      const head = text.slice(4, text.indexOf("\n---", 4))

      // 5. СВОЙ СИСТЕМНЫЙ ПРОМПТ. Без `overrideSystemPrompt` хост приписывает к роли СВОЙ базовый
      // промпт — замер 21.08.2026: 1757 байт про «expert coding assistant» и инструменты pi перед
      // телом роли (улика: component-tests/steps/brd/1-normalize/host-system-prompt.21-08.txt).
      // Без `contextFiles: []` туда же едут AGENTS.md и CLAUDE.md проекта прогона.
      assert.match(head, /^overrideSystemPrompt: true$/m,
        `${rel(file)} без overrideSystemPrompt — хост припишет 1757 байт своего промпта`)
      assert.match(head, /^contextFiles: \[\]$/m,
        `${rel(file)} без contextFiles: [] — в промпт роли поедут AGENTS.md и CLAUDE.md проекта`)

      // 6. ТЕЛО НЕПУСТО. При overrideSystemPrompt пустое тело — это `system: ""`: роль, которая
      // ничего не говорит. Шов ловит забытое тело, а не замысел.
      const body = text.slice(text.indexOf("\n---", 4) + 4).trim()
      assert.ok(body.length > 40, `${rel(file)}: тело роли пусто — при overrideSystemPrompt это пустой system`)
    }

    // 2. НА ДИСКЕ НЕТ НЕОБЪЯВЛЕННОГО. Хост берёт из отданного каталога КАЖДЫЙ `.md`
    // (validation.ts::scanRoleFiles), поэтому документ, положенный рядом с ролью, становится ролью,
    // чьё тело — проектная записка. Документам место в каталоге, который реестр не объявляет.
    for (const e of readdirSync(dirOf(id), { withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith(".md")) continue
      // `-ru.md` — ОБЪЯВЛЕННЫЙ маркер перевода для вычитки человеком, тот же, что отсекает
      // `bin/install.mjs` при установке в проект. Шов его пропускает по двум причинам: перевод
      // никуда не едет, и `bin/install.test.mjs:26` подкладывает такой файл в дерево харнеса на
      // время своей проверки — `node --test` гоняет файлы параллельно, и строгое правило здесь
      // краснело бы от гонки, а не от дефекта.
      if (e.name.endsWith("-ru.md")) continue
      const name = e.name.replace(/\.md$/, "")
      assert.ok(names.includes(name),
        `${id}/${e.name} лежит в объявленном каталоге ролей, но ролью не объявлен — ` +
        `хост зарегистрирует его как роль «${name}». Документу здесь не место`)
    }
  }

  // 4. ИМЯ, КОТОРОЕ ЭМИТИТ ШАГ, ОБЪЯВЛЕНО ДЛЯ ЕГО ЖЕ ШАГА. Динамический `role: i.role` отключает
  // штатную проверку хоста UNKNOWN_AGENT_TYPE, и опечатка становится ошибкой середины прогона.
  // Берутся ВСЕ объявления модуля, а не первое: подшаг 2A зовёт две роли — `ROLE` на проходе
  // таблицы и `ROLE_CLEAN` на проходе чистки.
  let seen = 0
  for (const f of stepModules()) {
    const id = rel(f).replace(/^steps\//, "").replace(/\/[^/]+\.step\.mjs$/, "")
    for (const m of readFileSync(f, "utf8").matchAll(/^const ROLE[A-Z_]* = "([^"]+)"/gm)) {
      seen += 1
      assert.deepEqual({ role: m[1], at: declared.get(m[1]) }, { role: m[1], at: id },
        `${rel(f)} зовёт роль «${m[1]}», а реестр объявляет её для шага «${declared.get(m[1]) ?? "—"}»`)
    }
  }
  assert.ok(seen, "ни один шаг не объявил имени роли — шов ослеп")
})

// --- РАЗМЕР ГОЛОВЫ --------------------------------------------------------------------------------
test("голова без логики: не длиннее 90 строк КОДА, и каждое ветвление — звено ROP или словарь", () => {
  const lines = code.split("\n").filter((l) => l.trim())
  assert.ok(lines.length <= 90, `в голове ${lines.length} строк кода — логика шага утекла в полосу`)

  // Считать ВСЕ `if` бессмысленно: ROP-цепочка это и есть последовательность «шаг вернул err —
  // подними её непреобразованной», по звену на шаг. Логика головы — это ветвление, которое НЕ
  // является ни звеном цепочки, ни разбором слова инструкции, ни поиском примитива в словаре.
  const ROP = [
    /^if \((\w+)\.track === "err"\)\s*return \1;?$/,   // звено цепочки
    /^if \(halt\((\w+)\)\)\s*return \1;?$/,               // звено цепочки, widened: err ИЛИ stopped
    // (станция stop-after, замер 26.08: без остановки цепочка шла дальше при ok({stopped}))
    /^if \((\w+)\.stopped\)\s*return \1;?$/,              // то же — раскрытым условием
    /^if \((\w+)\.track === "err" \|\| \1\.stopped\)\s*return \1;?$/,   // то же — одним условием
    /^if \(it\.do === "(done|err)"\)/,                    // терминальное слово
    /^if \(!primitive\)/,                                  // слова нет в словаре
    /^if \(folded\.track === "err"\)/,                     // отказ fold поднимается, а не рушит state
    /^if \(HOST\.some/,                                    // адаптер края
  ]
  const own = [...code.matchAll(/\bif \([^\n]*/g)]
    .map(([m]) => m.replace(/\s+/g, " ").trim())
    .filter((m) => !ROP.some((r) => r.test(m)))
  assert.deepEqual(own, [], `в голове есть ветвления сверх цепочки и словаря — голова начала решать:\n  ${own.join("\n  ")}`)
})
