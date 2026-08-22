// ШВЫ ПОЛОСЫ. Тикет T07. Голова юнитами не покрывается — её держат размер и эти три шва.
// Каждый сторожит дефект, который иначе ловится ТОЛЬКО живым прогоном, а один из трёх — ещё и
// дороже: он не ловится даже прогоном, потому что прогон не стартует.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { WORDS } from "./values.mjs"

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

// --- ШОВ 3: имя роли известно хосту ----------------------------------------------------------------
// Динамический role отключает штатную проверку хоста UNKNOWN_AGENT_TYPE, и опечатка в имени роли
// превращается из ошибки запуска в ошибку середины прогона.
test("шов ролей: у каждого имени роли, которое эмитит шаг, есть файл роли", () => {
  // Список каталогов ролей больше НЕ перечисляется руками — расширение считает его из дерева
  // steps/** (ext/index.mjs::roleDirs), потому что рукописный список пережил чистку и стал указывать
  // на снесённый каталог. Значит и шов сторожит теперь не список, а то, ради чего он существовал:
  // ИМЯ РОЛИ, которое шаг называет в инструкции, обязано иметь файл — хост резолвит роль по имени
  // файла, и опечатка иначе становится ошибкой середины прогона (UNKNOWN_AGENT_TYPE не сработает,
  // потому что имя роли динамическое).
  const roles = []
  for (const f of stepModules()) {
    const m = readFileSync(f, "utf8").match(/^const ROLE = "([^"]+)"/m)
    if (m) roles.push({ name: m[1], at: rel(f) })
  }
  const files = new Set()
  const collect = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) collect(p)
      else if (e.name.endsWith(".md") && !e.name.endsWith("-ru.md")) files.add(e.name.replace(/\.md$/, ""))
    }
  }
  collect(join(ROOT, "steps"))
  assert.ok(roles.length, "ни один шаг не объявил имени роли — шов ослеп")
  for (const r of roles) {
    assert.ok(files.has(r.name), `${r.at} зовёт роль «${r.name}», а файла ${r.name}.md в steps/** нет — хост её не найдёт`)
  }
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
