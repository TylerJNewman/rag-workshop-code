// --- Schemas ---
import { z } from "zod";
import { TimedChunk } from "../utils/timestampMappingWink";
import { VideoDetails } from "../utils/fetchTranscript";
import { MediumChunk } from "../../agents/med-chunking-agent/tool";
import { OutputChunk } from "../utils/embeddingUtils";

// TODO: Consider defining an explicit Zod schema mirroring the TimedChunk structure for stricter validation
export const timedChunkSchema = z.custom<TimedChunk>((val) => {
  return typeof val === 'object' && val !== null &&
    typeof (val as TimedChunk).text === 'string' &&
    typeof (val as TimedChunk).startOffset === 'number' &&
    typeof (val as TimedChunk).endOffset === 'number';
}, { message: "Invalid TimedChunk structure" });
export const timedChunksArraySchema = z.array(timedChunkSchema);

// Define Zod schemas for step outputs
// TODO: Consider defining an explicit Zod schema mirroring the VideoDetails structure for stricter validation
export const videoDetailsSchema = z.custom<VideoDetails>();
export const formattedTranscriptSchema = z.string();

// Schema for the mediumChunkingTool/Step output
// TODO: Consider defining an explicit Zod schema mirroring the MediumChunk structure for stricter validation
export const mediumChunkSchema = z.custom<MediumChunk>();
export const mediumChunksArraySchema = z.array(mediumChunkSchema);

// Schema for the largeChunkingStep output
export const videoSummarySchema = z.string();

// TODO: Consider defining an explicit Zod schema mirroring the OutputChunk structure for stricter validation
export const outputChunkSchema = z.custom<OutputChunk>(); // Assuming OutputChunk is { text, metadata, embedding }

// Schema for the embeddingStep output
export const embeddingStepOutputSchema = z.object({
  fineChunks: z.array(outputChunkSchema),
  mediumChunks: z.array(outputChunkSchema),
  largeChunk: outputChunkSchema.optional(), // Summary might be skipped
});

// Schema for the final indexing step output
export const indexingStepOutputSchema = z.object({
  status: z.string(),
  indexedCount: z.number(),
});