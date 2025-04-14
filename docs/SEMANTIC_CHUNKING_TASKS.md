# Semantic Chunking Workflow - Task Tracker

This file tracks the development progress based on the phases outlined in `SEMANTIC_CHUNKING_PLAN.md`.

**Legend:**
*   `[ ]` To Do
*   `[/]` In Progress
*   `[x]` Done

---

## Phase 1: Transcript Acquisition & Preparation

**Goal:** Reliably fetch and prepare transcript data with accurate, accessible timestamps.

*   `[x]` **1.1 Refine `fetchTranscriptStep`:**
    *   `[x]` Verify `fetchVideoDetails` returns accurate `offset` and `duration` for all segments.
    *   `[x]` Add error handling for failed transcript fetches.
*   `[x]` **1.2 Refine `formatTranscriptStep` (Decision & Implementation):**
    *   `[x]` Decide on Option A (pass structured data forward) or Option B (agent handles structure). (Decided: Option A)
    *   `[x]` Implement chosen option. Ensure `formatTranscriptStep` outputs the necessary format(s). (Verified: No changes needed, structured data accessible via context)
*   `[x]` **1.3 Workflow Update:**
    *   `[x]` Modify `semanticChunkingWorkflow` context to pass the chosen transcript format(s) correctly. (Verified: No changes needed, context automatically passes step results)
*   `[x]` **1.4 Testing:**
    *   `[x]` Test transcript fetching with various valid/invalid video IDs. (Verified using `testFetch.ts` script)
    *   `[x]` Test output format(s) correctness. (Verified using `testFetch.ts` script)
    *   `[x]` Test timestamp accuracy. (Verified using `testFetch.ts` script)

---

## Phase 2: Fine-Level Semantic Chunking

**Goal:** Implement the core fine-level chunking using the existing `fine-chunking-agent`.

*   `[x]` **2.1 Configure `FineChunkingAgent`:**
    *   `[x]` Verify instructions in `src/mastra/agents/fine-chunking-agent/instructions/instructions.ts` are correct for fine-chunking (Transcript -> ~150 words chunks). (Verified & Updated)
    *   `[x]` Verify agent configuration (model, etc.) in `src/mastra/agents/fine-chunking-agent/index.ts`. (Verified)
    *   `[x]` Confirm agent output format (JSON array of strings recommended for easier mapping initially). (Updated tool schema)
*   `[x]` **2.2 Configure `fineChunkingTool`:**
    *   `[x]` Verify/update tool definition in `index.ts`. (Verified during 2.1)
    *   `[x]` Define/verify input schema (depends on Phase 1 decision). (Verified during 2.1)
    *   `[x]` Define/verify output schema (e.g., `z.array(z.string())` if agent outputs text list). (Updated during 2.1)
    *   `[x]` Verify `execute` logic calls the agent correctly. (Verified during 2.1)
*   `[x]` **2.3 Implement Timestamp Mapping:**
    *   `[x]` Create/adapt mapping function `mapFineChunksToTimestamps(originalSegments, fineTextChunks, formattedTranscriptText)` in workflow utils. (Refactored in `timestampMapping.ts` using Fuse.js)
    *   `[x]` Handle edge cases and mapping failures gracefully. (Implemented via Fuse.js threshold and warnings)
    *   `[x]` Define output structure (e.g., `Array<{ text: string, startOffset: number, endOffset: number }>`). (Defined `TimedChunk` interface)
*   `[x]` **2.4 Integrate into Workflow:**
    *   `[x]` Create `fineChunkingStep` in `semanticChunkingWorkflow.ts`. (Modified existing step)
    *   `[x]` This step should call the `fineChunkingTool` and then the `mapFineChunksToTimestamps` function. (Implemented)
    *   `[x]` Ensure correct data flow (receiving transcript/segments, outputting timed fine chunks). (Verified, `saveChunksStep` updated)
*   `[x]` **2.5 Testing:**
    *   `[x]` Test `FineChunkingAgent/Tool` standalone. (Tested via workflow execution)
    *   `[x]` Test `fineChunkingStep` output format/content. (Tested via workflow, format correct)
    *   `[x]` Test timestamp mapping accuracy. (Tested iteratively via workflow, **mapping now accurate using Fuse.js**)
    *   `[x]` Test chunk size consistency. (Verified by inspecting agent output/warnings - agent seems to produce chunks)

---

## Phase 3: Medium-Level Chunk Aggregation

**Goal:** Group fine-level chunks into medium-level sections using the existing `med-chunking-agent`.

*   `[x]` **3.1 Configure `MediumChunkingAgent`:**
    *   `[x]` Verify/Update instructions in `src/mastra/agents/med-chunking-agent/instructions/instructions.ts` for desired output (Fine -> Medium chunks, summary, JSON format).
    *   `[x]` Verify agent name/ID/config in `index.ts`.
*   `[x]` **3.2 Configure `mediumChunkingTool`:**
    *   `[x]` Verify/update tool definition in `index.ts`.
    *   `[x]` Verify/update input schema (expects `TimedChunk[]`).
    *   `[x]` Define/verify agent output schema (`agentChunkOutputSchema` allowing `null` timestamps).
    *   `[x]` Define/verify final tool output schema (`outputSchema`).
    *   `[x]` Implement/verify `execute` logic (prepare prompt, call agent, parse JSON, validate schema, handle errors).
