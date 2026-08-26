// Units сборщика нарядов подшага 3В. Формула standards/workflow-design.md; io-труба доказывается
// компонентным, здесь — РЕШЕНИЯ: малая клетка несёт текст, большая — digest, дырявый слот — отказ.
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { orderText, SMALL_FILES, SMALL_BYTES, SPINE_FILE_CAP } from "./order.mjs"
import { PLAN, COMPUTED } from "../paths.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))

// форма: минимальный план и факт скрипта, чтобы orderText мог прочитать входы своей клетки
function form() {
  const cwd = mkdtempSync(join(tmpdir(), "order-units-"))
  mkdirSync(join(cwd, ".agent"), { recursive: true })
  mkdirSync(join(cwd, "src"), { recursive: true })
  writeFileSync(join(cwd, "src/Fruit.java"), "public class Fruit { public String name; }\n")
  writeFileSync(join(cwd, "src/Big.java"), "class Big {}\n".repeat(400))
  const cell = (id, files) => ({ id, kind: "survey", files: files.map((p) => ({ path: p, bytes: readFileSync(join(cwd, p), "utf8").length, sha1: "", subjects: [] })) })
  const cells = [cell("small", ["src/Fruit.java"]), cell("big", ["src/Big.java", "src/Big.java", "src/Big.java", "src/Big.java"])]
  writeFileSync(join(cwd, PLAN), JSON.stringify({ cells }))
  writeFileSync(join(cwd, COMPUTED), "<computed/>\n")
  return { cwd, cells }
}

test("T23: малая клетка несёт ПОЛНЫЙ ТЕКСТ файлов — digest и read не нужны", () => {
  const { cwd, cells } = form()
  const o = orderText({ cwd }, cells[0])
  assert.ok(!o.why, o.why)
  assert.match(o.text, /SMALL CELL: every file comes as FULL TEXT/)
  assert.match(o.text, /\$START_FILE path=src\/Fruit\.java/)
  assert.match(o.text, /public class Fruit/, "содержимое файла — в наряде дословно")
  assert.ok(!/^- src\/Fruit\.java \(/m.test(o.text), "digest-строки на файлы малой клетки быть не должно")
  assert.ok(o.text.length > SMALL_BYTES * 0, "наряд собран")
})

test("T23: большая клетка идёт digest-строками — полный текст ей не положен", () => {
  const { cwd, cells } = form()
  const o = orderText({ cwd }, cells[1])
  assert.ok(!o.why, o.why)
  assert.ok(!o.text.includes("$START_FILE"), "большая клетка получила полный текст — предел не работает")
  assert.match(o.text, /- src\/Big\.java \(/, "digest-строка на файл")
})

test("T23: предел малости — константы наряда, а не плана", () => {
  assert.equal(SMALL_FILES, 3)
  assert.equal(SMALL_BYTES, 30 * 1024)
  assert.equal(SPINE_FILE_CAP, 40 * 1024)
})

test("T36: ХРЕБЕТ ВСЕГДА инлайн — digest для XML/MD/properties пуст, порог не применяется", () => {
  const { cwd } = form()
  // хребтовая клетка: 4 файла (больше SMALL_FILES=3), суммарно >30КБ (больше SMALL_BYTES)
  // — порог «малости» НЕ срабатывает, но kind="spine" включает инлайн
  const cell = {
    id: "spine", kind: "spine",
    files: [
      { path: "pom.xml", bytes: 40312 },
      { path: "README.md", bytes: 41451 },
      { path: "src/main/resources/application.properties", bytes: 28616 },
    ],
  }
  const o = orderText({ cwd }, cell)
  assert.ok(!o.why, o.why)
  assert.match(o.text, /SPINE CELL: every file comes as FULL TEXT/, "хребет не получил инлайн-заголовок")
  assert.ok(o.text.includes("$START_FILE"), "хребет получил digest вместо текста — T36 не работает")
  assert.ok(!/no digest: this extension/.test(o.text), "digest-строки «no digest: this extension» в хребте быть не должно")
})

test("T36: файл хребта >40КБ обрезан с пометкой, меньший — полный", () => {
  const cwd = mkdtempSync(join(tmpdir(), "order-spine-cap-"))
  mkdirSync(join(cwd, ".agent"), { recursive: true })
  mkdirSync(join(cwd, "src/main/resources"), { recursive: true })
  writeFileSync(join(cwd, "pom.xml"), "<project>".padEnd(50 * 1024, "x") + "</project>")
  writeFileSync(join(cwd, "src/main/resources/application.properties"), "key=value\n")
  writeFileSync(join(cwd, PLAN), JSON.stringify({ cells: [{ id: "spine", kind: "spine" }] }))
  writeFileSync(join(cwd, COMPUTED), "<computed/>")
  const cell = {
    id: "spine", kind: "spine",
    files: [
      { path: "pom.xml", bytes: 50 * 1024 },
      { path: "src/main/resources/application.properties", bytes: 11 },
    ],
  }
  const o = orderText({ cwd }, cell)
  assert.ok(!o.why, o.why)
  assert.match(o.text, /pom\.xml \(51200 b, first 40KB shown\)/, "большой файл не обрезан или пометка не стоит")
  assert.match(o.text, /application\.properties \(11 b\)/, "малый файл не должен иметь пометки обрезки")
  assert.ok(o.text.includes("key=value"), "содержимое малого файла — в наряде")
})

test("наряд с дырявым слотом — отказ с именем слота, а не текст с {дырой}", () => {
  const { cwd, cells } = form()
  const before = readFileSync(new URL("./order.survey.tpl", import.meta.url), "utf8")
  try {
    writeFileSync(new URL("./order.survey.tpl", import.meta.url), before.replace("{SUBJECTS}", "{UNKNOWN_SLOT}"))
    const o = orderText({ cwd }, cells[0])
    assert.equal(o.why, "слот {UNKNOWN_SLOT} не подставлен — наряд уходит роли с дырой")
  } finally {
    writeFileSync(new URL("./order.survey.tpl", import.meta.url), before)
  }
})
