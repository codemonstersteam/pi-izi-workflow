Write the development plan file. The sections are mandatory, all six, in this order:

1. REQUIREMENTS — table: every TASK.md item VERBATIM (a quote) → where the plan closes it
   (a reference to a row of section 2 or 3). No item may be left without a row, including
   constraints ("must not", "don't break", "follow the sample") and formats.

2. CHANGES — table: № (C1, C2, …) | file (full path) | Added or Changed | what exactly
   changes in its contract | which requirement it closes. The file either exists in the
   repository (verify it), or is marked new with the sample file it follows. ROWS ARE
   ORDERED BY DEPENDENCIES (foundation before consumer). A row changing behavior asserted
   by an EXISTING test REQUIRES its own row for that test change.

3. SCENARIOS — for every new behavior: how it works now (before) → how it will work
   (after), with paths and call parameters.

4. VALUES — table: quantity | value | source. Every number, limit, format, parameter
   name: the value and where it came from (a TASK.md quote or a code file name). Nothing
   "defaults to 20" without a source.

5. GUARANTEES — what must NOT break after the change, by name (which existing
   calls/behaviors/files stay unchanged and why the plan does not touch them; files go
   in backticks).

6. OPEN QUESTIONS — table: question | recommendation. What you do not know — ask instead
   of inventing silently; every question carries your recommendation.

Read the repository code yourself (read/bash): plan claims must be verified against real
files, not guesses. Do not write code. Write the file at the named path with the write tool.
