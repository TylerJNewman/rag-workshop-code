# Semantic Chunking Project Roadmap

This document outlines the planned future enhancements and directions for the semantic chunking system after the initial 6-phase implementation is complete.

## Post-MVP Enhancements (Near-term)

1.  **Retrieval Strategy Implementation:**
    *   Develop and integrate the RAG (Retrieval-Augmented Generation) component based on the plan:
        *   Implement query pre-processing.
        *   Implement vector search logic to retrieve relevant fine and medium chunks.
        *   Develop prompt templates for answer generation using retrieved context.
        *   Integrate with a generation model (e.g., Gemini Pro, GPT-4 Turbo) via Mastra Agent.
        *   Implement timestamp identification from fine-level chunks for citation.
    *   Build a simple interface (CLI or basic UI) for testing retrieval.

2.  **Advanced Metadata Tagging (Phase 6 Enhancement):**
    *   Implement the optional Gemini-based semantic tag extraction.
    *   Create a new agent/tool (`TaggingAgent`) to analyze chunk text and extract keywords, topics, entities, or sentiment.
    *   Integrate this into the indexing phase (Phase 6) to enrich metadata.
    *   Update the vector index schema to include these tags.
    *   Explore using tags for filtered retrieval.

3.  **Workflow Monitoring & Observability:**
    *   Integrate Mastra observability tools.
    *   Log key metrics for each workflow step (execution time, success/failure, token usage, chunk counts).
    *   Set up dashboards or alerts for monitoring workflow health and performance.

4.  **Error Handling & Resilience:**
    *   Improve error handling within each workflow step (API errors, data validation, mapping failures).
    *   Implement retry logic for transient API failures (e.g., in LLM calls, embedding calls, DB writes).
    *   Define strategies for handling irrecoverable errors (e.g., logging, moving to dead-letter queue).

5.  **Configuration Management:**
    *   Move hardcoded values (like agent models, chunk size targets, prompts) to a configuration file or environment variables for easier management.

## Mid-term Enhancements

1.  **Alternative Chunking Models/Strategies:**
    *   Experiment with different LLMs (Anthropic Claude, other open models via providers like Fireworks) for chunking/summarization steps to compare quality and cost.
    *   Investigate alternative chunking algorithms (e.g., sentence splitting + similarity thresholding, specialized libraries) as potential complements or replacements for LLM-based chunking in certain phases.

2.  **Alternative Embedding Models:**
    *   Evaluate other embedding models (e.g., Cohere, Voyage AI, open models like BGE) for potential improvements in retrieval performance or cost-efficiency.
    *   Requires updating Phase 5 and potentially re-indexing.

3.  **Hybrid Retrieval:**
    *   Implement hybrid search combining vector similarity with traditional keyword search (e.g., using BM25) for potentially improved relevance on specific query types.
    *   Requires vector database support or separate index.

4.  **Cost Optimization:**
    *   Analyze token usage and API costs across the workflow.
    *   Investigate cheaper models for specific tasks (e.g., fine-level chunking if quality permits).
    *   Explore batching strategies for API calls (embedding, indexing).

## Long-term Vision

1.  **Multi-Modal Support:**
    *   Extend the system to handle video directly (if feasible) or incorporate visual information (key frames, OCR from frames) alongside the transcript for richer context and retrieval.

2.  **Cross-Video Analysis:**
    *   Develop capabilities to query and synthesize information *across* multiple videos stored in the index.

3.  **User Feedback Loop:**
    *   Incorporate user feedback on retrieval quality or summary usefulness to fine-tune prompts, models, or retrieval strategies.

4.  **Advanced Query Capabilities:**
    *   Support more complex queries (e.g., temporal queries, comparative questions).

--- 