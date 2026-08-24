The check returned your line. Findings: {COUNT}. Do exactly this and nothing else:

{TASKLIST}

YOUR PREVIOUS LINE — this is what you wrote last time and what the finding is about:

{PREVIOUS}

WORDS — how many files of this repository mention each word (substring match, case-insensitive,
over paths and text). The word you name must stand here with a NON-ZERO file count: zero means this
repository does not have that thing, and no zero-count word can be fixed by rewording the tail.

{WORDS}
DO IT NOW

Write exactly one line, nothing before it and nothing after it:

analogue: <word> — files <N>; <what makes it the model>

`<N>` is the word's count, copied from the table. If nothing in the table can serve as a model,
write `analogue: none — <why>`.

Write that one line into the file `{STAGING}` with the `write` tool.
