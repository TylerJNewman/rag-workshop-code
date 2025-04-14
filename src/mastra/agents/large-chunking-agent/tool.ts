import { z } from 'zod';
import { createTool } from '@mastra/core/tools'; // No ToolExecutionContext needed here
import { MediumChunk } from '../med-chunking-agent/tool'; // Import the type for medium chunks
import { largeChunkingAgent } from './index'; // Import the agent

// Define the input schema: an object containing an array of MediumChunk objects
const inputSchema = z.object({ 
    mediumChunks: z.array(
        z.object({
            text: z.string(),
            startOffset: z.number(),
            endOffset: z.number(),
            summary: z.string(),
        })
    ).describe("An array of medium-level chunks from the previous step, each containing text, summary, and offsets.")
});

// Define the output schema: a single string containing the video-level summary
const outputSchema = z.string().describe("A single string containing the concise video-level summary.");

// Define the type for the context parameter received by execute
type ExecuteContext = { context: z.infer<typeof inputSchema> };

export const largeChunkingTool = createTool({
    id: 'large-chunking-tool',
    description: 'Generates a video-level summary from medium-level chunk summaries.',
    inputSchema: inputSchema, // Input schema is z.object({ mediumChunks: ... })
    outputSchema: outputSchema,

    // Execute function signature matches the working pattern from medChunkingTool
    execute: async ({ context }: ExecuteContext) => {
        const mediumChunks = context.mediumChunks; // Access the array via context.mediumChunks
        if (!mediumChunks || mediumChunks.length === 0) {
            console.warn('largeChunkingTool received no medium chunks. Returning empty summary.');
            return ""; // Return empty string if no input
        }

        // 1. Prepare input for the agent: Join the summaries
        const summariesText = mediumChunks
            .map((chunk: MediumChunk) => chunk.summary) // Add type annotation for chunk
            .filter(summary => summary && summary.trim() !== "") // Filter out empty summaries
            .join('\n\n---\n\n'); // Separate summaries clearly

        if (!summariesText || summariesText.trim() === "") {
            console.warn('largeChunkingTool found no valid summaries in medium chunks. Returning empty summary.');
            return "";
        }

        // 2. Call the agent using 'generate'
        // The agent's instructions are already set during its definition
        console.log(`Calling ${largeChunkingAgent.name} with ${mediumChunks.length} medium chunk summaries...`);
        const agentResult = await largeChunkingAgent.generate(summariesText);
        
        // 3. Return the agent's response text
        // No complex parsing needed as we expect a single string summary
        console.log(`${largeChunkingAgent.name} returned summary of length ${agentResult.text.length}.`);
        return agentResult.text.trim(); // Trim whitespace from the result
    },
}); 