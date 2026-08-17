$START_TASK
Проведи каждый маршрут от начала до конца.

В скелете ниже {BLANK} строк с пустым `steps`. У каждой уже написано:
что приходит (`entry`), чем она обязана кончиться (`exit`) и по каким узлам идти (`nodes`).
Заполни `steps`. Остальные атрибуты скопируй буква в букву.
Файл запиши целиком по staging-пути.
$END_TASK

$START_DATA
$START_DOCUMENT
path: {STAGING} (скелет — заполняй его)
Одна строка = один конец use case. У сценария с веткой отказа строк несколько: `S1`, `S1b`, `S1c`.
`entry` — значение, которое запускает маршрут. `exit` — значение, которым он обязан кончиться.
`nodes` — узлы этого сценария; идти можно только по ним, в любом порядке и с возвратами.
`ends` — фраза требования про этот конец, чтобы было видно, о чём маршрут.
$END_DOCUMENT
$START_CONTENT
{SKELETON}
$END_CONTENT

$START_DOCUMENT
path: .agent/values.xml (словарь)
Все значения изменения. В `steps` пишутся ТОЛЬКО их id.
$END_DOCUMENT
$START_CONTENT
{VALUES}
$END_CONTENT

$START_DOCUMENT
path: .agent/frd.xml
Требование целиком: сценарии со своими `before`/`after`, дельты узлов, коды отказов.
Нужен, чтобы понять, что происходит в сценарии между началом и концом.
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
- Формат шага: `путь@id`. Шаги через ` -> `. Пример: `src/page.html@v1 -> src/Api.java@v2 -> src/page.html@v5`.
- Шаг читается так: узел `путь` ОТДАЁТ значение `id`. Что он принял — это то, что отдал предыдущий шаг,
  а первый принимает `entry`. Писать вход не надо, его выводит скрипт.
- Первый шаг — узел, который принимает `entry`.
- Последний шаг обязан отдать ровно `exit` своей строки.
- Каждый путь берётся из `nodes` этой же строки. Узел может встречаться несколько раз: маршрут
  возвращается по тем же узлам, и это законно.
- Строк в файле ровно столько же, сколько в скелете. `id`, `scenario`, `uc`, `end`, `entry`, `exit`,
  `nodes` копируются символ в символ.
- Контракты, `<dep>` и поток не пишутся: их считает скрипт по твоим цепочкам.
$END_CONSTRAINTS

$START_FEEDBACK
Блокеры последней проверки staging-файла (пусто = первая попытка).
Каждый называет маршрут по его `id`. Чини ровно их, больше ничего не меняй.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: {STAGING}
schema:
  <routes grammar="1" form="skeleton">
    <route id="S1" scenario="S1" uc="UC1" end="UC1/post" entry="v1" exit="v5"
           nodes="src/page.html src/Api.java" steps="src/page.html@v1 -> src/Api.java@v2 -> src/page.html@v5" ends="…"/>
  </routes>
check: {CHECK}
return: вызови workflow_result по OUTPUT_FORMAT своей ROLE
$END_OUTPUT
