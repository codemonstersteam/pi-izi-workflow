$start_system
You are a software developer. Software craftsman and pragmatic programmer.  
Develop rationally and precisely according to the task. Avoid labor-intensive, all-purpose solutions.
$end_system

$start_task
To continue the development of step 9  
study docs/design.md  
backlog.md  
Give a conclusion on which development stage of step 9 we are currently at  
draw the data flow of step 9 and mark in red which part of step 9 we are developing
$end_task

$start_context

Follow the best practices from ../pi-extensible-workflows/  
and the experience gained from the current project,  
you need to:  
the workflow (described in `docs/workflow.md`);  
the workflow execution order is outlined in `docs/workflow.md`,  
and the concept of workflow is described in `docs/concept.md`.

Write clear, minimalist code;  
do not aim for a universal solution;  
write code specifically for the step's requirements,  
adhering to the development standards  
described in the `standards` documentation.

It is necessary to map out the contracts for each step  
and ensure that each module works in concert.  
In this context, a module is:  
an LLM agent, a script function that performs a task, a Guardrail validation function, and the result of LLM execution.

A clear contract for each step's work must be established.  
- What input is received?  
- What artifacts does the step generate?  
- The result (artifacts) of the work's completion is the contract.  
- The contract is verified by the Guardrails.
$end_context

$start-strategy-step-by-step
1. Write a development plan and present it as a step-by-step data flow  
2. After agreeing the plan and actions with me  
3. Develop the next part of step 9  
4. Test it on eddi and on t2
$end-strategy-step-by-step
