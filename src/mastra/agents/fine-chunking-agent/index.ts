import { google } from '@ai-sdk/google';
import { env } from '../../../config';
import { instructions } from './instructions';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { createTool } from '@mastra/core/tools';

export const fineChunkingAgent = new Agent({
  name: 'Fine Chunking Agent',
  model: google(env.GEMINI_MODEL),
  instructions,
});

// Given these sequential fine-level transcript chunks, group them into coherent topics or sections of approximately 500 words. Provide a short summary for each resulting medium-level chunk. Maintain timestamps.
export const fineChunkingTool = createTool({
  id: 'fine-chunking-agent',
  description: 'Calls the fine chunking agent to chunk a transcript.',
  inputSchema: z.object({
    transcript: z.string().describe('Transcript'),
  }),
  outputSchema: z.array(z.string()).describe('An array of text chunks resulting from semantic splitting.'),
  execute: async ({ context }) => {
    const result = await fineChunkingAgent.generate(
      `Chunk the following transcript: ${context.transcript}`,
    );
    
    let jsonText = result.text.trim();
    const match = jsonText.match(/```(?:json)?\n([\s\S]*?)\n```/);
    if (match?.[1]) {
        jsonText = match[1];
    } else {
        console.log("Agent response did not contain JSON code fences, attempting direct parse.");
    }

    try {
      return JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse JSON response from fineChunkingAgent:", e);
        console.error("Original agent response text:", result.text);
        throw new Error("Failed to parse JSON response from fine-chunking agent.");
    }
  },
});