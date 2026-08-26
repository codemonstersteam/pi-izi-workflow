// MODULE_CONTRACT: T6 — seed-модуль обязан быть Changed, не Added
// Purpose:    одно решение: если модуль есть в ripple.xml как seed (существующий файл, затронутый
//             изменением), его delta в дереве НЕ МОЖЕТ быть "Added". Прогон 25.08: tree-designer
//             дал RestExportService и RestImportService delta="Added" при form="Added" в FRD —
//             несмотря на seed="yes" в ripple, существующие <facts> и self-twin. Результат:
//             qwen-агент создал бы НОВЫЙ файл вместо правки существующего.
// io:         none
// Invariants: ТОТАЛЕН. Блокер называет ПОЛНЫЙ ПУТЬ — адресаты починки ищутся по путям (route.mjs).
// Interface:  T6

// FUNCTION_CONTRACT: T6 — seed-модуль с delta="Added" → блокер
//   Input:        { modules — разобранное дерево; seeds — Set<путь> из ripple.xml }
//   Antecedent:   modules непуст
//   Consequent:   success: string[] — блокеры; пусто значит зелёный
//   Purity:       pure
export function T6({ modules = [], seeds = new Set() } = {}) {
  const B = []
  for (const m of modules) {
    if (!m || !m.path) continue
    if (seeds.has(m.path) && String(m.delta || "").trim() === "Added") {
      B.push(`T6 модуль ${m.path} объявлен Added, но он СУЩЕСТВУЕТ (seed в ripple.xml): существующий файл — Changed, не Added. Проверь: если модуль новый, убери его из seeds; если существующий — исправь delta на Changed.`)
    }
  }
  return B
}
