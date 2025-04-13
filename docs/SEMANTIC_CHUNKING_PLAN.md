# Semantic Chunking Workflow Implementation Plan

This plan outlines the phased implementation of the semantic chunking workflow, utilizing distinct agents/tools for different levels of granularity. Each phase aims to be independently testable.

**Underlying Agents/Tools (Assumed/Required):**

*   **Transcript Fetcher:** Retrieves transcript data with timestamps (Existing: `fetchVideoDetails`, `formatTranscript` - needs review for timestamp preservation).
*   **Fine Chunking Agent/Tool (Phase 2):** Takes full transcript text, outputs fine-level semantic chunks (~100-200 words) with associated timestamps. (***Requires Creation/Identification***)
*   **Medium Chunking Agent/Tool (Phase 3):** Takes fine-level chunks, aggregates them into medium-level chunks (~500 words) with summaries and timestamps. (Existing: `fine-chunking-agent`, needs input adaptation).
*   **Large Chunking Agent/Tool (Phase 4):** Takes medium-level chunks, generates a video-level summary (~1000 words). (Existing: `med-chunking-agent` or `large-chunking-agent`).
*   **Embedding Generator:** Creates vector embeddings (e.g., OpenAI `text-embedding-ada-002`).
*   **Vector Store Indexer:** Stores embeddings and metadata in a vector database.

---

## Phase 1: Transcript Acquisition & Preparation

**Goal:** Reliably fetch and prepare transcript data with accurate, accessible timestamps for later mapping.

**Input:** Video ID.
**Output:** Structured transcript data (e.g., `Array<{ text: string, startOffset: number, duration: number }>` or similar) readily available for the next phase.

**Steps:**

1.  **Refine `fetchTranscriptStep`:** Ensure `fetchVideoDetails` consistently returns the raw transcript segments with accurate `offset` and `duration`.
2.  **Refine `formatTranscriptStep` (Decision Point):**
    *   **Option A (Simpler for Fine Chunking Input):** Keep it creating a single formatted string *but also* pass the original structured transcript (from `fetchTranscriptStep`) forward for timestamp mapping *after* fine chunking.
    *   **Option B (More Complex Input Handling):** Modify the (to-be-created) Fine Chunking Agent to accept the *structured* transcript directly, potentially simplifying timestamp handling within that agent.
3.  **Workflow Update:** Modify the workflow to pass the necessary transcript format(s) to subsequent steps.
4.  **Testing:**
    *   Verify transcript fetching for various video IDs.
    *   Confirm output format (single string and/or structured data) is correct.
    *   Check timestamp accuracy in the structured data.

---

## Phase 2: Fine-Level Semantic Chunking

**Goal:** Implement the core fine-level chunking using a dedicated agent.

**Input:** Prepared transcript data (format depends on Phase 1 decision).
**Output:** An array of fine-level semantic chunks (e.g., `Array<{ text: string, startOffset: number, endOffset: number }>` ) derived from the LLM output and mapped back to original timestamps.

**Steps:**

1.  **Create `FineChunkingAgent`:**
    *   Define agent instructions based on the plan: "Given the following transcript segment, split it into semantically coherent paragraphs (100-200 words each), keeping key ideas intact. Return each chunk..." (Decide on exact output format - raw text list, JSON, etc.).
    *   Choose the LLM (e.g., Gemini).
2.  **Create `fineChunkingTool`:** Wrap the agent in a tool. Define input/output schemas.
3.  **Implement Timestamp Mapping:**
    *   If the agent returns text chunks, create/adapt a function (like the original `mapTimestampsToSemanticChunks`) to map these text chunks back to the *original structured transcript* from Phase 1 to get accurate `startOffset` and `endOffset`. Handle potential mapping errors.
    *   If the agent handles timestamps internally (less likely), ensure its output schema reflects this.
4.  **Integrate into Workflow:** Add a new `fineChunkingStep` to the workflow after `formatTranscriptStep`. Ensure correct data flow (passing transcript and potentially original segments).
5.  **Testing:**
    *   Test the `FineChunkingAgent` standalone with sample transcripts.
    *   Verify the `fineChunkingStep` output format and content.
    *   Critically evaluate the accuracy of the mapped timestamps.
    *   Check chunk size consistency (~100-200 words).

---

## Phase 3: Medium-Level Chunk Aggregation

**Goal:** Group fine-level chunks into meaningful medium-level sections using the existing (renamed/repurposed) agent.

**Input:** Array of fine-level chunks from Phase 2.
**Output:** Array of medium-level chunks (e.g., `Array<{ text: string, summary: string, startOffset: number, endOffset: number }>` ).

**Steps:**

