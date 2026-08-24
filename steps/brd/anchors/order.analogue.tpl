A change request for a source repository. Two documents below, the job at the end.

REQUIREMENTS — one line per requirement, `<verb> | <object> | <instrument> | <values>`:

{ROWS}

WORDS — how many files of this repository mention each word of those requirements (substring match,
case-insensitive, over paths and text). Nobody has read the code: this table is all you know about
this repository.

{WORDS}
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

Write that one line into the file `{STAGING}` with the `write` tool.
