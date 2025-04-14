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
  // Allow optional strings OR null for timestamps
  chunk_id: z.number().optional(),
  start_time: z.string().nullable().optional().describe("Optional start timestamp as string or null."),
  end_time: z.string().nullable().optional().describe("Optional end timestamp as string or null."),
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
Return the result ONLY as a valid JSON array, where each object in the array MUST have the following fields:
- "content": (string) The full text content of the aggregated medium-level chunk.
- "summary": (string) A concise summary of the medium-level chunk.
- "start_time": (string, optional) The start timestamp of the first fine chunk included.
- "end_time": (string, optional) The end timestamp of the last fine chunk included.

Do NOT include any conversational text or markdown formatting (like \`\`\`) outside the JSON array itself.

Here are the fine-level chunks, separated by '---':\\n\\n${concatenatedText}`
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

        // --- Heuristic Timestamp Mapping (Replaces Simplified Logic) ---
        const totalFineChunks = context.fineChunks.length;
        const totalAgentChunks = parsedAgentResponse.length;

        if (totalFineChunks > 0 && totalAgentChunks > 0) {
            let currentFineChunkIndex = 0;
            for (let i = 0; i < totalAgentChunks; i++) {
                const agentChunk = parsedAgentResponse[i];
                
                // Estimate the range of fine chunks for this medium chunk
                const fineChunksPerAgentChunk = Math.ceil(totalFineChunks / totalAgentChunks); // Simple division
                const startFineChunkIndex = currentFineChunkIndex;
                // Ensure end index doesn't exceed bounds, especially for the last agent chunk
                let endFineChunkIndex = Math.min(currentFineChunkIndex + fineChunksPerAgentChunk - 1, totalFineChunks - 1);

                // Basic check to prevent infinite loop if logic fails
                if (startFineChunkIndex >= totalFineChunks || startFineChunkIndex > endFineChunkIndex) {
                    console.warn(`[Heuristic Mapping] Skipping agent chunk ${i} due to index mismatch: start=${startFineChunkIndex}, end=${endFineChunkIndex}, total=${totalFineChunks}`);
                    // Attempt to prevent getting stuck if distribution logic is flawed
                    if(startFineChunkIndex >= totalFineChunks) break;
                    endFineChunkIndex = startFineChunkIndex; // Process at least one if possible
                }
                
                const firstFineChunk = context.fineChunks[startFineChunkIndex];
                const lastFineChunk = context.fineChunks[endFineChunkIndex];

                mediumChunks.push({
                    text: agentChunk.content, 
                    summary: agentChunk.summary,
                    // Use start from the first fine chunk and end from the last fine chunk in the range
                    startOffset: firstFineChunk.startOffset, 
                    endOffset: lastFineChunk.endOffset,     
                });
                
                // Move to the next fine chunk for the next iteration
                currentFineChunkIndex = endFineChunkIndex + 1;
            }
            console.log(`[Heuristic Mapping] Created ${mediumChunks.length} medium chunks.`);
            
            // Sanity check warning if counts don't match
            if (mediumChunks.length !== totalAgentChunks) {
                 console.warn(`[Heuristic Mapping] Mismatch: Agent returned ${totalAgentChunks}, mapped ${mediumChunks.length}`);
            }

        } else {
            console.warn("[Heuristic Mapping] No agent response or no fine chunks to map.");
        }
        // --- End Heuristic Timestamp Mapping ---

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