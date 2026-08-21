$START_TASK
Проверка вернула твою порцию дерева. Находок: {COUNT}. Сделай ровно это и ничего больше:

{TASKLIST}

В квадратных скобках — АДРЕС правки: путь модуля. Найди этот модуль и поправь в нём то, что названо
после адреса.

ГЛАВНОЕ ПРАВИЛО ЭТОГО НАРЯДА: модуль, к которому находок нет, копируй БУКВА В БУКВУ вместе с
`<facts>` и `candidates`. Остальное в файле проверка уже приняла; переписывая его заново, ты теряешь
принятое.

Если находка про `<needs>` — помни, ради чего это поле: «БЕЗ ЧЕГО МЕНЯ НЕ НАПИСАТЬ», а не «кого я
зову». Реализация нуждается в своём интерфейсе; интерфейс в своей реализации — нет.
$END_TASK

$START_DATA

$START_WORK_DOCUMENT
path: {STAGING}
ЭТО ТВОЙ ФАЙЛ — тот, что ты написала в прошлый раз. Его и правь, целиком записывая обратно.
Модули этой порции: {MINE}
$START_WORK_CONTENT
{PREVIOUS}
$END_WORK_CONTENT
$END_WORK_DOCUMENT

$START_SAMPLE_DOCUMENT
path: файлы репозитория, решающие ту же задачу
ОБРАЗЦЫ: по два кандидата на каждый твой модуль — базовый класс, аннотации, форма объявления.
Слева от каждой строки — её номер в файле. Не хватает — читай ТОЧЕЧНО:
    read(path: <путь из первой строки образца>, offset: <номер минус 2>, limit: 12)
До ВОСЬМИ таких чтений на порцию. `read` без offset и limit запрещён, других файлов нет.
$START_SAMPLE_CONTENT
{TWIN}
$END_SAMPLE_CONTENT
$END_SAMPLE_DOCUMENT

$START_NEIGHBOURS_DOCUMENT
path: соседние порции этой же работы
УЖЕ РЕШЁННЫЕ МОДУЛИ: их типы и объявления — то, на что твои модули вправе ссылаться в `<needs>`.
$START_NEIGHBOURS_CONTENT
{NEIGHBOURS}
$END_NEIGHBOURS_CONTENT
$END_NEIGHBOURS_DOCUMENT

$START_REQUIREMENT_DOCUMENT
path: .agent/frd.xml
ТРЕБОВАНИЕ: use case твоих модулей, их шаги, ветвления, поля и коды отказов — на случай находки про
`<post>`, которая обязана называть шаг вида UC2/3.
$START_REQUIREMENT_CONTENT
{FRD}
$END_REQUIREMENT_CONTENT
$END_REQUIREMENT_DOCUMENT

$END_DATA

$START_CONSTRAINTS
- Правь только то, на что указала находка; остальные модули копируются буква в букву.
- `path`, `delta`, `candidates`, `<facts>` не меняются никогда.
- `<twin path="…">` — ОДИН путь из `candidates` этой же строки.
- В `<needs>` — только ПУТИ файлов, у каждого `why`.
- `io` — одно из: none · http · db · file · queue · llm.
- `<sig>` и `<owns>` по-английски; `<hides>`, `<pre>`, `<post>`, `<fail>`, `why` по-русски.
$END_CONSTRAINTS

$START_OUTPUT
path: {STAGING}
check: {CHECK}
СДЕЛАЙ ЭТО СЕЙЧАС: пройди по находкам сверху вниз, поправь названные модули и запиши файл целиком по
staging-пути инструментом `write`; только после этого вызови `workflow_result` по OUTPUT_FORMAT своей
ROLE.
$END_OUTPUT
