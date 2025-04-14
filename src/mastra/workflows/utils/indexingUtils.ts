import { mastra } from "../../../mastra"; // Adjust path relative to utils directory
import { OutputChunk } from "./embeddingUtils"; // Import the type for chunks with embeddings
import { z } from "zod";
import pg from 'pg'; // Import pg correctly
const { Pool } = pg; // Extract Pool from pg

// Define a schema for the expected metadata within OutputChunk for validation
const expectedMetadataSchema = z.object({
    level: z.string(),
    videoId: z.string(),
    startOffset: z.number().optional(),
    endOffset: z.number().optional(),
    text: z.string(), // Also store the original text in metadata
    summary: z.string().optional(), // Optional summary for medium chunks
    title: z.string().optional(),
    channelTitle: z.string().optional(),
    description: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    publishedAt: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    lengthSeconds: z.number().optional(),
    viewCount: z.string().optional(),
    tags: z.array(z.string()).optional(),
}).passthrough(); // Allow other potential metadata fields

/**
 * Upserts embeddings and associated metadata into a PgVector index.
 * Manually ensures the table and HNSW index exist before upserting.
 *
 * @param indexName - The name of the index/table in PgVector.
 * @param chunksWithEmbeddings - An array of OutputChunk objects containing text, metadata, and embeddings.
 * @throws Throws an error if index creation or upserting fails.
 */
export async function upsertEmbeddingsToPgVector(
    indexName: string, // Assuming indexName is used as table name by Mastra
    chunksWithEmbeddings: OutputChunk[]
): Promise<void> {
    if (!chunksWithEmbeddings || chunksWithEmbeddings.length === 0) {
        console.log("No embeddings provided to upsert. Skipping indexing.");
        return;
    }

    const pgVector = mastra.getVector("pg");
    const embeddingDimension = 1536; // Dimension for text-embedding-3-small

    // Manually ensure extension, table, and HNSW index exist using raw pg client
    const pool = new Pool({ connectionString: process.env.POSTGRES_CONNECTION_STRING });
    const client = await pool.connect();
    console.log(`Ensuring extension, table, and HNSW index for '${indexName}' via raw SQL...`);
    try {
        await client.query('BEGIN');
        await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
        // Use the indexName as the table name, ensure it's quoted if necessary
        // Basic sanitization/quoting might be needed for production against arbitrary indexNames
        await client.query(`
            CREATE TABLE IF NOT EXISTS "${indexName}" (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                embedding VECTOR(${embeddingDimension}),
                metadata JSONB
            );
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS ${indexName}_ivfflat_idx
            ON "${indexName}"
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100);
        `);
        await client.query('COMMIT');
        console.log(`Table "${indexName}" and IVFFlat index ensured.`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error during manual table/index setup:', err);
        throw new Error(`Failed manual setup for table ${indexName}: ${err instanceof Error ? err.message : err}`);
    } finally {
        client.release();
        await pool.end(); // Close the pool after setup
    }

    console.log(`Starting upsert process for index/table: ${indexName}`);

    try {
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
        // Now call Mastra's upsert, which should find the prepared table
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