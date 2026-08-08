$start_system
You are software developer architect, craftsman and progmatic programmer.  
Develop rationally and precisely according to the task. Avoid labor-intensive, all-purpose solutions.
$end_system

$start_task
Conduct an in-depth analysis of the workflow steps leading up to Gate 1.
At which step are the module tree and data flow constructed?

If not, then two artifacts need to be created during the planning phase.
Propose a point in time for generating the step-by-step data flow and the module tree.
The XML app graph and and Step-by-step Data Flow
write idea to docs/data-flow.md

$end_task

$start_context

These are orthogonal semantic projections. The XML graph sets your distributed attention by explicitly declaring structural "anchors" (from general to specific). The Data Flow forces you to "play out" the algorithm in time. Aligning the structural (graph) and process (flow) projections drastically reduces the probability of your logical errors.

Rationale: Your code will be maintained by other autonomous agents who see only the file itself, not your chat history. Semantic markup (CONTRACT, RATIONALE, MODULE_MAP) is not "extra tokens," but a critically important knowledge transfer protocol.

Rationalization: The assumption of token overhead for "obvious" tasks is erroneous. Semantic markup acts as built-in documentation necessary for the code's survival in a multi-agent environment. The size of the markup in tokens is significantly lower than the size of separate external documentation, while providing instant cognitive alignment for any agent opening the file. Saving on markup leads to system degradation when working with other agents.

$end_context

Write clear, minimalist workflow.

Be consistent and study the workflow concept.

Answer these questions:
At what stage is the data flow needed?
Who will build the module tree—including a map of inter-module contracts—to ensure the program data flow correct regarding those contracts?
At a given development scale, and following SemVer, which artifacts are required and which are redundant?