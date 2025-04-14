# RAG System Implementation Plan

This document outlines the phased implementation plan for the Retrieval-Augmented Generation (RAG) system, leveraging the previously indexed semantic chunks (fine, medium, large) and their metadata. The goal is to create a system that can answer user questions based on video content and provide relevant timestamps.

**Core Strategy:**

1.  **Retrieve:** Use vector search to find relevant fine and medium chunks based on the user's query and potentially metadata filters.
2.  **Augment:** Construct a prompt for a generator LLM, including the user query and the retrieved chunk content as context.
3.  **Generate:** Have the LLM generate an answer based *only* on the provided context.
4.  **Cite:** After generation, map segments of the answer back to the initially retrieved *fine* chunks to identify corresponding timestamps.

---

## Phase 1: Basic Vector Retrieval

**Goal:** Implement the fundamental ability to retrieve relevant text chunks from the vector database based on a user query.

**Input:**
*   User query string.
*   Target index name (`semantic_chunks`).

**Output:**
*   An array of retrieved chunk objects (containing text and metadata) sorted by relevance.

**Steps:**
1.  **Embedding Function:** Ensure access to the same embedding model function used during indexing (e.g., OpenAI `text-embedding-3-small` via `@ai-sdk/openai`).
2.  **Query Embedding:** Implement a function `generateQueryEmbedding(query: string)` that takes the user query and returns its vector embedding using the chosen model.
3.  **Vector Search Function:** Implement a function `searchChunks(queryVector: number[], topK: number, indexName: string, filter?: Record<string, any>)`.
    *   This function will interact with the configured PgVector instance (`mastra.getVector('pg')`).
    *   It should perform a similarity search using the `queryVector`.
    *   Initially, retrieve a mix of fine and medium chunks (e.g., retrieve `topK` results without filtering by `level` yet, or perform two separate queries for `topK/2` fine and `topK/2` medium).
    *   The function should return the retrieved chunks, including their metadata.
4.  **Core Retrieval Logic:** Create a simple wrapper function `retrieveContext(query: string)` that calls `generateQueryEmbedding` and then `searchChunks`.

**Testing Strategy:**
*   Write unit tests for `generateQueryEmbedding` (if feasible) and `searchChunks`.
*   Manually invoke `retrieveContext` with sample queries related to known video content (e.g., "What is Lucia?", "How to handle session expiration?").
*   Inspect the `text` and `metadata` of the returned chunks. Verify that the content seems semantically relevant to the query. Check that both fine and medium chunks are being returned.

---

## Phase 2: Basic Answer Generation

**Goal:** Integrate a generator LLM to produce an answer based *only* on the context retrieved in Phase 1.

**Input:**
*   User query string.
*   Array of retrieved chunk objects (from Phase 1).

**Output:**
*   A single string containing the LLM-generated answer.

**Steps:**
1.  **Define RAG Agent:** Create a new Mastra Agent (`ragAgent` in `src/mastra/agents/rag-agent/`) configured with a suitable generator model (e.g., Gemini Pro, GPT-4o). Its instructions should emphasize answering *only* based on the provided context.
2.  **Prompt Template:** Define a clear and simple prompt template string. Example:
    ```
    You are an AI assistant answering questions about a video based *only* on the provided context paragraphs. Do not use any prior knowledge. If the answer is not present in the context, say "The provided context does not contain the answer to this question."

    Context paragraphs:
    ---
    {context}
    ---

    Question: {query}

    Answer:
    ```
3.  **Context Formatting:** Create a function `formatContext(chunks: RetrievedChunk[])` that takes the array of retrieved chunks and formats their `text` content into a single string suitable for insertion into the `{context}` placeholder (e.g., separated by newlines or markers).
4.  **Generation Function:** Implement a function `generateAnswer(query: string, contextChunks: RetrievedChunk[])`.
    *   This function formats the context using `formatContext`.
    *   It constructs the full prompt using the template.
    *   It calls `ragAgent.generate(fullPrompt)`.
    *   It returns the `text` from the agent's response.

**Testing Strategy:**
*   Provide fixed, known context chunks (simulating Phase 1 output) to `generateAnswer` along with relevant questions.
*   Verify that the generated answer accurately reflects *only* the information present in the provided context.
*   Test with questions whose answers are *not* in the context to ensure the agent follows instructions to state that.
*   Test the end-to-end flow by calling `retrieveContext` (Phase 1) and feeding its output to `generateAnswer`.

---

## Phase 3: Timestamp Identification and Citation

**Goal:** Enhance the RAG response to include relevant timestamps derived from the source fine-level chunks. This happens *after* the answer is generated.

**Input:**
*   The LLM-generated answer string (from Phase 2).
*   The array of *fine-level* chunks initially retrieved alongside medium chunks in Phase 1 (or retrieved via a dedicated fine-chunk query if Phase 1 was modified).

**Output:**
*   The generated answer string.
*   An array of relevant citation objects, each containing `startOffset` and `endOffset`.

