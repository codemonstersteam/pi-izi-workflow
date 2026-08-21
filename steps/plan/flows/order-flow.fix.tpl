$START_TASK
Проверка вернула твой поток. Находок: {COUNT}. Сделай ровно это и ничего больше:

{TASKLIST}

В квадратных скобках — АДРЕС правки: строка потока по её `closes` либо путь модуля. Найди это место
и поправь в нём то, что названо после адреса.

ГЛАВНОЕ ПРАВИЛО ЭТОГО НАРЯДА: строку, к которой находок нет, копируй БУКВА В БУКВУ. Остальное в
файле проверка уже приняла; переписывая его заново, ты теряешь принятое.
$END_TASK

$START_DATA

$START_WORK_DOCUMENT
path: {STAGING}
ЭТО ТВОЙ ФАЙЛ — тот, что ты написала в прошлый раз. Его и правь, целиком записывая обратно.
Use case этой порции: {UC}
$START_WORK_CONTENT
{PREVIOUS}
$END_WORK_CONTENT
$END_WORK_DOCUMENT

$START_MODULES_DOCUMENT
path: .agent/tree.xml
МОДУЛИ РАБОТЫ: `module` каждой строки берётся ОТСЮДА и только отсюда.
Строка `brief=` значит: через твой use case модуль не проходит, он здесь только для ссылки.
$START_MODULES_CONTENT
{TREE}
$END_MODULES_CONTENT
$END_MODULES_DOCUMENT

$START_DICTIONARY_DOCUMENT
path: .agent/values.xml
СЛОВАРЬ ГРАНИЦЫ: адреса и статусы пишутся отсюда СЛОВО В СЛОВО.
Внутренние значения в словаре не описаны — их называешь ты, и правило у них одно: один порождающий.
$START_DICTIONARY_CONTENT
{VALUES}
$END_DICTIONARY_CONTENT
$END_DICTIONARY_DOCUMENT

$START_REQUIREMENT_DOCUMENT
path: .agent/frd.xml
ТРЕБОВАНИЕ: шаги этого use case и его ветвления — на случай находки «шаг не закрыт».
$START_REQUIREMENT_CONTENT
{FRD}
$END_REQUIREMENT_CONTENT
$END_REQUIREMENT_DOCUMENT

$END_DATA

$START_CONSTRAINTS
- Правь только то, на что указала находка; остальные строки копируются буква в букву.
- `closes` не меняется никогда.
- `module` — ПУТЬ из дерева, а не имя класса.
- `role` — одно из: порождаю · проношу · отвергаю.
- Значение, смотрящее НАРУЖУ (адрес, статус), берётся из словаря границы слово в слово.
$END_CONSTRAINTS

$START_OUTPUT
path: {STAGING}
check: {CHECK}
СДЕЛАЙ ЭТО СЕЙЧАС: пройди по находкам сверху вниз, поправь названные места и запиши файл целиком по
staging-пути инструментом `write`; только после этого вызови `workflow_result` по OUTPUT_FORMAT своей
ROLE.
$END_OUTPUT
