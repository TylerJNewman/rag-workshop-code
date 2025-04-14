# RAG System Roadmap

This document outlines potential future enhancements and directions for the RAG system after the initial 5-phase implementation (detailed in `RAG_IMPLEMENTATION_PLAN.md`) is complete.

## Post-MVP Enhancements (Near-term)

1.  **Improved Citation Accuracy:**
    *   Explore more sophisticated methods for mapping generated answer segments back to source fine chunks (e.g., using cross-encoders for better semantic relevance scoring instead of simple similarity).
    *   Experiment with asking the generation LLM itself to include citation markers (e.g., `[source:1]`, `[source:2]`) in its answer, linked back to the retrieved context chunks, although this can be unreliable.

2.  **Advanced Filtering/Retrieval Strategies:**
    *   **Hybrid Search:** Combine vector similarity search with keyword-based search (e.g., using PgVector's full-text search capabilities alongside vector search) for potentially better retrieval on queries containing specific terms or codes.
    *   **Metadata Filtering UI:** If building a UI, allow users to explicitly filter by video, tags, or other metadata fields.
    *   **Time-based Filtering:** Allow queries like "What was said about X in the first 5 minutes?" by translating time constraints into `startOffset`/`endOffset` filters.
    *   **Chunk Re-ranking:** Implement a re-ranking step after initial retrieval (e.g., using a cross-encoder model) to further improve the relevance of chunks fed to the generator LLM.

3.  **Context Window Management:**
    *   Implement strategies for handling cases where the number of relevant retrieved chunks exceeds the generator LLM's context window limit (e.g., summarization of less relevant chunks, sliding window approach).

4.  **Query Transformation/Expansion:**
    *   Use an LLM to rephrase or expand the user's query before embedding and retrieval to capture different phrasings of the same intent (e.g., "Lucia auth deprecation" -> "Why is Lucia being deprecated?", "How to migrate from Lucia?").
    *   Implement HYDE (Hypothetical Document Embeddings): Generate a hypothetical answer to the query first, embed *that*, and use the hypothetical answer embedding for retrieval.

5.  **User Interface:**
    *   Develop a simple web UI (e.g., using Next.js or React) instead of just a CLI.
    *   Display the answer.
    *   Display clickable timestamps linked to the corresponding video segment (requires a video player integration).
    *   Potentially display the source text snippets used for generation.

## Long-term / Advanced Features

1.  **Multi-Query RAG:** For complex questions, break the user query into multiple sub-queries, perform RAG for each, and synthesize the results.
2.  **Conversational Memory:** Allow follow-up questions where the context from previous turns is maintained.
3.  **Personalization:** If user profiles exist, tailor retrieval or generation based on user preferences or history.
4.  **Feedback Loop:** Implement mechanisms for users to provide feedback on answer quality or citation relevance, potentially fine-tuning retrieval or generation models.
5.  **Agentic RAG:** Instead of a fixed pipeline, use an LLM agent to dynamically decide retrieval strategies, filtering, and generation prompts based on the query.
6.  **Multi-Modal Integration:** If video frames or other modalities are available and indexed, integrate them into the retrieval process. 