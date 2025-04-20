// src/mastra/workflows/semanticChunkingWorkflow.ts
import { Workflow, Step } from '@mastra/core/workflows';
import { z } from 'zod'; 
import winkNLP from 'wink-nlp'; // Import main library
import model from 'wink-eng-lite-web-model'; // 
import {
  fetchVideoDetails,
  formatTranscript,
  VideoDetails,
} from './utils/fetchTranscript';
import { fineChunkingTool } from '../agents/fine-chunking-agent';
// Import the medium chunking tool and its output type
import { mediumChunkingTool, MediumChunk } from '../agents/med-chunking-agent/tool';
import { mapFineChunksToTimestampsWink, TimedChunk } from './utils/timestampMappingWink';
// Import the large chunking tool
import { largeChunkingTool } from '../agents/large-chunking-agent/tool';
// Import embedding utility and types
import { generateEmbeddings, InputChunk, OutputChunk } from './utils/embeddingUtils';

// Import the new tagging tool
import { taggingTool } from '../agents/tagging-agent/tool';
import { mastra } from '..';
import { withFileCache, withFileSyncCache } from './utils/fileCache';

const nlp = winkNLP(model);

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

// --- Schemas ---
// Schema for TimedChunk (can also be imported if defined centrally)
const timedChunkSchema = z.custom<TimedChunk>((val) => {
    return typeof val === 'object' && val !== null &&
        typeof (val as TimedChunk).text === 'string' &&
        typeof (val as TimedChunk).startOffset === 'number' &&
        typeof (val as TimedChunk).endOffset === 'number';
}, { message: "Invalid TimedChunk structure" });
const timedChunksArraySchema = z.array(timedChunkSchema);

// Define Zod schemas for step outputs
const videoDetailsSchema = z.custom<VideoDetails>();
const formattedTranscriptSchema = z.string();

// // Schema for the fineChunkingStep output (array of timed fine chunks)
// const timedChunkSchema = z.custom<TimedChunk>(); 
// const timedChunksArraySchema = z.array(timedChunkSchema); 

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
    return withFileCache(
        `video-details-${videoId}`,          // Cache key derived from videoId
        () => fetchVideoDetails(videoId),   // Function to fetch data if cache misses
        { subDir: 'video-details' }          // Cache subdirectory option
    );
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
    // return formatTranscript(videoDetails.transcript);
    return withFileSyncCache(
        `transcript-${videoDetails.videoId}`,          // Cache key derived from videoId
        () => formatTranscript(videoDetails.transcript),   // Function to fetch data if cache misses
        { subDir: 'transcripts' }          // Cache subdirectory option
    );
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
    return withFileCache(
        `fine-chunks-${formattedTranscript}`,          // Cache key derived from formatted transcript
        // biome-ignore lint/style/noNonNullAssertion: <explanation>
        () => fineChunkingTool.execute!({ context: toolInput }),   // Function to fetch data if cache misses (using non-null assertion as it's checked above)
        { subDir: 'fine-chunks' }          // Cache subdirectory option
    );

  },
});

// Step 4: Map Chunks to Timestamps
export const timestampMappingStep = new Step({
    id: 'timestampMapping',
    outputSchema: timedChunksArraySchema, // Output schema remains the same
    execute: async ({ context }) => {
        // 1. Get Inputs from Context
        const fineTextChunks = context.getStepResult<string[]>('fineChunking');
        const videoDetails = context.getStepResult<VideoDetails>('fetchTranscript');

        // 2. Call the Mapping Function
        // Pass the globally initialized nlp instance
        // const timedChunks = mapFineChunksToTimestampsWink(
        //     videoDetails.transcript,
        //     fineTextChunks,
        //     nlp, // Pass the initialized instance
        //     {
        //         // Optional: Override defaults here if needed
        //         // wordsToMatch: 60,
        //         // similarityThreshold: 0.005
        //     }
        // );

        // // 3. Return the result
        // return timedChunks;
        return withFileSyncCache(
            `timed-chunks-${videoDetails.videoId}`,          // Cache key derived from videoId
            // Use withFileSyncCache because mapFineChunksToTimestampsWink is synchronous
            () => mapFineChunksToTimestampsWink(videoDetails.transcript, fineTextChunks, nlp),   // Synchronous function to fetch data if cache misses
            { subDir: 'timed-chunks' }          // Cache subdirectory option
        );
    },
});

