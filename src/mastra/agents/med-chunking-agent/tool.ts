import { z } from 'zod';
// Import createTool from specific path, Agent from core
import { Agent } from '@mastra/core';
import { createTool } from '@mastra/core/tools';
import { TimedChunk } from '../../workflows/utils/timestampMapping'; // Input type from Phase 2
import { medChunkingAgent } from './index';
import Fuse from 'fuse.js'; // Import Fuse for potential mapping

// Keep input schema as an object containing the fine chunks array
const inputSchema = z.object({ 
  fineChunks: z.array(
    z.object({
      text: z.string(),
      startOffset: z.number(),
      endOffset: z.number(),
    })
  ).describe("An array of timed fine-level chunks from the previous step.")
});

// Define the structure the LLM agent should return for each medium chunk (used for parsing)
const agentChunkOutputSchema = z.object({
  content: z.string().describe("The full text content of the aggregated medium-level chunk."),
  summary: z.string().describe("A concise summary of the medium-level chunk."),
  // Require the start and end *indices* of the fine chunks used
  start_fine_chunk_index: z.number().int().min(0).describe("The 0-based index of the FIRST fine chunk included in this medium chunk."),
  end_fine_chunk_index: z.number().int().min(0).describe("The 0-based index of the LAST fine chunk included in this medium chunk."),
  // Remove old optional timestamp fields
  // chunk_id: z.number().optional(),
  // start_time: z.string().nullable().optional().describe("Optional start timestamp as string or null."),
  // end_time: z.string().nullable().optional().describe("Optional end timestamp as string or null."),
});
// Define the schema for the agent's overall response (an array of medium chunks)
const agentOutputSchema = z.array(agentChunkOutputSchema);

// Define the final output structure for the tool, including calculated timestamps
export interface MediumChunk extends TimedChunk {
  summary: string;
}
// Zod schema for the final output array
const outputSchema = z.array(
  z.object({
    text: z.string(),
    startOffset: z.number(),
    endOffset: z.number(),
    summary: z.string(),
  })
).describe("An array of medium-level chunks, each with text, summary, and calculated start/end offsets.");


