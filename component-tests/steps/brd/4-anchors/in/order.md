A change request for a source repository. Two documents below, the job at the end.

REQUIREMENTS — one line per requirement, `<verb> | <object> | <instrument> | <values>`:

R1 create | Glossary | new configuration type | dictionary of bot terms, CRUD with versioning, based on Prompt Snippet, resource type `eddi://ai.labs.glossary`
R2 enable | substitution | prompts | as {{glossary.<term>}} alongside snippets
R3 add | export | Glossary | travels with agent during export
R4 add | import | Glossary | travels with agent during import, including comparison with existing and upgrade
R5 define | versioning | Glossary | repeats Prompt Snippet mechanism, no own description
R6 define | import merge | Glossary | merge by resource URI, new version wins (upgrade existing)
R7 define | Term | Glossary | only key + value, no description, no category
R8 constrain | Term key | Glossary | up to 64 chars, lowercase, alphanumeric and underscore
R9 add | reference | agent config | Glossary as reference, like snippets
R10 define | REST path | Glossary | /glossarystore/glossaries, *store/* pattern
R11 constrain | substitution scope | Glossary | only for glossaries bound to agent, no global
R12 define | key collision | Glossary | last load wins: order in configuration set is priority
R13 define | Glossary fields | Glossary resource | only id + version + terms
R14 define | value length | Glossary | not limited
R15 define | template data model key | Glossary | glossary, Qute standard syntax: {glossary.<term>}
R16 define | caching | Glossary | Caffeine, TTL same as PromptSnippetService
R17 define | remote glossary error | Glossary | error on prompt rendering when bound glossary is removed
R18 define | export file name | agent ZIP archive | as {id}.glossary.json plus {id}.descriptor.json

WORDS — how many files of this repository mention each word of those requirements (substring match,
case-insensitive, over paths and text). Nobody has read the code: this table is all you know about
this repository.

glossaries · files 1 · weight 7.53
Glossary · files 1 · weight 7.53
glossarystore · files 1 · weight 7.53
travels · files 9 · weight 5.33
substitution · files 11 · weight 5.13
versioning · files 11 · weight 5.13
alphanumeric · files 14 · weight 4.89
repeats · files 16 · weight 4.75
underscore · files 21 · weight 4.48
collision · files 27 · weight 4.23
constrain · files 28 · weight 4.19
PromptSnippetService · files 29 · weight 4.16
comparison · files 30 · weight 4.12
terms · files 32 · weight 4.06
archive · files 33 · weight 4.03
priority · files 33 · weight 4.03
rendering · files 33 · weight 4.03
mechanism · files 39 · weight 3.86
Caffeine · files 40 · weight 3.84
syntax · files 44 · weight 3.74
alongside · files 46 · weight 3.70
remote · files 57 · weight 3.48
category · files 58 · weight 3.46
zip · files 61 · weight 3.41
PromptSnippet · files 62 · weight 3.40
Qute · files 67 · weight 3.32
upgrade · files 69 · weight 3.29
limited · files 75 · weight 3.21
snippets · files 76 · weight 3.19
wins · files 77 · weight 3.18
define · files 79 · weight 3.16
Snippet · files 85 · weight 3.08
ttl · files 88 · weight 3.05
export · files 92 · weight 3.00
CRUD · files 94 · weight 2.98
prompts · files 101 · weight 2.91
including · files 107 · weight 2.85
lowercase · files 107 · weight 2.85
merge · files 107 · weight 2.85
caching · files 108 · weight 2.84
removed · files 110 · weight 2.82
plus · files 120 · weight 2.74
standard · files 129 · weight 2.67
global · files 160 · weight 2.45
dictionary · files 162 · weight 2.44
during · files 174 · weight 2.37
pattern · files 180 · weight 2.33
based · files 184 · weight 2.31
chars · files 186 · weight 2.30
Prompt · files 195 · weight 2.25
like · files 203 · weight 2.21
fields · files 225 · weight 2.11
template · files 239 · weight 2.05
existing · files 253 · weight 1.99
length · files 265 · weight 1.95
bound · files 271 · weight 1.92
last · files 273 · weight 1.92
descriptor · files 290 · weight 1.86
description · files 292 · weight 1.85
Term · files 292 · weight 1.85
reference · files 296 · weight 1.83
order · files 299 · weight 1.82
enable · files 348 · weight 1.67
load · files 355 · weight 1.65
bot · files 373 · weight 1.60
file · files 432 · weight 1.46
scope · files 468 · weight 1.38
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
config · files 1108 · weight 0.51
model · files 1127 · weight 0.50
name · files 1251 · weight 0.39
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
