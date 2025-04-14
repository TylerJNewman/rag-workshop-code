// src/mastra/workflows/semanticChunkingWorkflow.ts
import { Workflow, Step } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  fetchVideoDetails,
  formatTranscript,
  VideoDetails,
} from './utils/fetchTranscript';
import {
  writeChunksToFile,
  SemanticChunk,
  writeSummaryToFile,
} from './utils/semanticChunking';
import { fineChunkingTool } from '../agents/fine-chunking-agent';
// Import the medium chunking tool and its output type
import { mediumChunkingTool, MediumChunk } from '../agents/med-chunking-agent/tool';
import { mapFineChunksToTimestamps, TimedChunk } from './utils/timestampMapping';
// Import the large chunking tool
import { largeChunkingTool } from '../agents/large-chunking-agent/tool';

// Define Zod schemas for step outputs
const videoDetailsSchema = z.custom<VideoDetails>();
const formattedTranscriptSchema = z.string();

// Schema for the fineChunkingStep output (array of timed fine chunks)
const timedChunkSchema = z.custom<TimedChunk>(); 
const timedChunksArraySchema = z.array(timedChunkSchema); 

// Schema for the mediumChunkingTool/Step output
const mediumChunkSchema = z.custom<MediumChunk>();
const mediumChunksArraySchema = z.array(mediumChunkSchema); 

// Schema for the largeChunkingStep output
const videoSummarySchema = z.string();

// Step 1: Fetch video details and raw transcript (Remains a Step object)
export const fetchTranscriptStep = new Step({
  id: 'fetchTranscript',
  outputSchema: videoDetailsSchema,
  execute: async ({ context }) => {
    const videoId: string = context.triggerData.videoId;
    return fetchVideoDetails(videoId);
  },
});

// Step 2: Format the raw transcript into clean text (Remains a Step object)
export const formatTranscriptStep = new Step({
  id: 'formatTranscript',
  outputSchema: formattedTranscriptSchema,
  execute: async ({ context }) => {
    const videoDetails = context.getStepResult<VideoDetails>('fetchTranscript');
    if (!videoDetails?.transcript) {
        throw new Error('Transcript data is missing from fetchTranscriptStep result.');
    }
    return formatTranscript(videoDetails.transcript);
  },
});

// Step 3: Perform Fine Chunking 
export const fineChunkingStep = new Step({
  id: 'fineChunking',
  outputSchema: z.array(z.string()),
  execute: async ({ context }) => {
    const formattedTranscript = context.getStepResult<string>('formatTranscript');
    if (!formattedTranscript) {
      throw new Error('Formatted transcript is missing from formatTranscriptStep result.');
    }

    const toolInput = { transcript: formattedTranscript };
    if (!fineChunkingTool.execute) {
        throw new Error('Fine chunking tool execute method is undefined');
    }
    const fineTextChunks = await fineChunkingTool.execute({ context: toolInput });

    if (!Array.isArray(fineTextChunks) || fineTextChunks.some(c => typeof c !== 'string')) {
        console.error('Invalid output format received from fineChunkingTool:', fineTextChunks);
        throw new Error('Invalid output format received from fineChunkingTool. Expected string[].');
    }

    return fineTextChunks;
  },
});

// Step 4: Map Chunks to Timestamps
export const timestampMappingStep = new Step({
  id: 'timestampMapping',
  outputSchema: timedChunksArraySchema,
  execute: async ({ context }) => {
    const fineTextChunks = context.getStepResult<string[]>('fineChunking');
    if (!fineTextChunks) {
      throw new Error('Fine text chunks are missing from fineChunkingStep result.');
    }

    const formattedTranscript = context.getStepResult<string>('formatTranscript');
    if (!formattedTranscript) {
      throw new Error('Formatted transcript is missing from formatTranscriptStep result.');
    }

    const videoDetails = context.getStepResult<VideoDetails>('fetchTranscript');
    if (!videoDetails?.transcript) {
      throw new Error('Original transcript segments are missing from fetchTranscriptStep result.');
    }
    const originalSegments = videoDetails.transcript;

    const timedChunks = mapFineChunksToTimestamps(
        originalSegments, 
        fineTextChunks, 
        formattedTranscript
    );

    // Strategic Log 1: Log the output before returning
    console.log(`[timestampMappingStep] Returning ${timedChunks.length} timed chunks:`, JSON.stringify(timedChunks.slice(0, 2), null, 2)); // Log first few for brevity

    return timedChunks;
  },
});

// Step 5: Perform Medium Chunking (Re-introducing Step wrapper)
export const mediumChunkingStep = new Step({
    id: 'mediumChunking', // Use a Step ID again
    outputSchema: mediumChunksArraySchema, // Tool's output schema is the Step's output schema
    execute: async ({ context }) => {
        console.log('--- Executing mediumChunkingStep ---'); 
        // Corrected: Get result from 'timestampMapping' step
        const timedFineChunks = context.getStepResult<TimedChunk[]>('timestampMapping'); 
        
        // Strategic Log 2: Log the received data structure and content
        console.log(`[mediumChunkingStep] Received data from getStepResult('timestampMapping'):`, JSON.stringify(timedFineChunks?.slice(0, 2), null, 2)); // Log first few
        console.log(`Received ${timedFineChunks?.length ?? 0} timed fine chunks for processing.`);

        if (!timedFineChunks || timedFineChunks.length === 0) {
            console.warn('No timed fine chunks received from timestampMappingStep. Skipping medium chunking.');
            return [];
        }

        // Prepare input for the tool, matching the tool's inputSchema
        const toolInput = { fineChunks: timedFineChunks }; 

        if (!mediumChunkingTool.execute) {
            throw new Error('Medium chunking tool execute method is undefined');
        }
        
        // Call the tool's execute method, passing the context object expected by the tool
        console.log("Calling mediumChunkingTool.execute with context:", { context: toolInput });
        const mediumChunks = await mediumChunkingTool.execute({ context: toolInput });

        // Return the result from the tool, which matches the Step's outputSchema
        console.log(`mediumChunkingStep returning ${mediumChunks?.length ?? 0} medium chunks.`); // Log return
        console.log("mediumChunkingStep object defined:", !!mediumChunkingStep); // <-- Log medium step object creation
        return mediumChunks;
    },
});