**Steps:**
1.  **Refine Retrieval (Phase 1):** Ensure that Phase 1 retrieval (`searchChunks` or `retrieveContext`) explicitly fetches and returns *fine-level* chunks relevant to the query, even if medium chunks are primarily used for answer generation context. Store these retrieved fine chunks separately.
2.  **Answer Segmentation:** Break the generated answer into smaller, meaningful units (e.g., sentences or key phrases).
3.  **Similarity Search:** Implement a function `findRelevantFineChunks(answerSegment: string, retrievedFineChunks: RetrievedFineChunk[])`.
    *   This function compares the `answerSegment` against the `text` of each `retrievedFineChunk`.
    *   Use a suitable similarity metric (e.g., simple string inclusion, basic cosine similarity on embeddings if performance allows, or a library like Fuse.js).
    *   Return the top matching fine chunk(s) for that segment.
4.  **Timestamp Aggregation:** Iterate through the answer segments. For each segment, call `findRelevantFineChunks`. Collect the `startOffset` and `endOffset` from the identified source fine chunks. De-duplicate and potentially merge overlapping/adjacent timestamps for a cleaner citation list.
5.  **Combine Results:** Create a final response object containing the answer string and the aggregated list of citation timestamps.

**Testing Strategy:**
*   Provide a known generated answer and a corresponding set of retrieved fine chunks.
*   Manually verify that the `findRelevantFineChunks` function correctly identifies source chunks for different parts of the answer.
*   Check the format and relevance of the final aggregated timestamps. Ensure duplicates are handled.
*   Test the end-to-end flow: Query -> Retrieve Chunks (Fine + Medium) -> Generate Answer -> Identify Timestamps from Fine Chunks.

---

## Phase 4: Query Pre-processing & Filtering

**Goal:** Improve the relevance of retrieved chunks by implementing basic query pre-processing and metadata filtering during retrieval.

**Input:**
*   User query string.
*   Optional filter parameters (e.g., `videoId`, specific `tags`).

**Output:**
*   More relevant retrieved chunk objects (passed to Phase 2/3).

**Steps:**
1.  **Filtering Logic:** Modify the `searchChunks` function (from Phase 1) to accept an optional `filter` object argument.
2.  **Map Filters to PgVector:** Translate the filter object into the format expected by the `pgVector.query` method's `filter` parameter (e.g., `{ videoId: 'someId', level: 'fine' }`, or potentially using operators if supported for fields like `tags`).
3.  **Update Retrieval Wrapper:** Modify `retrieveContext` to accept optional filter criteria and pass them down to `searchChunks`.
4.  **(Optional) Basic Query Analysis:** Implement simple keyword extraction from the query. If keywords match known metadata fields (like tags generated in the ingestion workflow), automatically add them to the filter (e.g., if query is "Lucia authentication", add a filter for `tags: ['Lucia', 'authentication']` if the vector store supports array containment checks).

**Testing Strategy:**
*   Test `searchChunks` directly with various filter combinations (`videoId`, `level`, `tags`) and verify the results only contain chunks matching the filters.
*   Test the optional query analysis by providing queries containing known tags and checking if the retrieval function applies the correct filters automatically.
*   Test the end-to-end flow with filtered queries and ensure the final answer reflects the filtered context.

---

## Phase 5: Simple CLI Testing Interface

**Goal:** Create a basic command-line interface to easily test the complete RAG pipeline.

**Input:**
*   Command-line arguments: Video ID (optional) and User Query.

**Output:**
*   Console output showing the generated answer and associated timestamps.

**Steps:**
1.  **Create Script:** Develop a new script file (e.g., `src/scripts/runRAGQuery.ts`).
2.  **Argument Parsing:** Use a library (like `yargs`) or basic `process.argv` parsing to get the video ID and query from the command line.
3.  **Core RAG Function:** Create a main function `performRAG(query: string, videoId?: string)` that orchestrates the calls to the functions developed in Phases 1-4:
    *   Determine filters based on `videoId`.
    *   Call `retrieveContext` (with filters) to get fine and medium chunks.
    *   Call `generateAnswer` using the retrieved context.
    *   Call the timestamp identification logic (Phase 3) using the answer and retrieved fine chunks.
    *   Return the answer and citations.
4.  **Output Formatting:** In the main script execution block, call `performRAG` and print the results clearly to the console (e.g., "Answer:", "Relevant Timestamps: [start-end, start-end]").
5.  **Add `package.json` script:** Add a script entry (e.g., `"rag:query": "tsx src/scripts/runRAGQuery.ts"`) for easy execution.

**Testing Strategy:**
*   Run the script with various video IDs and queries using `pnpm rag:query --videoId <id> --query "..."`.
*   Verify the output format is correct.
*   Assess the quality and relevance of the answers and timestamps for different queries.
*   Test edge cases like missing video ID or queries with no relevant context. 