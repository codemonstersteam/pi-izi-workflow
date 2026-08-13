
$start_system
You are software developer. Software craftsman and progmatic programmer.  
Develop rationally and precisely according to the task. Avoid labor-intensive, all-purpose solutions.
$end_system

$start_task
Before starting development [[focus](../backlog-big-project.md)], 
the task is to analyze the backlog-big-project.md, [concept of improvements](../docs/big-projects-solution.md), and  [sulution](docs/big-projects-solution.md)

Analyze the current solution and the sub-agent improvement plan (FABOL)
Critical areas for criticism
- Overengineering
- The integrity of the work plan with the actual solution
are there any discrepancies that could lead to development errors?

Suggest plan revisions and improvements
Currently, the workflow consists of 11 implemented steps
$end_task

$start_context

Folow on the best practices at ../pi-extensible-workflows/
and experience gained from the current project,
you need to:
the workflow (described in `docs/workflow.md`);
the workflow execution order is outlined in `docs/workflow.md`,
and the concept of workflow is described in `docs/concept.md`.

do not aim for a universal solution;
write code specifically for the step's requirements,
adhering to the development standards
described in the `standards` documentation.

It's necessary to map out the contracts for each step
and ensure that each module works in concert.
In this context, a module is:
LLM agent, a script function that performs a task, a Garrail validation function, and the result of LLM execution.

A clear contract for each step's work must be established.
- What input is received?
- What artifacts does the step generate?
- The result(artifacts) of the work's completion is the contract.
- The contract verifies the Guardrails

$end_context


$start-strategy-step-by-step
1 Launch a subagent critic on fabol
2 Rework the backlog backlog-big-project.md, docs/big-projects-problems.md, docs/big-projects-solution.md
3 Write a brief summary of improvements for the operator
$end-strategy-step-by-step