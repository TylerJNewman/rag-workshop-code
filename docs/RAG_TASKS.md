# RAG System - Task Tracker

This file tracks the development progress for the RAG system based on the phases outlined in `RAG_IMPLEMENTATION_PLAN.md`.

**Legend:**
*   `[ ]` To Do
*   `[/]` In Progress
*   `[x]` Done

---

## Phase 1: Basic Vector Retrieval

**Goal:** Implement the fundamental ability to retrieve relevant text chunks from the vector database based on a user query.

*   `[ ]` **1.1 Access Embedding Function:**
    *   `[ ]` Locate/confirm the embedding function/model used during indexing (e.g., `openai.embedding("text-embedding-3-small")`).
    *   `[ ]` Ensure it can be imported/used in the new RAG retrieval logic.
*   `[ ]` **1.2 Implement `generateQueryEmbedding`:**
    *   `[ ]` Create function `generateQueryEmbedding(query: string): Promise<number[]>` in a new utility file (e.g., `src/mastra/rag/retrievalUtils.ts`).
    *   `[ ]` Call the embedding model (from 1.1) with the user query.
    *   `[ ]` Add basic error handling.
*   `[ ]` **1.3 Implement `searchChunks`:**
    *   `[ ]` Create function `searchChunks(queryVector: number[], topK: number, indexName: string, filter?: Record<string, any>): Promise<RetrievedChunk[]>` in `retrievalUtils.ts`. (Define `RetrievedChunk` type based on expected DB result).
    *   `[ ]` Get PgVector instance: `mastra.getVector('pg')`.
    *   `[ ]` Implement the call to `pgVector.query(...)` using `queryVector`, `topK`, `indexName`, and optional `filter`.
    *   `[ ]` Handle potential query errors.
    *   `[ ]` Determine initial strategy for retrieving fine/medium chunks (e.g., no filter, two queries).
*   `[ ]` **1.4 Implement `retrieveContext`:**
    *   `[ ]` Create wrapper function `retrieveContext(query: string, topK: number = 10): Promise<RetrievedChunk[]>` in `retrievalUtils.ts`.
    *   `[ ]` Call `generateQueryEmbedding(query)`.
    *   `[ ]` Call `searchChunks(...)` with the resulting vector and `topK`.
    *   `[ ]` Return the results from `searchChunks`.
*   `[ ]` **1.5 Testing:**
    *   `[ ]` Write basic tests or manual test cases for `retrieveContext`.
    *   `[ ]` Execute with sample queries (e.g., "What is Lucia?", "session expiration").
    *   `[ ]` Verify retrieved chunk relevance and presence of both fine/medium chunks.

---

## Phase 2: Basic Answer Generation

*   `[ ]` **2.1 Define `ragAgent`:**
    *   `[ ]` Create `src/mastra/agents/rag-agent/instructions/instructions.ts` with RAG prompt emphasizing using only provided context.
    *   `[ ]` Create `src/mastra/agents/rag-agent/index.ts`, defining the `ragAgent` with a generator model (e.g., `google(env.GEMINI_PRO_MODEL || 'gemini-1.5-pro-latest')`).
*   `[ ]` **2.2 Define Prompt Template:**
    *   `[ ]` Create a constant for the prompt template string in a relevant utils file (e.g., `src/mastra/rag/promptUtils.ts`).
*   `[ ]` **2.3 Implement `formatContext`:**
    *   `[ ]` Create function `formatContext(chunks: RetrievedChunk[]): string` in `promptUtils.ts`.
    *   `[ ]` Format chunk text (e.g., `chunks.map(c => c.metadata.text || c.text).join('\n---\n')`). Handle cases where text might be nested differently.
*   `[ ]` **2.4 Implement `generateAnswer`:**
    *   `[ ]` Create function `generateAnswer(query: string, contextChunks: RetrievedChunk[]): Promise<string>` in `src/mastra/rag/generationUtils.ts`.
    *   `[ ]` Import `ragAgent`, `promptTemplate`, `formatContext`.
    *   `[ ]` Call `formatContext`.
    *   `[ ]` Construct the full prompt.
    *   `[ ]` Call `ragAgent.generate(fullPrompt)`.
    *   `[ ]` Return `agentResult.text`.
