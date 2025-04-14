import { mastra } from "../../../mastra"; // Adjust path relative to utils directory
import { OutputChunk } from "./embeddingUtils"; // Import the type for chunks with embeddings
import { z } from "zod";

// Define a schema for the expected metadata within OutputChunk for validation
const expectedMetadataSchema = z.object({
    level: z.string(),
    videoId: z.string(),
    startOffset: z.number().optional(),
    endOffset: z.number().optional(),
    text: z.string(), // Also store the original text in metadata
    summary: z.string().optional(), // Optional summary for medium chunks
}).passthrough(); // Allow other potential metadata fields

/**
 * Upserts embeddings and associated metadata into a PgVector index.
 * Creates the index if it doesn't exist.
 *
 * @param indexName - The name of the index in PgVector.
 * @param chunksWithEmbeddings - An array of OutputChunk objects containing text, metadata, and embeddings.
 * @throws Throws an error if index creation or upserting fails.
 */
export async function upsertEmbeddingsToPgVector(
    indexName: string,
    chunksWithEmbeddings: OutputChunk[]
): Promise<void> {
    if (!chunksWithEmbeddings || chunksWithEmbeddings.length === 0) {
        console.log("No embeddings provided to upsert. Skipping indexing.");
        return;
    }

    console.log(`Starting upsert process for index: ${indexName}`);

    try {
        const pgVector = mastra.getVector("pg");
        const embeddingDimension = 3072; // Dimension for text-embedding-3-large

        // Check if index exists, create if not
        // Note: Mastra's vector interface might handle this implicitly or require explicit check/create.
        // Assuming explicit creation is safer based on example 06.
        // We'll attempt creation, assuming it might fail gracefully if exists or needs specific checks based on the final mastra API.
        console.log(`Attempting to ensure index '${indexName}' exists with dimension ${embeddingDimension}...`);
        // TODO: Check if a 'listIndexes' or 'indexExists' method is available in Mastra's pgVector client.
        // For now, we proceed with createIndex, assuming it's idempotent or errors if mismatched.
        // The `deleteIndex` call from the example is removed as we generally want to add to existing data.
        await pgVector.createIndex({
            indexName: indexName,
            dimension: embeddingDimension,
            // Add any other necessary configuration like distance metric if available/required
        });
        console.log(`Index '${indexName}' ensured.`);

        // Prepare data for upserting
        const vectors: number[][] = [];
        // Use the inferred type from the schema for better type safety
        const metadataList: z.infer<typeof expectedMetadataSchema>[] = [];

        for (const chunk of chunksWithEmbeddings) {
            // Validate metadata structure before upserting
            const metadataValidation = expectedMetadataSchema.safeParse(chunk.metadata);
            if (!metadataValidation.success) {
                 console.warn(`Skipping chunk due to invalid metadata: ${metadataValidation.error.message}`, chunk.metadata);
                 continue;
            }

            // Ensure text is included in metadata for storage
            const validatedMetadata = {
                ...metadataValidation.data,
                text: chunk.text, // Explicitly include text from the chunk object
            };


            vectors.push(chunk.embedding);
            metadataList.push(validatedMetadata);
        }

         if (vectors.length === 0) {
            console.log("No valid chunks remaining after metadata validation. Skipping upsert.");
            return;
        }

        console.log(`Upserting ${vectors.length} vectors into index '${indexName}'...`);
        await pgVector.upsert({
            indexName: indexName,
            vectors: vectors,
            metadata: metadataList,
        });

        console.log(`Successfully upserted ${vectors.length} embeddings into index '${indexName}'.`);

    } catch (error) {
        console.error(`Error during PgVector upsert process for index '${indexName}':`, error);
        throw new Error(`Failed to upsert embeddings into PgVector index '${indexName}'.`);
    }
} 