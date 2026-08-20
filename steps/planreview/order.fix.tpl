$START_TASK  
A critic read the plan of work against the requirement and named what an implementer would not find
there. Close every one of those findings by ANCHORED EDITS to {TARGET}.

{TARGET} is the SOURCE the plan is assembled from: the document is rebuilt out of it, so an edit
that lands here survives, and a word that never lands here is work nobody does. Return edits only —
never the file.  
$END_TASK

$START_DATA  
$START_DOCUMENT  
path: {TARGET} — the artifact you edit. Its sections are copied verbatim into the plan the
implementer reads: one section per module — what it does, its fields, its signatures, what it calls,
what closes it, how it is verified.  
$END_DOCUMENT  

$START_DOCUMENT  
path: .agent/appgraph.xml — the ADDRESS BOOK: every file this repository has. A node you name in an
edit is a line COPIED from here. A path you remember instead of copying does not exist, the guardrail
refuses the artifact, and the round is spent.  
$END_DOCUMENT  
$START_CONTENT  
{KNOWN}  
$END_CONTENT  

$START_DOCUMENT  
path: .agent/graph-computed.xml — WHAT THE REPOSITORY DECLARES in the files these findings name:
every declaration and the calls each file already makes. A `signatures:` line you write is COPIED
from here; a `calls:` line is these edges. What is not here you do not know — and a signature made up
from a class name is read by the implementer as fact.  
$END_DOCUMENT  
$START_CONTENT  
{FACTS}  
$END_CONTENT  

$START_DOCUMENT  
path: .agent/data-flow.md — the call chains of this change, one line per step:  
`<module> : <what comes in> -> <what goes out>`.  
This is how you find WHERE a value belongs: follow the chains and see which module holds the thing
the value speaks about. A cache TTL belongs to the module that keeps the cache, a limit to the module
that checks it.  
$END_DOCUMENT  
$START_CONTENT  
{FLOW}  
$END_CONTENT  
$END_DATA

$START_PREVIOUS
THE ARTIFACT AS IT STANDS ON DISK RIGHT NOW. Your anchors are copied from here — the whole line,
character for character, including indentation and quotes. Nothing else in this file changes.  
  
$START_DOCUMENT  
path: {TARGET}  
$END_DOCUMENT  
$START_CONTENT  
{PREVIOUS}  
$END_CONTENT  
$END_PREVIOUS

$START_FEEDBACK  
Every line here is a job. COUNT THEM AND CLOSE THEM ALL IN THIS ANSWER.  
Each line names its SOURCE, and the two are repaired differently:  

- `critic:` — a plan critic read this artifact against the requirement. Something it promises is
  missing. Write the edit that adds it, and nothing more.  

- `nfr:` — a MEASURE the requirement states and the plan does not carry. Find its module by the
  chains above, and write the measure into that module's section — into `fields:` when it is a
  property of state, into `signatures:` when it is a property of a call. Never into the header.  

- `guardrail:` — YOUR LAST ANSWER WAS REFUSED, and the line says by what. This is not a new job: the
  artifact above is unchanged and so are the critic's lines. Three refusals exist, and they are
  repaired differently:  
  · the anchor is not in the file — copy it again from PREVIOUS, whole, never from memory;  
  · a heading you wrote has spaces before `##` — a section with them is invisible to the cut, so
    anchor on a line with no indentation of its own;  
  · the plan stopped being cuttable — your edit broke the shape of a section; keep every line the
    kind of line it was.  

$START_CONTENT  
{FEEDBACK}  
$END_CONTENT  
$END_FEEDBACK

$START_CONSTRAINTS  
- Two forms, nothing else:  

      REPLACE: <строка, которая есть в файле сейчас>  
      <строка, которой её заменить>  

      INSERT AFTER: <строка, которая есть в файле сейчас>  
      <новая строка>  

- The anchor is COPIED from the file above. A machine applies your edit: an anchor it cannot find is
  refused and your work is lost.  
- NO BACKTICKS and no quotes around the anchor or around the new line. The line goes as it stands
  in the file — a `` ` `` you add is a character the file does not have, and the anchor stops matching.  
- EVERY PATH IS A LINE OF THE ADDRESS BOOK. Naming a file the repository does not have is the same
  mistake as a missing anchor, and it costs the same round.  
- EVERY ANCHOR IS A LINE OF PREVIOUS. Before you answer, find each anchor there. Not found — you
  took it from the wrong text; PREVIOUS is the artifact named at the top, and it is the only
  place anchors come from.  
- Close ONLY what the findings name.  
- Keep the form of the line you replace: a `fields:` line stays a `fields:` line.  
- No `<`, `>` or `&` inside an attribute value.  
- A COMMENT IS NOT AN EDIT. `<!-- … -->` and `# …` are read by nobody downstream: not the design,
  not the plan, not the tickets. Write the thing itself — the path into a `<step>`, the code into
  `<ext error>` and `<failure code>`, the field into a `<field>`, the value into the line that
  carries it. A note saying the work is "out of scope" closes nothing.  
- A finding whose module has NO SECTION in the plan is closed by writing that section: anchor on the
  LAST line of the file — its heading must start at COLUMN ZERO, with no spaces before `##`, or the
  section is invisible to the coverage and to the cut and the work in it becomes a ticket for nobody.
  Copy the shape of the neighbouring sections (`## <path>` · what ·
  fields · signatures · declares · calls · verify), take the path from the ADDRESS BOOK and the
  `signatures:` and `calls:` lines from the DECLARATIONS above. The cut reads sections — a section
  you write becomes a ticket, a section you skip is work nobody does.  
- You do not number the work and you do not order it: the wave of a ticket and its dependencies are
  COMPUTED from `calls:` and the map. Write `calls:` truthfully and the order takes care of itself.  
$END_CONSTRAINTS

$START_OUTPUT  
path: {STAGING}  
The edits, and nothing else — no explanations, no headings, no restating the findings:  

    REPLACE: <line that is in the file right now>  
    <the line to put in its place>  

    INSERT AFTER: <line that is in the file right now>  
    <the new line>  

return: call workflow_result according to the OUTPUT_FORMAT of your ROLE
