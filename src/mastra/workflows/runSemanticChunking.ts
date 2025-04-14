import { semanticChunkingWorkflow } from "./semanticChunking";

// Run the workflow
const videoId = 'Blx0roWAsFQ';
console.log(`Running simple semantic chunking workflow for video ID: ${videoId}...`);

const run = semanticChunkingWorkflow.createRun();

const unsubscribe = run.watch(({results, activePaths}) => {
  console.log('Results:', results);
  console.log('Active paths:', activePaths);
});

run.start({ triggerData: { videoId } }).catch(console.error);

unsubscribe();