1.  **Adapt/Rename `fine-chunking-agent` to `MediumChunkingAgent`:**
    *   Confirm its instructions are correct for Phase 3: "Given these sequential fine-level transcript chunks, group them into coherent topics... ~500 words... Provide a short summary... Maintain timestamps."
    *   Update agent/tool name/ID if desired (`mediumChunkingAgent`, `mediumChunkingTool`).
2.  **Update `mediumChunkingTool` Schemas:** Ensure input schema expects an array of fine chunks (matching Phase 2 output) and output schema reflects the medium chunk structure (including summary).
3.  **Implement Tool Logic:** The tool's `execute` function needs to:
    *   Receive the array of fine chunks.
    *   Format the input appropriately for the agent's prompt (likely concatenating fine chunk texts).
    *   Call the `MediumChunkingAgent`.
    *   Parse the agent's response (which should contain medium chunks and summaries).
    *   Determine the `startOffset` (from the first fine chunk) and `endOffset` (from the last fine chunk) for each aggregated medium chunk.
4.  **Integrate into Workflow:** Add `mediumChunkingStep` after `fineChunkingStep`.
5.  **Testing:**
    *   Test the `MediumChunkingAgent/Tool` standalone with sample fine chunks.
    *   Verify the `mediumChunkingStep` output format (text, summary, timestamps).
    *   Check medium chunk size consistency (~500 words).
    *   Assess the quality of the generated summaries.

---

## Phase 4: Video-Level Summarization

**Goal:** Generate a concise overview of the entire video content.

**Input:** Array of medium-level chunks from Phase 3.
**Output:** A single string containing the video-level summary.

**Steps:**

1.  **Select/Configure `LargeChunkingAgent`:** Choose between `med-chunking-agent` and `large-chunking-agent`. Ensure instructions are correct: "Given the following medium-level summaries, generate a concise... overview (~1000 words)..."
2.  **Create/Update `largeChunkingTool`:** Wrap the chosen agent. Define input (array of medium chunks/summaries) and output (single string summary) schemas.
3.  **Implement Tool Logic:** The `execute` function should:
    *   Receive the array of medium chunks.
    *   Extract summaries or relevant text from medium chunks.
    *   Format the input for the agent's prompt.
    *   Call the `LargeChunkingAgent`.
    *   Parse the agent's response to get the final summary string.
4.  **Integrate into Workflow:** Add `largeChunkingStep` after `mediumChunkingStep`.
5.  **Testing:**
    *   Test the `LargeChunkingAgent/Tool` standalone with sample medium chunks/summaries.
    *   Verify the `largeChunkingStep` output format (single string).
    *   Assess the quality, coherence, and length (~1000 words) of the generated summary.

---

## Phase 5: Embedding Generation

**Goal:** Convert text chunks (fine, medium, summary) into vector embeddings.

**Input:** Fine chunks, medium chunks, video summary.
**Output:** Vector embeddings for each input chunk.

**Steps:**

1.  **Choose Embedding Model:** Confirm use of OpenAI `text-embedding-ada-002` or other.
2.  **Create Embedding Utility/Tool:** Implement a function or tool (`embeddingTool`) that takes text (or an array of texts) and returns embeddings. Handle API calls, rate limits, and errors.
3.  **Integrate into Workflow:** Add `embeddingStep(s)` after the relevant chunking steps. This could be one step at the end processing all collected chunks, or separate steps after each chunking phase (consider efficiency). The step(s) will collect the text from fine, medium, and large chunks/summary and call the embedding utility.
4.  **Workflow Data Flow:** Ensure the workflow passes the chunk data *and* the generated embeddings to the next phase.
5.  **Testing:**
    *   Test the embedding utility/tool standalone with sample text.
    *   Verify the format and dimensionality of the output embeddings.
    *   Monitor API usage and costs.

---

## Phase 6: Indexing

**Goal:** Store embeddings and associated metadata in the vector database.

**Input:** Embeddings and corresponding metadata (chunk text, level, timestamps, video ID).
**Output:** Data successfully indexed in the vector database.

**Steps:**

1.  **Choose Vector Database:** Select Mastra AI-supported DB (Pinecone, Qdrant, etc.).
2.  **Configure DB Client:** Set up connection credentials and client library.
3.  **Define Index Schema:** Determine the structure for storing vectors and metadata fields (`video_id`, `level`, `start_time`, `end_time`, `text`, potentially `semantic_tags`).
4.  **Create Indexing Utility/Tool:** Implement a function or tool (`indexingTool`) that takes embeddings and metadata and performs upsert operations into the vector DB. Handle batching and errors.
5.  **Integrate into Workflow:** Add `indexingStep` at the end of the workflow. This step receives all embeddings and metadata generated throughout the workflow and calls the indexing utility.
6.  **Testing:**
    *   Test the indexing utility/tool standalone with sample data.
    *   Verify data is correctly written to the vector database using DB-specific tools or APIs.
    *   Check queryability of the indexed data.

--- 