// АВТОПРОВЕРКИ ДИЗАЙНА. Тикет T09. По шву на правило standards/workflow-design.md.
// Правила 3, 7, 10, 12 (словарь, размер головы, литеральный рой, имена ролей) живут в
// ext/vocabulary.test.mjs — они про ПОЛОСУ; здесь то, что про ШАГ.
//
// Шов сторожит СМЫСЛ правила, а не его формулировку: роль и наряд меняют язык по мере созревания
// (standards/role.md §5), и шов, привязанный к русской фразе, краснеет на переводе — это отметка о
// ревизии, а не дефект.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs"
import { join, dirname, basename } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const rel = (p) => p.replace(`${ROOT}/`, "")

const walk = (dir, hit, out = []) => {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, hit, out)
    else if (hit(e.name)) out.push(p)
  }
  return out
}
const steps = () => walk(join(ROOT, "steps"), (n) => n.endsWith(".step.mjs"))

// Тело функции верхнего уровня по имени — грубо, но достаточно: шов ищет ВЫЗОВЫ, а не разбирает AST.
const bodyOf = (text, name) => {
  const i = text.search(new RegExp(`export (?:function|const) ${name}\\b`))
  if (i < 0) return ""
  const rest = text.slice(i)
  const end = rest.search(/\n(?:export |\/\/ FUNCTION_CONTRACT|\/\/ MODULE_CONTRACT)/)
  return end < 0 ? rest : rest.slice(0, end)
}

test("шов 1: шаг выставляет РОВНО id, next, fold", () => {
  assert.ok(steps().length, "модулей шагов не найдено — шов ослеп")
  for (const f of steps()) {
    const names = [...readFileSync(f, "utf8").matchAll(/^export (?:const|function|async function) (\w+)/gm)].map(([, n]) => n)
    assert.deepEqual([...names].sort(), ["fold", "id", "next"],
      `${rel(f)} выставляет ${names.join(", ")} — третий экспорт значит, что кишки шага зовут мимо его головы`)
  }
})

test("шов 2: next не зовёт модель и не продвигает — пишет только подготовку доставки", () => {
  for (const f of steps()) {
    const body = bodyOf(readFileSync(f, "utf8"), "next")
    assert.ok(body, `${rel(f)}: next не найден`)
    for (const bad of ["agent(", "promote(", "writeFileSync(", "checkpoint("]) {
      assert.ok(!body.includes(bad), `${rel(f)}: next зовёт ${bad} — решение и действие смешались`)
    }
    // rmSync законен: чистка пути доставки — это подготовка, а не запись состояния.
  }
})

