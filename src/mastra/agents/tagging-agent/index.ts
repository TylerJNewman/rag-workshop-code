import { Agent } from '@mastra/core/agent';
import { taggingAgentInstructions } from './instructions/instructions';
import { google } from '@ai-sdk/google'; // Import the provider
import { env } from '../../../config'; // Assuming GEMINI_MODEL is defined here

export const taggingAgent = new Agent({
    name: 'Tagging Agent',
    instructions: taggingAgentInstructions,
    // Use the standard GEMINI_MODEL env var, fallback to flash
    model: google(env.GEMINI_MODEL || 'gemini-1.5-flash-latest'), 
    // outputType: 'json', // Remove invalid property
}); 