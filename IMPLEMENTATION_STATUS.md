# AlgoMetis — Integrated v9 Milestone

## What is implemented in this milestone

- Added a dedicated two-input Code Review workspace while preserving the original AI Mentor page as a separate feature.
- Added a backend `POST /api/agent/analyze-code` endpoint.
- Added a five-stage analysis pipeline (assignment understanding, C-code analysis, metric evaluation, algorithm recommendation, critic/validation).
- Added heuristic C algorithm recognition for Bubble, Selection, Insertion, Merge, Quick and Heap Sort, plus basic question classification for sorting/searching/graph tasks.
- Added 15 report metrics, source warnings, algorithm trade-off alternatives and a concise summary.
- Added responsive UI sections for overview, metrics, alternatives and code observations.
- Preserved the v8 home page, AI Mentor recommendation workflow, algorithm visualizers/code previews, tutor, explorer and practice games.
- Added separate navigation entries for AI Mentor and Code Review.
- Added automated tests for the new analysis module.

## 15 metrics returned for every analysis

1. Time complexity
2. Auxiliary space complexity
3. Estimated execution time
4. Estimated declared memory footprint
5. Cache memory / locality
6. Execution-speed growth class
7. Variable sizes
8. Loop count and nesting
9. Comparison/operator source count
10. Data-movement / swap source-pattern count
11. Recursion detection
12. Input scalability
13. Approximate cyclomatic complexity
14. Source size
15. Algorithm-pattern recognition / maintainability signal

## Accuracy and safety boundaries

The current prototype performs static, heuristic analysis. It does not compile or execute user-provided C source. Running arbitrary student code on the web server would be unsafe without a disposable sandbox. Therefore:

- Execution time is a model-based estimate, not measured runtime.
- Memory is an estimate from recognized declarations; heap allocations and runtime overhead are not fully captured.
- Cache size, cache misses, cache hit ratio and CPU cycles are hardware/OS-specific and cannot be inferred reliably from source text. They are marked unknown or qualitative.
- C variable sizes use common ABI assumptions (for example, `int=4` and pointer `=8` bytes); use `sizeof` on the target compiler for exact values.
- Algorithm identification and complexity are heuristic, not a full C parser or formal proof.

## Next implementation milestones

1. Add a C parser/AST (rather than regex-only recognition) and compiler diagnostics.
2. Add a disposable container/VM execution sandbox with strict CPU, memory, process, filesystem and wall-clock limits.
3. Benchmark multiple input sizes and report actual median/p95 runtime and peak resident memory.
4. Add Linux `perf` or equivalent hardware-counter integration where permitted; show unsupported on systems without access.
5. Expand constraint-aware recommendations beyond the current sorting-focused recommendation rules.
6. Add LLM-assisted NLP clarification and explanations while retaining deterministic verification.

## Run locally

- Install Node.js 20 or later.
- Run `npm install`.
- Run `npm run dev` for development, or `npm run setup` followed by `npm start`.
- Open the local URL printed by the server and choose **Code Review**.
