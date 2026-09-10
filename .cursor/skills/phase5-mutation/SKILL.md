---
name: phase5-mutation
description: Dynamic Stryker Mutation Testing Auditor. Runs mutation tests on pure logic modules and adds exact killer assertions for survived mutants.
disable-model-invocation: true
---

# 🔴 Phase 5 — Dynamic Mutation Testing

When invoked, run Stryker mutation testing and eliminate survived mutants in pure helper functions.

## 🚀 Step 1: Execution
1. Run Stryker mutation testing command (e.g., `bun run test:...:mutation` or `bunx stryker run`).
2. Locate the mutation output report or clear-text summary.

## 🎯 Step 2: Mutant Extermination Loop
For every **Survived Mutant**:
1. Inspect the mutant location, modified operator (e.g., `<` changed to `<=`, `Math.min` to `Math.max`), and file line.
2. Add a targeted, exact boundary assertion (`expect(...).toBe(...)`) in the corresponding unit/table test.
3. Re-run mutation test until **Mutation Score ≥ 85%**.
4. **Rule:** Improve test sharpness—do NOT edit production logic purely to game the mutant.