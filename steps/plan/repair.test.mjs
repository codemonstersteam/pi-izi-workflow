// Шов задачи наряда починки. Предмет — АДРЕС правки: по нему роль находит место, а не ищет по файлу.
import test from "node:test"
import assert from "node:assert/strict"
import { repairTask } from "./repair.mjs"

test("вердикт становится нумерованным списком, у каждой находки свой адрес", () => {
  const verdict = [
    `F11 строка UC3/4: «200 OK (terms, version)» смотрит наружу, но такого значения нет в словаре границы`,
    `  F6 строка UC3/2 называет модуль GlossaryStore, которого нет в дереве`,
    `  T2 модуль src/model/Doc.java требует src/mongo/Nope.java — такого файла нет`,
  ].join("\n")
  const t = repairTask(verdict)

  assert.equal(t.count, 3)
  assert.match(t.lines[0], /^1\. \[UC3\/4\] F11 строка UC3\/4/, "адрес не вынесен вперёд либо несёт хвостовую пунктуацию")
  assert.match(t.lines[1], /^2\. \[UC3\/2\] F6/)
  assert.match(t.lines[2], /^3\. \[src\/model\/Doc\.java\] T2/, "адресом стал не тот модуль: чинить будут чужой")

  // Текст блокера копируется ДОСЛОВНО: гардрейл уже обязан был назвать выход, пересказ его испортит.
  assert.ok(t.lines[0].includes("Возьми готовое") === false && t.lines[0].includes("смотрит наружу"))
  assert.deepEqual(repairTask("").lines, [], "пустой вердикт — пустой список, а не бросок")
})
