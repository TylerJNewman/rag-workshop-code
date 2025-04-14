import { google } from '@ai-sdk/google';
import { Agent } from '@mastra/core/agent';
import { env } from '../../../config';
import { instructions } from './instructions';

export const largeChunkingAgent = new Agent({
  name: 'Large Chunking Agent',
  model: google(env.GEMINI_MODEL),
  instructions,
});
