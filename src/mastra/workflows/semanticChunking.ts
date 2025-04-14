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
// Import embedding utility and types
import { generateEmbeddings, InputChunk, OutputChunk } from './utils/embeddingUtils';
// Import indexing utility
import { upsertEmbeddingsToPgVector } from './utils/indexingUtils';
import { mastra } from '../index';

// Define a more specific type for the metadata used in this workflow
type ChunkMetadata = {
    videoId: string;
    title?: string;
    channelTitle?: string;
    description?: string;
    thumbnailUrl?: string;
    publishedAt?: string | Date;
    keywords?: string[];
    lengthSeconds?: number;
    viewCount?: number | string;
    level: 'fine' | 'medium' | 'large';
    startOffset?: number;
    endOffset?: number;
    summary?: string; // Added for medium chunks
};

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

// Schema for embedding output chunk
const outputChunkSchema = z.custom<OutputChunk>(); // Assuming OutputChunk is { text, metadata, embedding }

// Schema for the embeddingStep output
const embeddingStepOutputSchema = z.object({
    fineChunks: z.array(outputChunkSchema),
    mediumChunks: z.array(outputChunkSchema),
    largeChunk: outputChunkSchema.optional(), // Summary might be skipped
});

// Schema for the final indexing step output
const indexingStepOutputSchema = z.object({
    status: z.string(),
    indexedCount: z.number(),
});

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

// Step 7: Generate Embeddings
export const embeddingStep = new Step({
    id: 'generateEmbeddings',
    outputSchema: embeddingStepOutputSchema,
    execute: async ({ context }) => {
        console.log('--- Executing embeddingStep ---');
        const videoId = context.triggerData.videoId;

        // Get results from previous chunking steps
        const timedFineChunks = context.getStepResult<TimedChunk[]>('timestampMapping') || [];
        const mediumChunks = context.getStepResult<MediumChunk[]>('mediumChunking') || [];
        const videoSummary = context.getStepResult<string>('largeChunking');
        // Get video details from the first step
        const videoDetails = context.getStepResult<VideoDetails>('fetchTranscript');

        if (!videoDetails) {
            console.warn('Video details are missing from fetchTranscriptStep result. Some metadata will be omitted.');
            // Decide if this is a fatal error or if we proceed with partial metadata
            // For now, we proceed, but you might want to throw an error depending on requirements.
        }

        // Extract common metadata - handle potential missing videoDetails
        const commonMetadata = {
            videoId: videoId,
            title: videoDetails?.title,
            channelTitle: videoDetails?.channelTitle, // Corrected from author
            description: videoDetails?.description, // Corrected from shortDescription
            thumbnailUrl: videoDetails?.thumbnailUrl, // Corrected from thumbnail.url
            publishedAt: videoDetails?.publishedAt, // Corrected from publishDate
            keywords: videoDetails?.keywords,
            lengthSeconds: videoDetails?.lengthSeconds,
            viewCount: videoDetails?.viewCount,
        };

        const chunksToEmbed: InputChunk[] = [];

        // Prepare fine chunks for embedding
        for (const chunk of timedFineChunks) {
            chunksToEmbed.push({
                text: chunk.text,
                metadata: {
                    ...commonMetadata, // Spread common video metadata
                    level: 'fine',
                    // videoId already in commonMetadata
                    startOffset: chunk.startOffset,
                    endOffset: chunk.endOffset,
                },
            });
        }

        // Prepare medium chunks for embedding
        for (const chunk of mediumChunks) {
            // Ensure timestamps are numbers, default if necessary (though should be handled earlier ideally)
            const startOffset = !Number.isNaN(chunk.startOffset) ? chunk.startOffset : 0;
            const endOffset = !Number.isNaN(chunk.endOffset) ? chunk.endOffset : startOffset + 30; // Default duration if end is NaN
            chunksToEmbed.push({
                text: chunk.text, // Embed the main text of the medium chunk
                metadata: {
                    ...commonMetadata, // Spread common video metadata
                    level: 'medium',
                    // videoId already in commonMetadata
                    startOffset: parseFloat(startOffset.toFixed(3)),
                    endOffset: parseFloat(endOffset.toFixed(3)),
                    summary: chunk.summary, // Keep summary in metadata
                },
            });
        }

        // Prepare video summary for embedding (if it exists and is valid)
        let summaryChunk: InputChunk | null = null;
        if (videoSummary && videoSummary.trim().length > 0 && videoSummary !== "Summary skipped: No medium chunks provided.") {
            summaryChunk = {
                text: videoSummary,
                metadata: {
                    ...commonMetadata, // Spread common video metadata
                    level: 'large',
                    // videoId already in commonMetadata
                },
            };
            chunksToEmbed.push(summaryChunk);
        }

        if (chunksToEmbed.length === 0) {
            console.warn('No text chunks found to generate embeddings for. Skipping embedding step.');
            return { fineChunks: [], mediumChunks: [], largeChunk: undefined };
        }

        // Call the utility function
        console.log(`Attempting to generate embeddings for ${chunksToEmbed.length} text chunks...`);
        const outputChunks = await generateEmbeddings(chunksToEmbed);
        console.log(`Embeddings generation finished. Received ${outputChunks.length} output chunks.`);

        // Separate the results
        const fineOutputChunks = outputChunks.filter(c => c.metadata.level === 'fine');
        const mediumOutputChunks = outputChunks.filter(c => c.metadata.level === 'medium');
        let largeOutputChunk: OutputChunk | undefined = undefined;

        for (const chunk of outputChunks) {
            if (chunk.metadata.level === 'large') {
                largeOutputChunk = chunk;
            }
        }

        console.log(`embeddingStep returning ${fineOutputChunks.length} fine, ${mediumOutputChunks.length} medium chunks with embeddings, and ${largeOutputChunk ? '1 large chunk' : 'no large chunk'} with embedding.`);
        return {
            fineChunks: fineOutputChunks,
            mediumChunks: mediumOutputChunks,
            largeChunk: largeOutputChunk,
        };
    },
});

