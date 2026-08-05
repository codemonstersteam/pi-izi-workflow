const r = await agent("Say hello and state your marker.", { role: "smoker", label: "role-check" });
const s = await agent("Return the count of letters in the word 'workflow' and the word itself.", {
  label: "schema-check",
  outputSchema: { type: "object", properties: { word: { type: "string" }, letters: { type: "number" } }, required: ["word", "letters"], additionalProperties: false },
});
return { roleSaid: String(r).includes("ROLE-OK"), schema: s };
