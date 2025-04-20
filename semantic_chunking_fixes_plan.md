# Semantic Chunking Workflow Fixes Plan

## Phase 1: Fix Mastra Instance Integration
- Issue: "Mastra instance not found in context" error in indexingStep
- Goal: Properly integrate Mastra instance into workflow context
- Focus: Ensure vector store (pgVector) is accessible for indexing

## Phase 2: Improve Tagging Agent Response Format
- Issue: Multiple "Tagging agent response did not contain JSON code fences" warnings
- Goal: Standardize tagging agent output format
- Focus: Ensure consistent JSON code fence responses from tagging agent

## Phase 3: Optimize Chunk Size Distribution
- Issue: Potential imbalance in chunk sizes (9 fine, 8 medium, 1 large)
- Goal: Review and optimize chunk size distribution
- Focus: Ensure chunks follow recommended sizes from plan (100-200 words fine, ~500 words medium, ~1000 words large)

## Phase 4: Timestamp Mapping Enhancement
- Issue: Some chunks have very close timestamps (e.g., 0.002 to 0.007)
- Goal: Improve timestamp mapping accuracy
- Focus: Review and enhance mapFineChunksToTimestampsWink function

## Phase 5: Testing and Validation
- Goal: Comprehensive testing of fixed workflow
- Focus:
  - Test Mastra integration
  - Verify chunk size distributions
  - Validate timestamp mapping
  - Confirm proper indexing
  - Check embedding generation
  - Verify tagging functionality 