// Step 8: Index Embeddings
export const indexingStep = new Step({
    id: 'indexEmbeddings',
    outputSchema: indexingStepOutputSchema,
    execute: async ({ context }) => {
        console.log('--- Executing indexingStep ---');

        const pgVector = mastra.getVector("pg");
        if (!pgVector) {
            console.error('pgVector instance not found in Mastra configuration.');
            return { status: 'failed', indexedCount: 0 };
        }

        const embeddingsData = context.getStepResult<z.infer<typeof embeddingStepOutputSchema>>('generateEmbeddings');

        if (!embeddingsData) {
            console.warn('No embedding data received from embeddingStep. Skipping indexing.');
            return { status: 'skipped', indexedCount: 0 };
        }

        const { fineChunks, mediumChunks, largeChunk } = embeddingsData;
        const allChunksToIndex: OutputChunk[] = [...fineChunks, ...mediumChunks];
        if (largeChunk) {
            allChunksToIndex.push(largeChunk);
        }

        if (allChunksToIndex.length === 0) {
            console.log('No chunks with embeddings found to index.');
            return { status: 'success', indexedCount: 0 };
        }

        const ids: string[] = [];
        const vectors: number[][] = [];
        // Use the specific ChunkMetadata type
        const metadataArray: ChunkMetadata[] = [];

        // Use for...of loop
        for (const chunk of allChunksToIndex) {
            const id = `${chunk.metadata.videoId}_${chunk.metadata.level}_${chunk.metadata.startOffset ?? 'summary'}`;
            ids.push(id);
            vectors.push(chunk.embedding);
            // Cast metadata to the specific type (assuming it conforms)
            metadataArray.push(chunk.metadata as ChunkMetadata);
        }

        try {
            const indexName = 'semantic_chunks';
            // const dimension = 1536;

            // console.log(`Deleting existing index '${indexName}' (if it exists)...`);
            // await pgVector.deleteIndex(indexName);

            // console.log(`Creating new index '${indexName}' with dimension ${dimension}...`);
            // await pgVector.createIndex({
            //     indexName: indexName,
            //     dimension: dimension,
            // });

            console.log(`Attempting to upsert ${vectors.length} vectors to index '${indexName}'...`);
            await pgVector.upsert({
                indexName: indexName,
                vectors: vectors,
                metadata: metadataArray,
                ids: ids,
            });
            console.log(`Successfully upserted ${vectors.length} vectors to index ${indexName}`);
            return {
                status: 'success',
                indexedCount: vectors.length,
            };
        } catch (error) {
            console.error('Error during indexing:', error);
            return {
                status: 'failed',
                indexedCount: 0,
            };
        }
    },
});

// Create and configure the workflow
export const semanticChunkingWorkflow = new Workflow({
  name: 'semanticChunking',
  triggerSchema: z.object({
    videoId: z.string().min(1, "Video ID cannot be empty"),
  }),
});

semanticChunkingWorkflow
  .step(fetchTranscriptStep)
  .then(formatTranscriptStep)
  .then(fineChunkingStep)
  .then(timestampMappingStep)
  .then(mediumChunkingStep)
  .then(largeChunkingStep)
  .then(embeddingStep)
  .then(indexingStep)
  .commit();