#!/usr/bin/env node

import { Mastra } from '@mastra/core';
import { semanticChunkingWorkflow } from '../mastra/workflows/semanticChunking';

// Initialize Mastra with our workflow
const mastra = new Mastra({
  workflows: { semanticChunkingWorkflow }
});

async function main() {
  try {
    const videoId = process.argv[2] || 'Blx0roWAsFQ';
    const workflow = mastra.getWorkflow('semanticChunkingWorkflow');
    
    if (!workflow) {
      throw new Error("Could not find 'semanticChunking' workflow");
    }

    const run = workflow.createRun();
    const result = await run.start({ triggerData: { videoId } });

    console.log(result);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'An unknown error occurred');
    process.exit(1);
  }
}

main();