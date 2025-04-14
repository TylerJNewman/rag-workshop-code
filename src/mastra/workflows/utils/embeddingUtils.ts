import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

// Base metadata structure, common to all chunk levels before embedding
// Remove these manual types as they are derived from Zod below
/*
export type BaseChunkMetadata = {
    videoId: string;
    title?: string;
    channelTitle?: string;
    description?: string;
    thumbnailUrl?: string;
    publishedAt?: string | Date;
    keywords?: string[]; // Original video keywords, distinct from generated tags
    lengthSeconds?: number;
    viewCount?: number | string;
    level: 'fine' | 'medium' | 'large';
    startOffset?: number;
    endOffset?: number;
    summary?: string; 
    tags?: string[]; // <-- Add optional tags field
};
*/

// Input structure for the embedding utility
// Remove these manual types as they are derived from Zod below
/*
export type InputChunk = {
    text: string; 
    metadata: BaseChunkMetadata;
};
*/

// Output structure from the embedding utility
// Remove these manual types as they are derived from Zod below
/*
export type OutputChunk = {
    text: string;
    metadata: BaseChunkMetadata; // Metadata remains the same structure
    embedding: number[];
};
*/

// Define the input schema for a chunk with text and metadata
const inputChunkSchema = z.object({
  text: z.string(),
  metadata: z.object({ // Define expected metadata structure more explicitly
      videoId: z.string(),
      title: z.string().optional(),
      channelTitle: z.string().optional(),
      description: z.string().optional(),
      thumbnailUrl: z.string().optional(),
      publishedAt: z.union([z.string(), z.date()]).optional(),
      keywords: z.array(z.string()).optional(), // Original video keywords
      lengthSeconds: z.number().optional(),
      viewCount: z.union([z.number(), z.string()]).optional(),
      level: z.enum(['fine', 'medium', 'large']),
      startOffset: z.number().optional(),
      endOffset: z.number().optional(),
      summary: z.string().optional(), 
      tags: z.array(z.string()).optional(), // <-- Add optional tags field here
  }).passthrough(), // Allow other fields if necessary, though explicit is better
});

// Define the output schema including the embedding
const outputChunkSchema = inputChunkSchema.extend({
  embedding: z.array(z.number()),
});

export type InputChunk = z.infer<typeof inputChunkSchema>;
export type OutputChunk = z.infer<typeof outputChunkSchema>;

/**
 * Generates embeddings for an array of text chunks using OpenAI's text-embedding-3-large model.
 *
 * @param chunks - An array of objects, each containing `text` and `metadata`.
 * @returns A promise that resolves to an array of objects, each containing the original `metadata`, `text`, and the generated `embedding`.
 * @throws Throws an error if the embedding generation fails.
 */
export async function generateEmbeddings(
  chunks: InputChunk[]
): Promise<OutputChunk[]> {
  // Validate input chunks
  const validationResult = z.array(inputChunkSchema).safeParse(chunks);
  if (!validationResult.success) {
    console.error("Invalid input chunks:", validationResult.error);
    throw new Error("Invalid input data for embedding generation.");
  }

  const textsToEmbed = chunks.map((chunk) => chunk.text);

  try {
    console.log(
      `Generating embeddings for ${textsToEmbed.length} chunks using text-embedding-3-small...`
    );
    const { embeddings } = await embedMany({
      model: openai.embedding("text-embedding-3-small"),
      values: textsToEmbed,
    });

    if (embeddings.length !== chunks.length) {
      throw new Error(
        "Mismatch between number of chunks and generated embeddings."
      );
    }

    // Combine original chunk data with the generated embedding
    const chunksWithEmbeddings = chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
    }));

    // Validate output (optional but good practice)
    const outputValidation = z.array(outputChunkSchema).safeParse(chunksWithEmbeddings);
     if (!outputValidation.success) {
        console.error("Invalid output data after embedding:", outputValidation.error);
        throw new Error("Output data validation failed after embedding generation.");
    }


    console.log(`Successfully generated ${embeddings.length} embeddings.`);
    return chunksWithEmbeddings;
  } catch (error) {
    console.error("Error generating embeddings:", error);
    throw new Error("Failed to generate embeddings.");
  }
} 