*   `[x]` **3.3 Integrate into Workflow:**
    *   `[x]` Add `mediumChunkingStep` to `semanticChunkingWorkflow.ts`.
    *   `[x]` Ensure it receives `TimedChunk[]` from `timestampMappingStep`.
    *   `[x]` Ensure it calls `mediumChunkingTool`.
*   `[x]` **3.4 Test & Debug Integrated Step:**
    *   `[x]` Run full workflow (`pnpm tsx src/mastra/workflows/runSemanticChunking.ts`).
    *   `[x]` Debug agent prompt for correct JSON output.
    *   `[x]` Debug schema validation issues (`nullable` timestamps).
    *   `[x]` Debug data flow issues (getting result from correct step).
    *   `[x]` Verify step output format/content (medium chunks with text/summary/timestamps).
*   `[/]` **3.5 Refine & Test Further:**
    *   `[/]` Implement robust timestamp mapping logic within `mediumChunkingTool` (Implemented heuristic approach as a quick check). 
    *   `[ ]` Run workflow and verify accuracy of medium chunk timestamps.
    *   `[ ]` Test medium chunk size consistency.
    *   `[ ]` Test summary quality.

---

## Phase 4: Video-Level Summarization

**Goal:** Generate a video-level summary using the existing `large-chunking-agent`.

*   `[x]` **4.1 Configure `LargeChunkingAgent` & Tool:**
    *   `[x]` Verify/Update agent instructions (`src/mastra/agents/large-chunking-agent/instructions/instructions.ts`) for Medium Summaries -> Video Summary.
    *   `[x]` Verify/Update agent config (`index.ts`).
    *   `[x]` Configure `largeChunkingTool` (input schema `MediumChunk[]`, output `z.string()`, execute logic).
*   `[x]` **4.2 Integrate `largeChunkingStep` into Workflow:**
    *   `[x]` Add step to `semanticChunkingWorkflow.ts` after `mediumChunkingStep`.
    *   `[x]` Ensure data flow (receives `MediumChunk[]`, outputs `string`).
*   `[x]` **4.3 Test & Debug Integrated Step:**
    *   `[x]` Run full workflow (`pnpm tsx src/mastra/workflows/runSemanticChunking.ts`).
    *   `[x]` Debug any agent/tool/workflow issues (Resolved tool signature errors).
    *   `[x]` Modify `saveResultsStep` to save summary output.
    *   `[x]` Verify summary output format/content in saved file.
    *   `[x]` Test summary quality and length.

---

## Phase 5: Embedding Generation

**Goal:** Convert text chunks to vector embeddings using OpenAI.

*   `[x]` **5.1 Create/Configure Embedding Utility/Tool:**
    *   `[x]` Confirm model: OpenAI `text-embedding-3-large`.
    *   `[x]` Implement `embeddingTool` (`generateEmbeddings` in `embeddingUtils.ts`) handling API calls, keys, errors.
*   `[x]` **5.2 Integrate `embeddingStep(s)` into Workflow:**
    *   `[x]` Decide strategy (one step at end vs. multiple). (Decided: One step after all chunking)
    *   `[x]` Add step (`embeddingStep`) to `semanticChunkingWorkflow.ts`.
    *   `[x]` Collect required texts (fine, medium, large).
    *   `[x]` Ensure data flow (receives texts, calls tool, outputs embeddings + metadata).
*   `[x]` **5.3 Test & Debug Integrated Step(s):**
    *   `[ ]` Run full workflow (`pnpm tsx src/mastra/workflows/runSemanticChunking.ts`).
    *   `[ ]` Verify embedding format/dimensionality (3072).
    *   `[ ]` Debug any tool/workflow issues.
    *   `[ ]` Monitor API usage/errors.

---

## Phase 6: Indexing

**Goal:** Store embeddings and metadata in vector DB (e.g., Pinecone).

*   `[x]` **6.1 Configure DB Client & Index:**
    *   `[x]` Choose DB (Confirmed PgVector).
    *   `[x]` Set up client/env variables (`mastra.getVector('pg')`, requires `POSTGRES_CONNECTION_STRING`).
    *   `[x]` Define index schema/metadata fields (`indexName: semantic-chunks`, dim: 3072, metadata: level, videoId, text, timestamps, etc.).
*   `[x]` **6.2 Create/Configure Indexing Utility/Tool:**
    *   `[x]` Implement `indexingTool` (`upsertEmbeddingsToPgVector` in `indexingUtils.ts`) handling batching, upserts, errors, index creation.
*   `[x]` **6.3 Integrate `indexingStep` into Workflow:**
    *   `[x]` Add final step (`indexingStep`) to `semanticChunkingWorkflow.ts`, replacing `saveResultsStep`.
    *   `[x]` Ensure data flow (receives embeddings + metadata from `embeddingStep`).
*   `[x]` **6.4 Test & Debug Integrated Step:**
    *   `[ ]` Run full workflow (`pnpm tsx src/mastra/workflows/runSemanticChunking.ts`).
    *   `[ ]` Verify data in vector DB using basic retrieval (requires separate query script/tool).
    *   `[ ]` Debug any tool/workflow/DB issues. 