test("шов 4: fold кладёт вердикт хода в состояние", () => {
  for (const f of steps()) {
    const text = readFileSync(f, "utf8")
    if (!/do: "role"/.test(text)) continue                      // шаг без роли судить нечего
    assert.match(text, /verdicts:\s*\[\.\.\.state\.verdicts,/,
      `${rel(f)}: fold не дописывает вердикт хода — «артефакт лёг» перестанет означать «гардрейл принял»`)
    assert.match(text, /newVerdict\(|verdict\(\{/, `${rel(f)}: вердикт строится не конструктором`)
  }
})

test("шов 5: артефакт продвигается только из route и только после зелёного вердикта", () => {
  for (const f of steps()) {
    const dir = dirname(f)
    const text = readFileSync(f, "utf8")
    if (!text.includes("promote")) continue
    assert.ok(existsSync(join(dir, "route.mjs")), `${rel(f)}: продвижение есть, а route.mjs нет`)
    const route = readFileSync(join(dir, "route.mjs"), "utf8")
    assert.match(route, /export function promote/, `${rel(dir)}/route.mjs не владеет продвижением`)
    // ПРОДВИЖЕНИЕ ПОСЛЕ СУДА, и шов проверяет ПРАВИЛО, а не форму конкретного шага: у одного шага
    // суд целого живёт в отдельной функции, у другого — прямо в fold. Общее одно: КАЖДЫЙ вызов
    // promote стоит ПОЗЖЕ ближайшей охраны `if (blockers)`, которая возвращает управление.
    const guards = [...text.matchAll(/if \(blockers\)/g)].map((m) => m.index)
    assert.ok(guards.length, `${rel(f)}: продвижение есть, а охраны «if (blockers)» нет — артефакт ляжет с любым вердиктом`)
    for (const m of text.matchAll(/\bpromote\(/g)) {
      if (text.slice(Math.max(0, m.index - 60), m.index).includes("import")) continue
      assert.ok(guards.some((g) => g < m.index),
        `${rel(f)}: promote на позиции ${m.index} стоит раньше любой охраны по блокерам — артефакт может лечь с красным вердиктом`)
    }
  }
})

test("шов 6: в состоянии нет документов шага", () => {
  const shape = readFileSync(join(ROOT, "ext", "state.mjs"), "utf8")
  const fields = [...shape.matchAll(/return ok\(\{([^}]*)\}\)/g)].map(([, f]) => f).join(" ")
  for (const k of ["text", "xml", "answer", "order", "body", "content"]) {
    assert.ok(!new RegExp(`\\b${k}:`).test(fields), `в форме состояния есть поле «${k}» — документ поехал по RPC`)
  }
  // Блокеры — диагностика, а не документ, и живут в состоянии намеренно: без них наряд починки пуст.
  assert.match(fields, /verdicts/, "вердикты обязаны быть в состоянии")
})

test("шов 8: у каждого шага есть компонентный тест", () => {
  for (const f of steps()) {
    const dir = dirname(f)
    const head = readFileSync(f, "utf8").includes("// голова")
    if (head) continue
    const c = join(dir, "component")
    assert.ok(existsSync(c) && statSync(c).isDirectory(), `${rel(f)}: нет component/ — шаг доказывается только живым прогоном`)
    assert.ok(readdirSync(c).some((n) => n.endsWith(".component.test.mjs")), `${rel(c)}: каталог есть, теста нет`)
  }
})

test("шов 9: пятёрка тотальна — судья ЕСТ мусор и возвращает вердикт, а не бросает", async () => {
  // Шов ПОВЕДЕНЧЕСКИЙ, а не текстовый. Первая версия искала в файле слово «invalid» и не краснела,
  // когда ветвь удаляли: слово оставалось в комментарии. Шов, который нельзя покрасить, — комментарий.
  const GARBAGE = [
    "", "   \n\n  ",
    "Извините, я не смог построить дерево: требование неоднозначно.",
    "<tree task=\"X\"><module path=",                       // оборван на середине
    "{\"track\":\"ok\"}",                                    // роль вернула конверт вместо артефакта
    "\u0000\u0001 \\ ]]> <![CDATA[",                          // просто мусор
  ]
  let judged = 0
  for (const f of steps()) {
    const judge = join(dirname(f), "judge.mjs")
    if (!existsSync(judge)) continue
    // ТОЛЬКО СУДЬИ МОДЕЛЬНОГО АРТЕФАКТА. У шага без роли (task) судья судит текст ЧЕЛОВЕКА, и проза
    // там — законный вход, а не мусор. Требовать от него блокера на «Извините, я не смог» значит
    // требовать отбивать нормальную задачу. Правило тотальности при этом остаётся общим — оно ниже,
    // в assert.doesNotThrow, — а «не молчи на мусор» касается того, кто читает ответ модели.
    if (!/do: "roles?"/.test(readFileSync(f, "utf8"))) continue
    const mod = await import(judge)
    for (const [name, fn] of Object.entries(mod)) {
      if (typeof fn !== "function" || !/^judge/.test(name)) continue
      for (const bad of GARBAGE) {
        let out
        assert.doesNotThrow(() => { out = fn({ text: bad, mine: ["src/A.java"], kin: [], known: [], frd: {} }) },
          `${rel(judge)}::${name} БРОСИЛ на «${bad.slice(0, 24)}» — исключение уйдёт через границу процессов мимо всей ROP-цепочки`)
        assert.ok(Array.isArray(out), `${rel(judge)}::${name} вернул не список блокеров`)
        assert.ok(out.length > 0, `${rel(judge)}::${name} ПРОМОЛЧАЛ на «${bad.slice(0, 24)}» — мусор проехал суд`)
        judged += 1
      }
    }
  }
  assert.ok(judged > 0, "ни один судья не проверен — шов ослеп")
})

test("шов 11: next первым делом судит СВОЙ вход", () => {
  for (const f of steps()) {
    const dir = dirname(f)
    assert.ok(existsSync(join(dir, "inputs.mjs")), `${rel(f)}: нет inputs.mjs — «вход зелен» останется комментарием`)
    const body = bodyOf(readFileSync(f, "utf8"), "next")
    const first = body.split("\n").find((l) => /^\s{2}\w/.test(l) && !l.trim().startsWith("//"))
    assert.match(first || "", /inputs\(state\)/,
      `${rel(f)}: первый ход next — не суд входа, а «${(first || "").trim()}»`)
  }
})
