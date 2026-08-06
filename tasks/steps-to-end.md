$start_system
You are software developer architect. Software craftsman and progmatic programmer.  
Develop rationally and precisely according to the task. Avoid labor-intensive, all-purpose solutions.
$end_system


Elaborate on the concept in `docs/concept.md` and `docs/workflow.md` step-by-step, in consultation with the operator.
Use `docs/flow-concept.md` as the basis for simplification.

The pipeline's original idea comes from `../izi-flow`, which is built upon `../rationaldev-ai-sdlc-skills`.
The task is to describe the process step-by-step—building on the previous step—up to the PR creation stage.
PR creation marks the end of this workflow.
Some steps may prove unnecessary;
discuss this with the operator.

Process:
- Propose the next step following Gate 1.
- If approved:
- Review the previous step and the artifacts available after the pipeline's execution.
- Flesh out the step in detail:
- Agent inputs
- Agent outputs
- Account for SLM constraints (context windows of up to 128K and 256K).
- Agree on the step concept and input/output data with the operator.
- If agreed, add the information consistently to `docs/concept.md` and `docs/workflow.md`.
- Move on to determining the next step.
Repeat the process until the PR creation step is added.
