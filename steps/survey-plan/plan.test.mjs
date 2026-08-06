// Срез `survey-plan`: раскладка разведки — ЧИСТОЕ ядро, io держит ext/index.mjs::survey и его
// доказывает живой прогон (standards/code.md: io-трубу юнитами не покрываем). Формула §5:
// 1 happy + Σ ветвей антецедента с РАЗЛИЧИМЫМ следствием = 3 юнита. Второй — шов автомата: без
// проверки по байтам он краснеет, потому что клетка одна вместо двух.

import test from "node:test"
import assert from "node:assert/strict"
import { newPlan, CELL_FILES, CELL_BYTES } from "./plan.mjs"

const file = (path, bytes = 100, subjects = []) => ({ path, bytes, subjects })

test("happy: c0 — хребет, клетки разведки покрывают ВСЕ прочие файлы без потерь и пересечений", () => {
  const spine = [file("pom.xml", 3120)]
  const files = [
    file("pom.xml", 3120),
    file("src/main/java/FruitResource.java", 1180, ["fruit"]),
    file("src/main/java/Legume.java", 800, ["limit"]),
    file("src/test/java/FruitResourceIT.java", 900, ["fruit"]),
  ]
  const r = newPlan({ files, spine, subjects: ["fruit", "limit", "search"] })
  assert.equal(r.ok, true)

  const plan = r.value
  assert.equal(plan.files, 4)
  assert.equal(plan.bytes, 6000)
  assert.deepEqual(plan.subjects, ["fruit", "limit", "search"])
  assert.deepEqual(plan.gaps, ["search"])                 // якорь, не встретившийся нигде — объявлен

  assert.equal(plan.cells[0].id, "c0")
  assert.equal(plan.cells[0].kind, "spine")
  assert.deepEqual(plan.cells[0].files.map((f) => f.path), ["pom.xml"])

  const survey = plan.cells.slice(1)
  assert.ok(survey.every((c) => c.kind === "survey"))
  const got = survey.flatMap((c) => c.files.map((f) => f.path))
  assert.equal(got.length, new Set(got).size)             // без пересечений
  assert.deepEqual([...got].sort(), files.map((f) => f.path).filter((p) => p !== "pom.xml").sort())
  assert.deepEqual(survey[0].subjects, ["fruit", "limit"]) // пометка клетки — объединение якорей файлов
})

test(`шов автомата: файлов ${2} < ${CELL_FILES}, но байтов больше ${CELL_BYTES} → клеток две`, () => {
  const files = [file("a.java", CELL_BYTES * 0.75), file("b.java", CELL_BYTES * 0.75)]
  const r = newPlan({ files, spine: [], subjects: [] })
  assert.equal(r.ok, true)
  assert.equal(r.value.cells.length, 2)
  assert.deepEqual(r.value.cells.map((c) => c.id), ["c1", "c2"])
})

test("ни одного файла — err(no-files): картировать нечего", () => {
  const r = newPlan({ files: [], spine: [], subjects: ["fruit"] })
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "no-files")
})
