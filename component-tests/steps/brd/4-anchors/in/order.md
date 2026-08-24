A change request for a source repository. Two documents below, the job at the end.

REQUIREMENTS — one line per requirement, `<verb> | <object> | <instrument> | <values>`:

R1 create | Glossary | configuration type | dictionary of bot terms
R2 provide | CRUD | Glossary | with versioning
R3 version | Glossary | same mechanism | as Prompt Snippet
R4 add | resource type | Glossary | eddi://ai.labs.glossary
R5 enable | substitution | prompts | {{glossary.<term>}} on par with snippets
R6 export | Glossary | agent ZIP archive | as {id}.glossary.json plus {id}.descriptor.json
R7 import | Glossary | agent ZIP archive | with comparison to existing and upgrade
R8 merge | Glossary | import | by resource URI, new version wins
R9 limit | Glossary resource | fields | id + version + terms only, only id + version + terms
R10 restrict | Term key | value | up to 64 characters, lowercase, alphanumeric and underscore
R11 add | reference | agent config | Glossary like snippets
R12 serve | REST path | Glossary | /glossarystore/glossaries following *store/* pattern
R13 allow | substitution | only | glossaries attached to agent, no global ones
R14 resolve | key collision | priority | last load wins, order in configuration set determines priority
R15 keep | Term value | length | unlimited
R16 set | key | template data model | glossary with Qute syntax {glossary.<term>}
R17 cache | Glossary | Caffeine | same TTL as PromptSnippetService
R18 raise | error | prompt rendering | when deleted glossary is attached to agent

WORDS — how many files of this repository mention each word of those requirements (substring match,
case-insensitive, over paths and text). Nobody has read the code: this table is all you know about
this repository.

glossaries · files 1 · weight 7.53
Glossary · files 1 · weight 7.53
glossarystore · files 1 · weight 7.53
determines · files 10 · weight 5.22
substitution · files 11 · weight 5.13
versioning · files 11 · weight 5.13
alphanumeric · files 14 · weight 4.89
attached · files 17 · weight 4.69
underscore · files 21 · weight 4.48
collision · files 27 · weight 4.23
PromptSnippetService · files 29 · weight 4.16
comparison · files 30 · weight 4.12
terms · files 32 · weight 4.06
archive · files 33 · weight 4.03
priority · files 33 · weight 4.03
rendering · files 33 · weight 4.03
mechanism · files 39 · weight 3.86
Caffeine · files 40 · weight 3.84
unlimited · files 40 · weight 3.84
raise · files 42 · weight 3.79
syntax · files 44 · weight 3.74
following · files 48 · weight 3.65
zip · files 61 · weight 3.41
PromptSnippet · files 62 · weight 3.40
Qute · files 67 · weight 3.32
upgrade · files 69 · weight 3.29
snippets · files 76 · weight 3.19
wins · files 77 · weight 3.18
Snippet · files 85 · weight 3.08
restrict · files 88 · weight 3.05
ttl · files 88 · weight 3.05
export · files 92 · weight 3.00
CRUD · files 94 · weight 2.98
characters · files 99 · weight 2.93
ones · files 99 · weight 2.93
prompts · files 101 · weight 2.91
lowercase · files 107 · weight 2.85
merge · files 107 · weight 2.85
plus · files 120 · weight 2.74
global · files 160 · weight 2.45
dictionary · files 162 · weight 2.44
pattern · files 180 · weight 2.33
Prompt · files 195 · weight 2.25
like · files 203 · weight 2.21
deleted · files 212 · weight 2.17
fields · files 225 · weight 2.11
cache · files 235 · weight 2.07
template · files 239 · weight 2.05
existing · files 253 · weight 1.99
length · files 265 · weight 1.95
last · files 273 · weight 1.92
descriptor · files 290 · weight 1.86
keep · files 291 · weight 1.85
Term · files 292 · weight 1.85
reference · files 296 · weight 1.83
order · files 299 · weight 1.82
allow · files 348 · weight 1.67
enable · files 348 · weight 1.67
load · files 355 · weight 1.65
resolve · files 361 · weight 1.64
bot · files 373 · weight 1.60
limit · files 418 · weight 1.49
serve · files 453 · weight 1.41
provide · files 485 · weight 1.34
service · files 492 · weight 1.33
path · files 595 · weight 1.14
error · files 614 · weight 1.11
configuration · files 631 · weight 1.08
resource · files 652 · weight 1.05
REST · files 662 · weight 1.03
uri · files 666 · weight 1.02
version · files 668 · weight 1.02
json · files 674 · weight 1.01
add · files 720 · weight 0.95
key · files 771 · weight 0.88
create · files 791 · weight 0.85
type · files 853 · weight 0.78
agent · files 895 · weight 0.73
value · files 960 · weight 0.66
store · files 967 · weight 0.65
data · files 1006 · weight 0.61
par · files 1030 · weight 0.59
config · files 1108 · weight 0.51
model · files 1127 · weight 0.50
set · files 1279 · weight 0.37
WHAT TO DO

Name the thing that ALREADY EXISTS in this repository and that the new thing will be built on the
model of. Write exactly one line, nothing before it and nothing after it:

analogue: <word> — files <N>; <what makes it the model>

`<word>` must stand in the WORDS table with a non-zero file count: zero means this repository does
not have that thing. `<N>` is its count, copied from the table. If nothing in the table can serve as
a model, write `analogue: none — <why>`.

EXAMPLE, from another domain. Requirements say a JSON importer is added next to the existing CSV
one; the table has `importer · files 22`, `csv · files 8`, `json · files 0`. The line is:

analogue: csv — files 8; the existing input format of the importer, and the new one repeats its
parsing, validation and error reporting

Write that one line into the file `.agent/staging/analogue.txt` with the `write` tool.
