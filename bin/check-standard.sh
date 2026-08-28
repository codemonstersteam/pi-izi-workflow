#!/bin/bash
# check-standard.sh — grep-шов стандарта standards/ts-skill.md
# Запуск: bash bin/check-standard.sh (или из node --test через package.json script)
# Возвращает 0 если всё чисто, 1 если найдены нарушения.

FAIL=0
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

err() { echo -e "${RED}✗${NC} $1"; FAIL=1; }
ok()  { echo -e "${GREEN}✓${NC} $1"; }

echo "── Проверка стандарта ts-skill.md ──"

# 1. Нет throw в шагах (ожидаемые отказы — Result)
VIOLATIONS=$(grep -rn 'throw new Error' steps/ ext/ --include='*.ts' 2>/dev/null | grep -v node_modules | grep -v '.test.' | grep -v 'answer-tool' | wc -l | tr -d ' ')
if [ "$VIOLATIONS" -gt 0 ]; then
  err "throw в шагах: $VIOLATIONS (ожидаешь отказ → Result, не throw)"
  grep -rn 'throw new Error' steps/ ext/ --include='*.ts' 2>/dev/null | grep -v node_modules | grep -v '.test.' | head -3
else
  ok "нет throw в шагах"
fi

# 2. Нет голых new вне фабрик для value objects
# (ищем new с заглавной буквы, исключая фабричные методы)
VIOLATIONS=$(grep -rn 'new [A-Z][a-z]' steps/ ext/ --include='*.ts' 2>/dev/null | \
  grep -v node_modules | grep -v '.test.' | grep -v 'static\|factory\|readFile\|URL\|Map\|Set\|Promise\|Date\|Error\|RegExp\|Exchange' | wc -l | tr -d ' ')
if [ "$VIOLATIONS" -gt 0 ]; then
  err "голые new вне фабрик: $VIOLATIONS (value object создаётся через static of)"
  grep -rn 'new [A-Z][a-z]' steps/ ext/ --include='*.ts' 2>/dev/null | \
    grep -v node_modules | grep -v '.test.' | grep -v 'static\|factory\|readFile\|URL\|Map\|Set\|Promise\|Date\|Error\|RegExp\|Exchange' | head -3
else
  ok "value objects через фабрики"
fi

# 3. Head (run.ts) не юнит-тестируется
if [ -f ext/run.test.ts ]; then
  err "ext/run.test.ts существует — head не юнит-тестируется (компонентный тест доказывает)"
else
  ok "head не юнит-тестируется"
fi

# 4. ≤ 3 юнитов на pure core (проверяем judge.ts, questions.ts)
for f in steps/plan/judge.ts steps/plan-check/questions.ts steps/plan-check/card.ts steps/execute/judges.ts; do
  BASE="${f%.ts}"
  TEST_FILE="${BASE}.test.ts"
  if [ -f "$TEST_FILE" ]; then
    COUNT=$(grep -c '^test\|^  test' "$TEST_FILE" 2>/dev/null || echo 0)
    if [ "$COUNT" -gt 3 ]; then
      err "$TEST_FILE: $COUNT тестов > 3 — модуль под-decompose"
    else
      ok "$TEST_FILE: $COUNT тестов"
    fi
  fi
done

# 5. Промпты в .tpl, не в TS
PROMPT_LINES=$(grep -rn '\$START_TASK' steps/ ext/ --include='*.ts' 2>/dev/null | \
  grep -v node_modules | grep -v '.test.' | grep -v 'answer-tool' | wc -l | tr -d ' ')
if [ "$PROMPT_LINES" -gt 0 ]; then
  err "промпты в TS: $PROMPT_LINES строк с \$START_TASK — вынести в .tpl"
  grep -rn '\$START_TASK' steps/ ext/ --include='*.ts' 2>/dev/null | grep -v node_modules | grep -v '.test.' | head -3
else
  ok "промпты в .tpl шаблонах"
fi

echo "── Итог: $([ $FAIL -eq 0 ] && echo -e "${GREEN}чисто${NC}" || echo -e "${RED}нарушения${NC}") ──"
exit $FAIL