// Step 5: Perform Medium Chunking (Re-introducing Step wrapper)
export const mediumChunkingStep = new Step({
    id: 'mediumChunking', // Use a Step ID again
    outputSchema: mediumChunksArraySchema, // Tool's output schema is the Step's output schema
    execute: async ({ context }) => {
        const timedFineChunks = context.getStepResult<TimedChunk[]>('timestampMapping'); 

        const toolInput = { fineChunks: timedFineChunks }; 

        if (!mediumChunkingTool.execute) {
            throw new Error('Medium chunking tool execute method is undefined');
        }
        
        // Retrieve video details to get the videoId for the cache key
        const videoDetails = context.getStepResult<VideoDetails>('fetchTranscript');
        if (!videoDetails?.videoId) {
            console.error("Could not retrieve videoId from fetchTranscript step result. Cannot generate cache key.");
            // Decide how to handle: throw error, return empty, or proceed without cache?
            // For now, let's throw an error as the cache key is essential here.
            throw new Error("Missing videoId for medium chunking cache key.");
        }

        // Use withFileCache for caching the async operation
        return withFileCache(
            `medium-chunks-${videoDetails.videoId}`, // Cache key derived from videoId
            // The fetcher function calls the tool's execute method
            // No non-null assertion needed due to the check above
            // biome-ignore lint/style/noNonNullAssertion: <explanation>
            () => mediumChunkingTool.execute!({ context: toolInput }),
            { subDir: 'medium-chunks' } // Cache subdirectory option
        );
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
    id: 'embeddingStep',
    outputSchema: embeddingStepOutputSchema,
    execute: async ({ context }) => {
        console.log('--- Executing embeddingStep ---');

        // Retrieve results from previous steps
        const videoDetails = context.getStepResult<VideoDetails>('fetchTranscript');
        const timedFineChunks = context.getStepResult<TimedChunk[]>('timestampMapping');
        const mediumChunks = context.getStepResult<MediumChunk[]>('mediumChunking');
        const videoSummary = context.getStepResult<string>('largeChunking');

        if (!videoDetails || !timedFineChunks || !mediumChunks) {
            console.error('Missing required chunk data for embedding step.');
            throw new Error('Required chunk data not found in context for embedding.');
        }

        // Attempt to parse lengthSeconds as a number
        let lengthSecondsNum: number | undefined = undefined;
        if (videoDetails.lengthSeconds) {
            const parsed = parseInt(videoDetails.lengthSeconds, 10);
            if (!Number.isNaN(parsed)) {
                lengthSecondsNum = parsed;
            } else {
                 console.warn(`Could not parse lengthSeconds ("${videoDetails.lengthSeconds}") as number.`);
            }
        }
        
        const chunksToEmbed: InputChunk[] = [];

        // Common metadata for all chunks from this video (using correct VideoDetails properties)
        const commonMetadata = {
            videoId: videoDetails.videoId,        
            title: videoDetails.title,
            channelTitle: videoDetails.channelTitle, 
            description: videoDetails.description,    
            thumbnailUrl: videoDetails.thumbnailUrl, 
            publishedAt: videoDetails.publishedAt,    
            keywords: videoDetails.keywords,
            lengthSeconds: lengthSecondsNum, // Assign number | undefined directly
            viewCount: videoDetails.viewCount, 
        };

        // Check if tagging tool execute exists before loops
        if (!taggingTool.execute) {
            throw new Error("Tagging tool execute function is not defined.");
        }

        // Prepare and tag fine chunks for embedding
        console.log(`Preparing ${timedFineChunks.length} fine chunks for tagging and embedding...`);
        for (const chunk of timedFineChunks) {
            let tags: string[] = [];
            try {
                tags = await taggingTool.execute({ context: chunk.text }); 
            } catch (tagError) {
                console.warn(`Failed to generate tags for fine chunk: ${tagError instanceof Error ? tagError.message : String(tagError)}. Proceeding without tags.`);
            }
            chunksToEmbed.push({
                text: chunk.text,
                metadata: {
                    ...commonMetadata, 
                    level: 'fine',
                    startOffset: chunk.startOffset,
                    endOffset: chunk.endOffset,
                    tags: tags, 
                },
            });
        }

        // Prepare and tag medium chunks for embedding
        console.log(`Preparing ${mediumChunks.length} medium chunks for tagging and embedding...`);
        for (const chunk of mediumChunks) {
            let tags: string[] = [];
            const textToTag = chunk.summary || chunk.text; 
            try {
                tags = await taggingTool.execute({ context: textToTag }); 
            } catch (tagError) {
                 console.warn(`Failed to generate tags for medium chunk (summary/text): ${tagError instanceof Error ? tagError.message : String(tagError)}. Proceeding without tags.`);
            }
            const startOffset = !Number.isNaN(chunk.startOffset) ? chunk.startOffset : 0;
            const endOffset = !Number.isNaN(chunk.endOffset) ? chunk.endOffset : startOffset + 30; 
            chunksToEmbed.push({
                text: chunk.text, 
                metadata: {
                    ...commonMetadata, 
                    level: 'medium',
                    startOffset: parseFloat(startOffset.toFixed(3)),
                    endOffset: parseFloat(endOffset.toFixed(3)),
                    summary: chunk.summary, 
                    tags: tags, 
                },
            });
        }

        // Prepare and tag video summary for embedding
        let summaryChunkForEmbedding: InputChunk | null = null;
        if (videoSummary && typeof videoSummary === 'string' && videoSummary.trim().length > 0) {
            console.log("Preparing video summary for tagging and embedding...");
            let tags: string[] = [];
            try {
                 tags = await taggingTool.execute({ context: videoSummary }); 
            } catch (tagError) {
                 console.warn(`Failed to generate tags for video summary: ${tagError instanceof Error ? tagError.message : String(tagError)}. Proceeding without tags.`);
            }
            summaryChunkForEmbedding = {
                text: videoSummary,
                metadata: {
                    ...commonMetadata,
                    level: 'large',
                    tags: tags, 
                    startOffset: 0,
                    endOffset: lengthSecondsNum, // Assign number | undefined directly
                },
            };
            chunksToEmbed.push(summaryChunkForEmbedding);
        } else {
             // Use template literal for interpolation
             console.log('Skipping video summary embedding (no summary found or invalid).'); 
        }

        // Use template literal for interpolation
        console.log(`Attempting to generate embeddings for ${chunksToEmbed.length} text chunks...`); 
        const embeddedChunks: OutputChunk[] = await generateEmbeddings(chunksToEmbed);
        console.log('Embeddings generation finished.');

        // Separate embedded chunks by level
        const embeddedFineChunks = embeddedChunks.filter(c => c.metadata.level === 'fine');
        const embeddedMediumChunks = embeddedChunks.filter(c => c.metadata.level === 'medium');
        const embeddedLargeChunk = embeddedChunks.find(c => c.metadata.level === 'large');

         console.log(`embeddingStep returning ${embeddedFineChunks.length} fine, ${embeddedMediumChunks.length} medium chunks with embeddings, and ${embeddedLargeChunk ? 1 : 0} large chunk with embedding.`);

         // Return adjusted structure matching schema
         return {
            fineChunks: embeddedFineChunks,
            mediumChunks: embeddedMediumChunks,
            largeChunk: embeddedLargeChunk, // Will be undefined if summary was skipped
        };
    },
});

// Step 8: Index Embeddings
export const indexingStep = new Step({
    id: 'indexEmbeddings',
    outputSchema: indexingStepOutputSchema,
    execute: async ({ context, mastra }) => {
        console.log('--- Executing indexingStep ---');

        if (!mastra) {
            console.error('Mastra instance not found in context.');
            return { status: 'failed', indexedCount: 0 };
        }

        const pgVector = mastra.getVector("pg");
        if (!pgVector) {
            console.error('pgVector instance not found in Mastra configuration.');
            return { status: 'failed', indexedCount: 0 };
        }

        const embeddingsData = context.getStepResult<z.infer<typeof embeddingStepOutputSchema>>('embeddingStep');

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
  mastra: mastra
});

semanticChunkingWorkflow
  .step(fetchTranscriptStep)
  .then(formatTranscriptStep)
  .then(fineChunkingStep)
  .then(timestampMappingStep)
//   .then(mediumChunkingStep)
//   .then(largeChunkingStep)
//   .then(embeddingStep)
//   .then(indexingStep)
  .commit();