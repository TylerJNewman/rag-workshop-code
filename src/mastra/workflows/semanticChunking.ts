// src/mastra/workflows/semanticChunkingWorkflow.ts
import { Workflow, Step } from '@mastra/core';
import { z } from 'zod';
import {
  fetchVideoDetails,
  formatTranscript,
  VideoDetails,
} from './utils/fetchTranscript';
import {
  getSemanticChunksFromLLM,
  mapTimestampsToSemanticChunks,
  writeChunksToFile,
  SemanticChunk,
} from './utils/semanticChunking';

// Define Zod schemas for step outputs
const videoDetailsSchema = z.custom<VideoDetails>();
const formattedTranscriptSchema = z.string();
const semanticTextChunksSchema = z.array(z.string());
const mappedChunksSchema = z.array(z.custom<SemanticChunk>());

// Step 1: Fetch video details and raw transcript
const fetchTranscriptStep = new Step({
  id: 'fetchTranscript',
  outputSchema: videoDetailsSchema,
  execute: async ({ context }) => {
    const videoId: string = context.triggerData.videoId;
    return fetchVideoDetails(videoId);
  },
});

// Step 2: Format the raw transcript into clean text
const formatTranscriptStep = new Step({
  id: 'formatTranscript',
  outputSchema: formattedTranscriptSchema,
  execute: async ({ context }) => {
    const videoDetails = context.getStepResult<VideoDetails>('fetchTranscript');
    return formatTranscript(videoDetails.transcript);
  },
});

// Step 3: Call LLM to get semantic chunks
const callGeminiStep = new Step({
  id: 'callGemini',
  outputSchema: semanticTextChunksSchema,
  execute: async ({ context }) => {
    const formattedTranscript = context.getStepResult<string>('formatTranscript');
    return getSemanticChunksFromLLM(formattedTranscript);
  },
});

// Step 4: Map LLM chunks back to original timestamps
const mapTimestampsStep = new Step({
  id: 'mapTimestamps',
  outputSchema: mappedChunksSchema,
  execute: async ({ context }) => {
    const videoDetails = context.getStepResult<VideoDetails>('fetchTranscript');
    const semanticTextChunks = context.getStepResult<string[]>('callGemini');
    const videoId = context.triggerData.videoId;
    return mapTimestampsToSemanticChunks(
      videoId,
      videoDetails.transcript,
      semanticTextChunks
    );
  },
});

// Step 5: Save the final chunks to a file
const saveChunksStep = new Step({
  id: 'saveChunks',
  execute: async ({ context }) => {
    const mappedChunks = context.getStepResult<SemanticChunk[]>('mapTimestamps');
    const videoId = context.triggerData.videoId;
    await writeChunksToFile(videoId, mappedChunks);
    return { status: 'success', count: mappedChunks.length };
  },
});

// Create and configure the workflow
export const semanticChunkingWorkflow = new Workflow({
  name: 'semanticChunking',
  triggerSchema: z.object({
    videoId: z.string().min(1, "Video ID cannot be empty"),
  }),
});

// Link the steps sequentially
semanticChunkingWorkflow
  .step(fetchTranscriptStep)
  .then(formatTranscriptStep)
  .then(callGeminiStep)
  .then(mapTimestampsStep)
  .then(saveChunksStep)
  .commit();