export const mediumChunkingTool = createTool({
    id: 'medium-chunking-tool', // Provide an ID
    description: 'Aggregates fine-level timed text chunks into medium-level chunks with summaries and combined timestamps.',
    inputSchema: inputSchema, // Use the object schema
    outputSchema: outputSchema, 
    
    // Correct execute signature: receives { context }, access input via context.fineChunks
    execute: async ({ context }) => {
        // Access the fineChunks array via context.fineChunks
        const fineChunks = context.fineChunks;
        if (!fineChunks || fineChunks.length === 0) {
            console.warn('mediumChunkingTool received no fine chunks. Returning empty array.');
            return [];
        }

        // 1. Prepare input for the agent using context.fineChunks
        const concatenatedText = context.fineChunks.map((chunk: TimedChunk) => chunk.text).join('\n\n---\n\n'); 

        // 2. Call the agent using 'generate'
        console.log(`Calling ${medChunkingAgent.name} with ${context.fineChunks.length} fine chunks (concatenated length: ${concatenatedText.length})...`);
        const agentResult = await medChunkingAgent.generate(
             // Explicitly request JSON output conforming to the agentChunkOutputSchema
             `Aggregate the following fine-level chunks into coherent medium-level chunks. 
Each medium chunk should represent a distinct topic or section.
For each medium chunk, identify the start and end indices of the original fine-level chunks that were aggregated to create it.

Return the result ONLY as a valid JSON array, where each object in the array MUST have the following fields:
- "content": (string) The full text content of the aggregated medium-level chunk.
- "summary": (string) A concise summary of the medium-level chunk.
- "start_fine_chunk_index": (number) The 0-based index of the FIRST fine chunk included.
- "end_fine_chunk_index": (number) The 0-based index of the LAST fine chunk included.

IMPORTANT: Ensure the indices are correct, 0-based, and cover the range of fine chunks used for that medium chunk.

Do NOT include any conversational text or markdown formatting (like \`\`\`) outside the JSON array itself.

Here are the original fine-level chunks (use their 0-based index for the start/end indices above):
${context.fineChunks.map((chunk: TimedChunk, index: number) => `[${index}] ${chunk.text}`).join('\n\n---\n\n')}`
        );
        
        // 3. Parse Agent Response 
        let jsonText = agentResult.text.trim();
        const match = jsonText.match(/```(?:json)?\n([\s\S]*?)\n```/);
        if (match?.[1]) {
            jsonText = match[1];
            console.log("Extracted JSON from code fences.");
        } else {
            console.log("Med-chunking agent response did not contain JSON code fences, attempting direct parse.");
        }

        let parsedAgentResponse: z.infer<typeof agentOutputSchema>;
        try {
          console.log("Attempting to parse JSON:", jsonText);
          parsedAgentResponse = JSON.parse(jsonText);
          console.log("Successfully parsed JSON.");

          const validation = agentOutputSchema.safeParse(parsedAgentResponse);
          if (!validation.success) {
              console.error("Parsed agent JSON response failed schema validation:", validation.error);
              throw new Error("Agent response structure mismatch after JSON parsing.");
          }
          parsedAgentResponse = validation.data; 
          console.log("Successfully validated parsed JSON schema.");
        } catch (e) {
            console.error("Failed to parse JSON response from medChunkingAgent:", e);
            console.error("Original agent response text (in catch block):", agentResult.text);
            throw new Error(`Failed to parse JSON response from med-chunking agent: ${e instanceof Error ? e.message : String(e)}`);
        }

        console.log(`${medChunkingAgent.name} returned ${parsedAgentResponse.length} potential medium chunks.`);

        // 4. Map agent output back to fine chunks and calculate timestamps
        const mediumChunks: z.infer<typeof outputSchema> = [];

        // --- Direct Timestamp Mapping using Agent-Provided Indices --- 
        const totalFineChunks = context.fineChunks.length;
        const totalAgentChunks = parsedAgentResponse.length;
        let mappedCount = 0;

        if (totalFineChunks > 0 && totalAgentChunks > 0) {
            for (let i = 0; i < totalAgentChunks; i++) {
                const agentChunk = parsedAgentResponse[i];
                const startIndex = agentChunk.start_fine_chunk_index;
                const endIndex = agentChunk.end_fine_chunk_index;

                // **Validation Checks**
                if (startIndex === undefined || endIndex === undefined) {
                     console.warn(`[Agent Mapping] Skipping agent chunk ${i} due to missing start/end index.`);
                     continue;
                }
                if (startIndex < 0 || startIndex >= totalFineChunks || endIndex < 0 || endIndex >= totalFineChunks) {
                    console.warn(`[Agent Mapping] Skipping agent chunk ${i} due to out-of-bounds index: start=${startIndex}, end=${endIndex}, total=${totalFineChunks}`);
                    continue;
                }
                if (startIndex > endIndex) {
                    console.warn(`[Agent Mapping] Skipping agent chunk ${i} due to start index (${startIndex}) > end index (${endIndex}).`);
                    continue;
                }
                
                // Indices are valid, proceed with mapping
                const firstFineChunk = context.fineChunks[startIndex];
                const lastFineChunk = context.fineChunks[endIndex];

                mediumChunks.push({
                    text: agentChunk.content,
                    summary: agentChunk.summary,
                    startOffset: firstFineChunk.startOffset,
                    endOffset: lastFineChunk.endOffset,
                });
                mappedCount++;
            }
            console.log(`[Agent Mapping] Created ${mappedCount} medium chunks using agent-provided indices.`);

            // Sanity check warning if counts don't match expectations
            if (mappedCount !== totalAgentChunks) {
                console.warn(`[Agent Mapping] Mismatch: Agent returned ${totalAgentChunks}, mapped ${mappedCount} after validation.`);
            }
        } else {
            console.warn("[Agent Mapping] No agent response or no fine chunks to map.");
        }
        // --- End Direct Timestamp Mapping ---

        /* 
        // TODO: Implement robust mapping logic (potentially using Fuse.js) - Original Logic Commented Out
        for (const agentChunk of parsedAgentResponse) {
            // Placeholder mapping logic needs context.fineChunks
            const placeholderFineChunkCount = Math.ceil(context.fineChunks.length / parsedAgentResponse.length);
            const startFineChunkIndex = currentFineChunkIndex;
            const endFineChunkIndex = Math.min(currentFineChunkIndex + placeholderFineChunkCount - 1, context.fineChunks.length - 1);

            if (startFineChunkIndex >= context.fineChunks.length || startFineChunkIndex > endFineChunkIndex) {
                 console.warn("Medium chunk mapping error: Ran out of fine chunks or index mismatch.");
                 break; 
            }

            const firstFineChunk = context.fineChunks[startFineChunkIndex];
            const lastFineChunk = context.fineChunks[endFineChunkIndex];

            mediumChunks.push({
                text: agentChunk.medium_chunk_text, 
                summary: agentChunk.summary,
                startOffset: firstFineChunk.startOffset, 
                endOffset: lastFineChunk.endOffset,     
            });

            currentFineChunkIndex = endFineChunkIndex + 1;
        }
        
        if (mediumChunks.length !== parsedAgentResponse.length) {
             console.warn(`Medium chunk mapping mismatch: Agent response count: ${parsedAgentResponse.length}, Mapped count: ${mediumChunks.length}`);
        }
        */
        
        console.log(`MediumChunkingTool returning ${mediumChunks.length} mapped medium chunks.`);
        return mediumChunks;
    },
}); 