// Step 6: Perform Large Chunking (Video Summary)
export const largeChunkingStep = new Step({
    id: 'largeChunking',
    outputSchema: videoSummarySchema,
    execute: async ({ context }) => {
        console.log('--- Executing largeChunkingStep ---');
        // Get the medium chunks from the previous step
        const mediumChunks = context.getStepResult<MediumChunk[]>('mediumChunking');

        if (!mediumChunks || mediumChunks.length === 0) {
            console.warn('No medium chunks received from mediumChunkingStep. Skipping large chunking.');
            return "Summary skipped: No medium chunks provided.";
        }

        // Prepare the input for the largeChunkingTool
        const toolInput = { mediumChunks: mediumChunks };

        if (!largeChunkingTool.execute) {
            throw new Error('Large chunking tool execute method is undefined');
        }

        // Call the tool's execute method
        console.log("Calling largeChunkingTool.execute...");
        const videoSummary = await largeChunkingTool.execute({ context: toolInput });

        console.log(`largeChunkingStep returning summary of length ${videoSummary.length}.`);
        return videoSummary;
    },
});

// Step 7: Save the medium chunks and summary (Adjusted Step 6)
// TODO: Rename this step later (e.g., saveResultsStep)
export const saveResultsStep = new Step({
  id: 'saveResults', // Renamed ID
  outputSchema: z.object({
    status: z.string(),
    chunksCount: z.number(),
    summarySaved: z.boolean(),
  }),
  execute: async ({ context }) => {
    const videoId = context.triggerData.videoId;
    // Get results from previous steps
    const mediumChunks = context.getStepResult<MediumChunk[]>('mediumChunking');
    const videoSummary = context.getStepResult<string>('largeChunking');

    let chunksCount = 0;
    let chunksStatus = 'skipped';
    let summarySaved = false;

    // Save Medium Chunks (if they exist)
    if (mediumChunks && mediumChunks.length > 0) {
        // Adapt the MediumChunk[] output to the SemanticChunk[] format
        const semanticChunks: SemanticChunk[] = mediumChunks.map((chunk, index) => {
           const startOffset = !Number.isNaN(chunk.startOffset) ? chunk.startOffset : 0;
           const endOffset = !Number.isNaN(chunk.endOffset) ? chunk.endOffset : startOffset + 30; 
           return {
                chunkId: `${videoId}-medium-${index}`,
                videoId: videoId,
                text: chunk.text,
                startOffset: parseFloat(startOffset.toFixed(3)), 
                endOffset: parseFloat(endOffset.toFixed(3)),
                summary: chunk.summary, // Include summary in saved chunk data
            };
        });
        const chunkFilenameSuffix = '_medium_chunks.json'; 
        await writeChunksToFile(videoId, semanticChunks, chunkFilenameSuffix); 
        chunksCount = semanticChunks.length;
        chunksStatus = 'success';
        console.log(`Successfully saved ${chunksCount} medium chunks for video ${videoId} to ./output/${videoId}${chunkFilenameSuffix}`);
    } else {
        console.warn('No medium chunks received from mediumChunking step. Nothing to save.');
        chunksStatus = 'no_chunks';
    }

    // Save Summary (if it exists)
    if (videoSummary && videoSummary.trim().length > 0 && videoSummary !== "Summary skipped: No medium chunks provided.") {
        const summaryFilenameSuffix = '_summary.txt';
        await writeSummaryToFile(videoId, videoSummary, summaryFilenameSuffix);
        summarySaved = true;
        console.log(`Successfully saved video summary for video ${videoId} to ./output/${videoId}${summaryFilenameSuffix}`);
    } else {
        console.warn('No valid summary received from largeChunking step. Summary not saved.');
    }
    
    console.log("saveResultsStep object defined:", !!saveResultsStep); // Use new step name
    return { status: chunksStatus, chunksCount: chunksCount, summarySaved: summarySaved };
  },
});

// Create and configure the workflow
export const semanticChunkingWorkflow = new Workflow({
  name: 'semanticChunking',
  triggerSchema: z.object({
    videoId: z.string().min(1, "Video ID cannot be empty"),
  }),
});

// Link the steps sequentially, adding the new largeChunkingStep
semanticChunkingWorkflow
  .step(fetchTranscriptStep)
  .then(formatTranscriptStep)
  .then(fineChunkingStep)
  .then(timestampMappingStep)
  .then(mediumChunkingStep)
  .then(largeChunkingStep) // Add the large chunking step here
  .then(saveResultsStep)   // Use renamed save step
  .commit();