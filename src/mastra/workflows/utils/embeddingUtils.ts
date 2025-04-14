import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

// Define the input schema for a chunk with text and metadata
const inputChunkSchema = z.object({
  text: z.string(),
  metadata: z.record(z.any()), // Allow any metadata structure
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
      `Generating embeddings for ${textsToEmbed.length} chunks using text-embedding-3-large...`
    );
    const { embeddings } = await embedMany({
      model: openai.embedding("text-embedding-3-large"),
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