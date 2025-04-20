import { Mastra } from '@mastra/core/mastra';
import { PostgresStore } from '@mastra/pg';

import { queryVectorAgent, basicAgent } from "./agents";
import { PgVector } from "@mastra/pg";
import { codeAgent } from "../bonus/agent";
import { semanticChunkingWorkflow } from './workflows/semanticChunkingWorkflow';

const connectionString = process.env.POSTGRES_CONNECTION_STRING;
if (!connectionString) {
  throw new Error(
    "POSTGRES_CONNECTION_STRING environment variable is required"
  );
}
const pgVector = new PgVector(connectionString);
export { pgVector };

export const mastra = new Mastra({
  agents: {
    queryVectorAgent,
    basicAgent,
    codeAgent,
  },
  storage: new PostgresStore({
    connectionString: connectionString
  }),
  vectors: {
    pg: pgVector,
  },
});
