import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { taggingAgent } from './index';

// Input schema: a single string
const inputSchema = z.string().describe('The text content to extract tags from.');

// Output schema: an array of strings (the tags)
const outputSchema = z.array(z.string()).describe('An array of semantic tags (keywords, topics) extracted from the text.');

// Define the type for the context parameter received by execute
type ExecuteContext = {
  context: z.infer<typeof inputSchema>; // Context is just the input string
};

export const taggingTool = createTool({
    id: 'tagging-tool',
    description: 'Extracts semantic tags (keywords, topics) from a given text using an LLM agent.',
    inputSchema: inputSchema,
    outputSchema: outputSchema,

    execute: async ({ context: inputText }: ExecuteContext) => {
        if (!inputText || inputText.trim().length === 0) {
            console.warn('taggingTool received empty input. Returning empty array.');
            return [];
        }

        console.log(`Calling ${taggingAgent.name} to extract tags...`);
        const agentResult = await taggingAgent.generate(inputText);
        
        // Revert to manual JSON parsing logic
        let jsonText = agentResult.text.trim();
        const match = jsonText.match(/```(?:json)?\n([\s\S]*?)\n```/);
        if (match?.[1]) {
            jsonText = match[1];
            console.log("Extracted JSON tags from code fences.");
        } else {
            console.log("Tagging agent response did not contain JSON code fences, attempting direct parse.");
        }

        try {
            const parsedTags = JSON.parse(jsonText);
            // Validate the parsed structure against the output schema
            const validation = outputSchema.safeParse(parsedTags);
            if (!validation.success) {
                console.error("Parsed agent JSON tags failed schema validation:", validation.error);
                console.error("Original agent response text:", agentResult.text);
                return []; 
            }
            console.log(`Extracted ${validation.data.length} tags.`);
            return validation.data; 
        } catch (e) {
            console.error("Failed to parse JSON response from taggingAgent:", e);
            console.error("Original agent response text:", agentResult.text);
            return []; 
        }
    },
}); 