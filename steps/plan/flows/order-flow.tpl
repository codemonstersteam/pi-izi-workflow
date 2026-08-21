$START_TASK
Проведи один use case через модули.

В скелете ниже у каждой строки пусты `module`, `in`, `out`, `role`. Впиши их. `closes` не трогай.
Файл запиши целиком по staging-пути.

ГЛАВНОЕ ПРАВИЛО ЭТОГО НАРЯДА: у значения ОДИН порождающий модуль.
Если два модуля делают из одного входа разное — это РАЗНЫЕ значения, и назвать их надо по-разному:
«Займ (черновик продления)» и «Займ (продлён, version+1)».

Второе правило: `in` каждой строки — это `out` предыдущей либо то, что пришло в систему извне.
Разрыв в цепочке значит, что шаг кто-то пропустил.
$END_TASK

$START_DATA

$START_WORK_DOCUMENT
path: {STAGING}
ЭТО ТВОЯ РАБОТА — скелет, который ты заполняешь и записываешь целиком.
Use case этой порции: {UC}
Номера шагов в `closes` проставлены скриптом и уже правильные.
Строку можно ДОБАВИТЬ с тем же `closes`, если шаг проходит через несколько модулей. Удалять нельзя.
$START_WORK_CONTENT
{SKELETON}
$END_WORK_CONTENT
$END_WORK_DOCUMENT

$START_PREVIOUS_DOCUMENT
path: {STAGING}
ТВОЙ ФАЙЛ ПРОШЛОЙ ПОПЫТКИ (пусто = первая попытка).
Чини его по FEEDBACK, а не пиши заново.
$START_PREVIOUS_CONTENT
{PREVIOUS}
$END_PREVIOUS_CONTENT
$END_PREVIOUS_DOCUMENT

$START_MODULES_DOCUMENT
path: .agent/tree.xml
МОДУЛИ РАБОТЫ: путь, что каждый прячет, что гарантирует и какой отказ порождает.
`module` каждой строки берётся ОТСЮДА и только отсюда.
Строка `brief=` значит: через твой use case модуль не проходит, он здесь только для ссылки.
$START_MODULES_CONTENT
{TREE}
$END_MODULES_CONTENT
$END_MODULES_DOCUMENT

$START_DICTIONARY_DOCUMENT
path: .agent/values.xml
СЛОВАРЬ ГРАНИЦЫ: как в этом изменении называются адреса, статусы и коды отказов.
Всё, что смотрит НАРУЖУ, пиши отсюда СЛОВО В СЛОВО.
Внутренние значения — те, что живут между модулями, — в словаре не описаны: их называешь ты, и
правило у них одно: один порождающий модуль.
$START_DICTIONARY_CONTENT
{VALUES}
$END_DICTIONARY_CONTENT
$END_DICTIONARY_DOCUMENT

$START_REQUIREMENT_DOCUMENT
path: .agent/frd.xml
ТРЕБОВАНИЕ: шаги этого use case, его ветвления, коды отказов со статусами и поля с их доменами.
$START_REQUIREMENT_CONTENT
{FRD}
$END_REQUIREMENT_CONTENT
$END_REQUIREMENT_DOCUMENT

$END_DATA

$START_CONSTRAINTS
- `closes` копируется символ в символ; строки не удаляются.
- `module` — ПУТЬ из дерева, а не имя класса.
- `role` — одно из: порождаю · проношу · отвергаю.
- Код отказа появляется дважды: строкой `отвергаю` с голым кодом и строкой со статусом.
- Имена значений — на языке требования, коротко и с параметрами в скобках.
- Значение, смотрящее НАРУЖУ (адрес, статус, код отказа), берётся из словаря границы слово в слово.
$END_CONSTRAINTS

$START_SELFCHECK
Перед записью выпиши себе, письменно, две вещи:

    1. цепочка входов: <out строки 1> → <in строки 2> → … — где рвётся?
    2. каждое значение и кто его порождает: <значение> ← <один модуль>

«Всё сходится» ответом не является: назови значения и модули поимённо.
Если у значения оказалось два порождающих — переименуй одно из них.
$END_SELFCHECK

$START_FEEDBACK
Блокеры последней проверки staging-файла (пусто = первая попытка).
Каждый называет строку её `closes`. Чини ровно их, больше ничего не меняй.
$START_FEEDBACK_CONTENT
{FEEDBACK}
$END_FEEDBACK_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: {STAGING}
schema:
  <flows task="…">
    <flow id="UC1" uc="UC1" goal="…">
      <step n="1" module="src/…/RestLoanStore.java" in="POST /loans/renew (loanId)" out="Займ (черновик)" role="порождаю" closes="UC1/1"/>
    </flow>
  </flows>
check: {CHECK}
ПЕРЕД ОТПРАВКОЙ: пройди по строкам сверху вниз и убедись, что `in` каждой встречался выше как `out`
либо пришёл извне. У значения — один порождающий модуль.
СДЕЛАЙ ЭТО СЕЙЧАС: заполни `module`, `in`, `out`, `role` в каждой строке скелета и запиши файл по
staging-пути инструментом `write`; только после этого вызови `workflow_result` по OUTPUT_FORMAT
своей ROLE.
$END_OUTPUT
