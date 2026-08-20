$START_TASK  
One question, asked of every requirement: COULD SOMEONE SIT DOWN AND BUILD IT FROM THIS PLAN ALONE?

The plan is about to be cut into tickets and handed to an implementer who will read nothing else —
not the requirement, not this order, not you. Anything the requirement asks for and the plan does
not say becomes work nobody does. Find those places. One line per finding.  
$END_TASK

$START_DATA  
$START_DOCUMENT  
path: .agent/brd.md — the measurable requirement. This is the promise the work must keep.  
$END_DOCUMENT  
$START_CONTENT  
{BRD}  
$END_CONTENT  

$START_DOCUMENT  
path: .agent/frd.xml — the requirement broken into use cases, deltas, fields and failures.  
Use it to decide the ROOT of every finding: is the fact HERE and merely absent from the plan, or is
it absent from both?  
$END_DOCUMENT  
$START_CONTENT  
{FRD}  
$END_CONTENT  

$START_DOCUMENT  
path: {PLANPATH} — the plan of work. One section per module: what it does, its fields, its
signatures, what it calls, what closes it.  
$END_DOCUMENT  
$START_CONTENT  
{PLAN}  
$END_CONTENT  

$START_DOCUMENT  
path: .agent/appgraph.xml — the ADDRESS BOOK: every file this repository has. The address of a
finding is a path COPIED from here — including the finding about a module the plan does not have
yet. `(no such module)` is not an address: a machine routes by it, and an unrouted finding is
repaired in the wrong artifact.  
$END_DOCUMENT  
$START_CONTENT  
{KNOWN}  
$END_CONTENT  
$END_DATA

$START_FEEDBACK  
THE OPERATOR'S WORDS about this plan — the human who will approve it or send it back. Empty means
they have not spoken yet. A remark of theirs is a finding like any other: turn it into a line of
your own form, and keep looking for the rest.  
$START_CONTENT  
{OPERATOR}  
$END_CONTENT  
$END_FEEDBACK

$START_CONSTRAINTS  
- One line per finding, four fields, `|` between them. Nothing else in the file.  
- Every finding carries a REQUIREMENT NUMBER. A remark you cannot pin to one is not a finding.  
- The ROOT is yours to decide, and there are two:  
  `PLAN LOST` — the fact IS in the FRD, the plan does not carry it.  
  `NOT WRITTEN` — the fact is in neither: the requirement itself is silent.  
  Either way the ADDRESS is a path: the section's own path when the plan has one, the file that must
  gain the work when it does not.  
- A module that belongs in the work but has NO section in the plan: the address is still a PATH,
  copied from the ADDRESS BOOK. Never `(no such module)` and never a class name: the machine routes
  by that field, and a finding it cannot route is repaired in the wrong artifact — a module missing
  from the plan is repaired in the REQUIREMENT, and only a path says which one.  
- Failures and values count: a requirement naming an error code, a limit or a TTL that no module of
  the plan handles is a finding, exactly like a missing endpoint.  
- Coverage is a SECTION OF ITS OWN — a heading that is the module's path. Words about a module
  inside another module's section are not coverage: tickets are cut by section, and what has no
  section becomes a ticket for nobody.  
- Do not list what IS covered. Do not retell. Do not praise.  
$END_CONSTRAINTS

$START_OUTPUT  
path: {STAGING}  
schema — one finding per line, four fields, `|` between them, nothing else in the file:  

    R<number> | PLAN LOST   | <path of the module>     | <what to add>  
    R<number> | NOT WRITTEN | <path, if the fact has one> | <why the plan lies without it>  

The second field is ALWAYS a path from the address book — the section's own path when the plan has
one, the file that must gain the work when it does not.  

No findings — write an EMPTY file. An empty verdict is a legal answer, silence is not.  
return: call workflow_result according to the OUTPUT_FORMAT of your ROLE
