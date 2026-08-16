$START_TASK
Заполни пустые строки словаря.

В скелете ниже {BLANK} строк с `text=""`. Впиши в каждую короткое имя того, что там передаётся.
Остальные строки скопируй буква в букву.
Файл запиши целиком по staging-пути.
$END_TASK

$START_DATA
$START_DOCUMENT
path: {STAGING} (скелет — заполняй его)
Состав словаря посчитан скриптом: строки, их порядок, `id` и `closes` уже правильные.
`end` — фраза требования про этот конец, по ней и пишется имя.
`side="in"` — что приходит в систему, `side="out"` — что уходит из неё.
Строка с непустым `text` уже заполнена скриптом: `src` говорит откуда — копируй её без изменений.
$END_DOCUMENT
$START_CONTENT
{SKELETON}
$END_CONTENT

$START_DOCUMENT
path: .agent/frd.xml
Требование целиком: use case, их шаги, расширения и коды отказов.
Нужен только тогда, когда фразы в `end` не хватило, чтобы назвать значение.
$END_DOCUMENT
$START_CONTENT
{FRD}
$END_CONTENT

$START_DOCUMENT
path: {STAGING} (твой файл прошлой попытки; пусто = первая попытка)
Чини его по FEEDBACK, а не пиши заново.
$END_DOCUMENT
$START_CONTENT
{PREVIOUS}
$END_CONTENT
$END_DATA

$START_CONSTRAINTS
- Строк в файле ровно столько же, сколько в скелете. Ни одной новой, ни одной удалённой.
- `id`, `closes`, `side`, `end`, `src` копируются символ в символ.
- Меняется только `text=""` → `text="имя"`.
- Уже заполненный `text` не трогается.
- Имя — короткое, с параметрами: `POST /loans/{id}/renew {loanId}`, `200 {dueOn}`,
  `Карточка(loanId,dueOn)`, `409 LOAN_OVERDUE`. Не предложение и не пересказ `end`.
$END_CONSTRAINTS

$START_FEEDBACK
Блокеры последней проверки staging-файла (пусто = первая попытка).
Каждый называет строку по её `id`. Чини ровно их, больше ничего не меняй.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: {STAGING}
schema:
  <values grammar="2" form="skeleton">
    <value id="v1" closes="UC1/in" side="in" text="…" end="…"/>
    <value id="v2" closes="UC1/post" side="out" text="…" end="…"/>
    <value id="v3" text="…" src="…"/>
  </values>
check: {CHECK}
return: вызови workflow_result по OUTPUT_FORMAT своей ROLE
$END_OUTPUT
