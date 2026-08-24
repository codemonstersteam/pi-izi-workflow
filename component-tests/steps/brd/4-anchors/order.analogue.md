A change request for a source repository. Two documents below, the job at the end.

REQUIREMENTS — one line per requirement, `<verb> | <object> | <instrument> | <values>`:

R1 add | Glossary | configuration type | with resource type eddi://ai.labs.glossary
R2 implement | CRUD | Glossary | with versioning like Prompt Snippet
R3 substitute | terms | prompts | as {{glossary.<term>}}
R4 export | Glossary | agent ZIP archive | as {id}.glossary.json plus {id}.descriptor.json
R5 import | Glossary | agent ZIP archive | with merge by resource URI and upgrade
R6 version | Glossary | mechanism | like Prompt Snippet
R7 merge | Glossary | import | by resource URI with new version wins
R8 define | Term | structure | as key + value only
R9 validate | Term key | format | up to 64 chars, lowercase, alphanumeric and underscore
R10 reference | Glossary | agent config | like snippets
R11 expose | REST endpoint | Glossary | at /glossarystore/glossaries
R12 restrict | substitution | Glossary | to agent-bound only
R13 resolve | key conflict | Glossary | last load wins based on configuration set order
R14 define | Glossary resource | fields | id + version + terms only
R15 allow | Term value | length | unlimited
R16 define | template key | data model | glossary with syntax {glossary.<term>}
R17 cache | Glossary | Caffeine | with TTL same as PromptSnippetService
R18 error | prompt rendering | removed Glossary | when bound to agent
R19 name | export file | agent ZIP | as {id}.glossary.json plus {id}.descriptor.json

WORDS — how many files of this repository mention each word of those requirements (substring match,
case-insensitive, over paths and text). Nobody has read the code: this table is all you know about
this repository.

agent-bound · files 0 · weight 7.53
glossaries · files 1 · weight 7.53
Glossary · files 1 · weight 7.53
glossarystore · files 1 · weight 7.53
substitution · files 11 · weight 5.13
versioning · files 11 · weight 5.13
alphanumeric · files 14 · weight 4.89
underscore · files 21 · weight 4.48
PromptSnippetService · files 29 · weight 4.16
terms · files 32 · weight 4.06
archive · files 33 · weight 4.03
rendering · files 33 · weight 4.03
mechanism · files 39 · weight 3.86
substitute · files 39 · weight 3.86
Caffeine · files 40 · weight 3.84
unlimited · files 40 · weight 3.84
syntax · files 44 · weight 3.74
zip · files 61 · weight 3.41
PromptSnippet · files 62 · weight 3.40
upgrade · files 69 · weight 3.29
snippets · files 76 · weight 3.19
wins · files 77 · weight 3.18
define · files 79 · weight 3.16
Snippet · files 85 · weight 3.08
conflict · files 86 · weight 3.07
restrict · files 88 · weight 3.05
ttl · files 88 · weight 3.05
export · files 92 · weight 3.00
CRUD · files 94 · weight 2.98
expose · files 99 · weight 2.93
prompts · files 101 · weight 2.91
lowercase · files 107 · weight 2.85
merge · files 107 · weight 2.85
removed · files 110 · weight 2.82
plus · files 120 · weight 2.74
structure · files 175 · weight 2.36
based · files 184 · weight 2.31
chars · files 186 · weight 2.30
Prompt · files 195 · weight 2.25
like · files 203 · weight 2.21
fields · files 225 · weight 2.11
endpoint · files 233 · weight 2.07
validate · files 234 · weight 2.07
cache · files 235 · weight 2.07
template · files 239 · weight 2.05
length · files 265 · weight 1.95
bound · files 271 · weight 1.92
last · files 273 · weight 1.92
descriptor · files 290 · weight 1.86
Term · files 292 · weight 1.85
reference · files 296 · weight 1.83
order · files 299 · weight 1.82
allow · files 348 · weight 1.67
load · files 355 · weight 1.65
resolve · files 361 · weight 1.64
format · files 373 · weight 1.60
implement · files 407 · weight 1.52
file · files 432 · weight 1.46
service · files 492 · weight 1.33
error · files 614 · weight 1.11
configuration · files 631 · weight 1.08
resource · files 652 · weight 1.05
REST · files 662 · weight 1.03
uri · files 666 · weight 1.02
version · files 668 · weight 1.02
json · files 674 · weight 1.01
add · files 720 · weight 0.95
key · files 771 · weight 0.88
type · files 853 · weight 0.78
agent · files 895 · weight 0.73
value · files 960 · weight 0.66
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
