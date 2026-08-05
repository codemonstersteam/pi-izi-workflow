// operatorChannel — 2 happy (terminal, checkpoint) + 2 antecedent branches (unset, invalid), each with
// a distinguishable error class (standards/code.md §5): "unset" and "invalid" are different diagnoses,
// not the same rejection twice.

import test from "node:test"
import assert from "node:assert/strict"
import { OPERATOR_CHANNELS, newOperatorChannel } from "./operator-channel.mjs"

test("OPERATOR_CHANNELS: ровно два значения, terminal и checkpoint", () => {
  assert.deepEqual(OPERATOR_CHANNELS, ["terminal", "checkpoint"])
})

test("newOperatorChannel: terminal — принят как есть", () => {
  assert.deepEqual(newOperatorChannel("terminal"), { ok: true, value: "terminal" })
})

test("newOperatorChannel: checkpoint — принят как есть", () => {
  assert.deepEqual(newOperatorChannel("checkpoint"), { ok: true, value: "checkpoint" })
})

test("newOperatorChannel: поле не объявлено (undefined) — операторCHANNEL-unset, не молчаливый дефолт", () => {
  const r = newOperatorChannel(undefined)
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "operator-channel-unset")
})

test("newOperatorChannel: незнакомая строка — operator-channel-invalid, отличимо от unset", () => {
  const r = newOperatorChannel("slack")
  assert.equal(r.ok, false)
  assert.equal(r.error.cls, "operator-channel-invalid")
})

test("newOperatorChannel: не-строка (число) — тоже invalid, а не тихое приведение типов", () => {
  assert.equal(newOperatorChannel(42).error.cls, "operator-channel-invalid")
})

test("newOperatorChannel: пустая строка — invalid, не путается с unset", () => {
  assert.equal(newOperatorChannel("").error.cls, "operator-channel-invalid")
})
