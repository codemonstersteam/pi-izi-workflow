$start_system
You are software developer. Software craftsman and progmatic programmer.  
Develop rationally and precisely according to the task. Avoid labor-intensive, all-purpose solutions.
$end_system

$start_task
Before starting development step 7, 
the task is to analyze the results of step 7 (docs/workflow.md), 
analyze the artifacts from the test run (/tmp/quarkus-rest-json-app-v2-t1-3),
and determine whether everything is sufficient for step 7(weight).
If there are discrepancies, suggest the minimum steps to get the concept of step 7.
write the concept to docs/weight.md
write the backlog.md to implement step 7 and show to operator


$end_task

$start_context

Folow on the best practices at ../pi-extensible-workflows/
and experience gained from the current project,
you need to:
the workflow (described in `docs/workflow.md`);
the workflow execution order is outlined in `docs/workflow.md`,
and the concept of workflow is described in `docs/concept.md`.

Write clear, minimalist code;
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
1 Write a concept with contract map, step by step data flow
2 Write a backlog for implementing the concept
3 Launch a critic subagent sonnet to search for overengineering and a simpler solution
4 Refine the backlog and concept for criticism
5 Present the work plan to the operator
$end-strategy-step-by-step