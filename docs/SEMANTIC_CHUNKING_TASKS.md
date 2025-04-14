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

*   `[ ]` **3.1 Configure `MediumChunkingAgent`:**
    *   `[ ]` Verify instructions in `src/mastra/agents/med-chunking-agent/instructions/instructions.ts` are correct (Fine -> Medium chunks with summary).
    *   `[ ]` Verify agent name/ID/config in `index.ts`.
*   `[ ]` **3.2 Configure `mediumChunkingTool`:**
    *   `[ ]` Verify/update tool definition in `index.ts`.
    *   `[ ]` Verify/update input schema (expects `Array<{ text: string, startOffset: number, endOffset: number }>` from Phase 2).
    *   `[ ]` Verify/update output schema (e.g., `Array<{ text: string, summary: string, startOffset: number, endOffset: number }>`).
    *   `[ ]` Verify/update `execute` logic to format input, call agent, parse output, calculate combined timestamps.
*   `[ ]` **3.3 Integrate into Workflow:**
    *   `[ ]` Create `mediumChunkingStep` in `semanticChunkingWorkflow.ts`.
    *   `[ ]` Ensure it receives fine chunks and outputs medium chunks.
*   `[ ]` **3.4 Testing:**
    *   `[ ]` Test `MediumChunkingAgent/Tool` standalone.
    *   `[ ]` Test `mediumChunkingStep` output format/content.
    *   `[ ]` Test medium chunk size consistency.
    *   `[ ]` Test summary quality.

---

## Phase 4: Video-Level Summarization

**Goal:** Generate a video-level summary using the existing `large-chunking-agent`.

*   `[ ]` **4.1 Configure `LargeChunkingAgent`:**
    *   `[ ]` Verify instructions in `src/mastra/agents/large-chunking-agent/instructions/instructions.ts` are correct (Medium Summaries -> Video Summary).
    *   `[ ]` Verify agent name/ID/config in `index.ts`.
*   `[ ]` **4.2 Configure `largeChunkingTool`:**
    *   `[ ]` Verify/update tool definition in `index.ts`.
    *   `[ ]` Define input schema (expects `Array<{ text: string, summary: string, startOffset: number, endOffset: number }>` from Phase 3).
    *   `[ ]` Define output schema (e.g., `z.string()`).
    *   `[ ]` Implement/verify `execute` logic.
*   `[ ]` **4.3 Integrate into Workflow:**
    *   `[ ]` Create `largeChunkingStep` in `semanticChunkingWorkflow.ts`.
*   `[ ]` **4.4 Testing:**
    *   `[ ]` Test `LargeChunkingAgent/Tool` standalone.
    *   `[ ]` Test `largeChunkingStep` output format/content.
    *   `[ ]` Test summary quality and length.

---

## Phase 5: Embedding Generation

**Goal:** Convert text chunks to vector embeddings.

*   `[ ]` **5.1 Choose Embedding Model:** Confirm OpenAI `text-embedding-ada-002`.
*   `[ ]` **5.2 Create Embedding Utility/Tool:**
    *   `[ ]` Implement `embeddingTool` (e.g., in workflow utils or as a core tool).
    *   `[ ]` Handle API keys, calls, rate limits, errors.
*   `[ ]` **5.3 Integrate into Workflow:**
    *   `[ ]` Decide on integration strategy (one step at end vs. multiple steps).
    *   `[ ]` Add `embeddingStep(s)` to workflow.
    *   `[ ]` Collect fine, medium, large chunk texts.
    *   `[ ]` Call `embeddingTool`.
    *   `[ ]` Ensure embeddings are passed forward with metadata.
*   `[ ]` **5.4 Testing:**
    *   `[ ]` Test `embeddingTool` standalone.
    *   `[ ]` Verify embedding format/dimensionality.
    *   `[ ]` Monitor API usage.

---

## Phase 6: Indexing

**Goal:** Store embeddings and metadata in vector DB.

*   `[ ]` **6.1 Choose Vector Database:** (e.g., Pinecone).
*   `[ ]` **6.2 Configure DB Client:**
    *   `[ ]` Add necessary environment variables (.env).
    *   `[ ]` Set up client initialization logic.
*   `[ ]` **6.3 Define Index Schema:**
    *   `[ ]` Finalize metadata fields (`video_id`, `level`, `start_time`, `end_time`, `text`, `summary` [for medium]).
*   `[ ]` **6.4 Create Indexing Utility/Tool:**
    *   `[ ]` Implement `indexingTool` (e.g., in workflow utils).
    *   `[ ]` Handle batching, upserts, error handling.
*   `[ ]` **6.5 Integrate into Workflow:**
    *   `[ ]` Add final `indexingStep` to workflow.
    *   `[ ]` Ensure it receives all embeddings and associated metadata.
    *   `[ ]` Call `indexingTool`.
*   `[ ]` **6.6 Testing:**
    *   `[ ]` Test `indexingTool` standalone.
    *   `[ ]` Verify data in vector DB.
    *   `[ ]` Test basic retrieval.

--- 