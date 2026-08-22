// ЮНИТЫ ГАРДРЕЙЛА ШАГА 9A. Правила checkValues плюс тотальность. Тикет T10.
// Фикстура настоящая: требование и рябь живого прогона eddi, словарь — ответ роли `valuer`.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { judgeValues } from "../judge.mjs"
import { parseFrd } from "../../../intake/frd.mjs"

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..", "component")
const ANSWER = readFileSync(join(HERE, "answer-valuer.txt"), "utf8")
const FRD = parseFrd(readFileSync(join(HERE, "fixture/.agent/frd.xml"), "utf8"))
const RIPPLE = readFileSync(join(HERE, "fixture/.agent/ripple.xml"), "utf8")
const judge = (text, frd = FRD) => judgeValues({ text, frd, ripple: RIPPLE })

test("happy: настоящий ответ роли на настоящем требовании принимается", () => {
  assert.deepEqual(judge(ANSWER), [])
})

test("пустое значение осталось незаполненным — отказ с ИМЕНЕМ строки", () => {
  const b = judge(ANSWER.replace(/text="[^"]+"/, 'text=""'))
  assert.ok(b.length, "гардрейл пропустил пустое значение — роль отдала работу недоделанной")
  assert.ok(b.some((x) => /v\d/.test(x)), "блокер не называет строку — роль не найдёт, что чинить")
})

test("состав скелета тронут: строка закрывает конец, которого в требовании нет", () => {
  const b = judge(ANSWER, parseFrd(readFileSync(join(HERE, "fixture/.agent/frd.xml"), "utf8").replace(/UC1\b/g, "UC9")))
  assert.ok(b.length, "гардрейл пропустил рассинхрон словаря и требования")
  assert.ok(b.some((x) => /closes/.test(x)))
})

test("тотальность: роль вернула прозу — вердикт invalid, а не молчание", () => {
  const b = judge("Извините, я не смог составить словарь.")
  assert.equal(b.length, 1)
  assert.match(b[0], /^invalid/)
  assert.match(b[0], /Извините/, "блокер не показал начало ответа — искать причину придётся в трейсе")
})

test("тотальность: пустой ответ — вердикт invalid", () => {
  assert.match(judge("")[0], /^invalid/)
})
