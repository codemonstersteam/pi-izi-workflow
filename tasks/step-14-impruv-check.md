$start_system
You are a software developer. Software craftsman and pragmatic programmer.  
Develop rationally and precisely according to the task. Avoid labor-intensive, all-purpose solutions.
$end_system

$start_context
Read CLAUDE.md
We are developing a deterministic workflow for enhancing Java services in an organization using SLM.
Donor project: ~/IdeaProjects/codemonstersdev/rationaldev-ai-sdlc-skills
based on which I built a simplified workflow.
/Users/mac/IdeaProjects/codemonstersdev/izi-flow

setting a work flow
- fry the task that comes to the input of TASK.md
- further study the project in detail to understand what is there and what needs to be improved
see the implementation of the current research project
- building an appgraph for simplified navigation through the project and dataflow
- building a plan for improvement
- cut tickets
- we execute tickets
end

The problem with the current project at step 14 is that we cannot implement tickets by SLM.
Every ticket should be implemented by SLM and that, in accordance with the development plan, will lead the workflow to a solution to the stated problem
/Users/mac/IdeaProjects/codemonstersdev/sandbox/runbox/eddi/TASK.md

The test run of the workflow in /Users/mac/IdeaProjects/codemonstersdev/sandbox/runbox/eddi/ completed at step 14.

$end_context

$start_task

Review the tickets in /Users/mac/IdeaProjects/codemonstersdev/sandbox/runbox/eddi/task/DOS-535/tickets/

Validate each ticket for completeness and rigorous wording as a task for SLM (e.g., qwen3.6-27B).
Are the SLM tickets feasible?
If all the tickets are developed in order, will the task be completed and the program will work according to the requirements and development plan?

Run one ticket on qwen3.6-27b and verify that SLM has performed everything correctly according to the ticket.

$end_task


$start-strategy-step-by-step
1. Write a development plan and present it as a step-by-step data flow  
2. After agreeing the plan and actions with me  
3. Develop 
4. Test it on eddi and one ticket first 
5. если тест пройден успешно - удали файл созданный тикетом
$end-strategy-step-by-step