*   `[ ]` **2.5 Testing:**
    *   `[ ]` Test `generateAnswer` with fixed context.
    *   `[ ]` Test with context missing the answer.
    *   `[ ]` Test end-to-end: `retrieveContext` -> `generateAnswer`.

---

## Phase 3: Timestamp Identification and Citation

*   `[ ]` **3.1 Refine Retrieval:**
    *   `[ ]` Modify `searchChunks` / `retrieveContext` to ensure relevant *fine-level* chunks are explicitly retrieved and available (potentially via a separate query or specific filtering).
*   `[ ]` **3.2 Implement Answer Segmentation:**
    *   `[ ]` Choose strategy (sentences, phrases) and implement/find a library for splitting the answer string.
*   `[ ]` **3.3 Implement `findRelevantFineChunks`:**
    *   `[ ]` Create function `findRelevantFineChunks(answerSegment: string, retrievedFineChunks: RetrievedFineChunk[]): Promise<RetrievedFineChunk[]>` in `src/mastra/rag/citationUtils.ts`.
    *   `[ ]` Implement similarity logic (e.g., Fuse.js, simple includes).
*   `[ ]` **3.4 Implement Timestamp Aggregation:**
    *   `[ ]` Create function `getAnswerCitations(answer: string, fineChunks: RetrievedFineChunk[]): Promise<{ startOffset: number, endOffset: number }[]>` in `citationUtils.ts`.
    *   `[ ]` Loop through answer segments, call `findRelevantFineChunks`.
    *   `[ ]` Extract, deduplicate, and merge timestamps.
*   `[ ]` **3.5 Combine Results:**
    *   `[ ]` Define final response structure (e.g., `{ answer: string, citations: { startOffset: number, endOffset: number }[] }`).
*   `[ ]` **3.6 Testing:**
    *   `[ ]` Test `findRelevantFineChunks`.
    *   `[ ]` Test `getAnswerCitations` with known inputs/outputs.
    *   `[ ]` Test end-to-end flow including citation generation.

---

## Phase 4: Query Pre-processing & Filtering

*   `[ ]` **4.1 Implement Filtering in `searchChunks`:**
    *   `[ ]` Add `filter` parameter to `searchChunks`.
    *   `[ ]` Translate filter object to `pgVector.query` format.
*   `[ ]` **4.2 Update `retrieveContext`:**
    *   `[ ]` Add optional `filter` parameter and pass it down.
*   `[ ]` **4.3 (Optional) Basic Query Analysis:**
    *   `[ ]` Implement simple keyword/tag extraction from query.
    *   `[ ]` Modify `retrieveContext` to auto-apply filters based on analysis.
*   `[ ]` **4.4 Testing:**
    *   `[ ]` Test `searchChunks` with filters.
    *   `[ ]` Test optional query analysis.
    *   `[ ]` Test end-to-end flow with filtered queries.

---

## Phase 5: Simple CLI Testing Interface

*   `[ ]` **5.1 Create Script `src/scripts/runRAGQuery.ts`:**
*   `[ ]` **5.2 Implement Argument Parsing:**
    *   `[ ]` Use `yargs` or `process.argv` for `--query` and optional `--videoId`.
*   `[ ]` **5.3 Implement `performRAG` function:**
    *   `[ ]` Orchestrate calls to `retrieveContext`, `generateAnswer`, `getAnswerCitations`.
*   `[ ]` **5.4 Implement Output Formatting:**
    *   `[ ]` Print answer and citations clearly to console.
*   `[ ]` **5.5 Add `package.json` Script:**
    *   `[ ]` Add `"rag:query": "tsx src/scripts/runRAGQuery.ts"`.
*   `[ ]` **5.6 Testing:**
    *   `[ ]` Run `pnpm rag:query` with various arguments.
    *   `[ ]` Check output quality and format. 