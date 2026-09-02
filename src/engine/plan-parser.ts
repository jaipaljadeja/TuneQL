import { NormalizedPlan, PlanNode } from '@/types';
import { extractPlanFindings } from './plan-findings';

interface RawPostgresExplainNode {
  'Node Type': string;
  'Relation Name'?: string;
  Alias?: string;
  'Startup Cost': number;
  'Total Cost': number;
  'Plan Rows': number;
  'Plan Width'?: number;
  'Actual Startup Time'?: number;
  'Actual Total Time'?: number;
  'Actual Rows'?: number;
  'Actual Loops'?: number;
  Filter?: string;
  'Rows Removed by Filter'?: number;
  'Index Name'?: string;
  'Index Cond'?: string;
  'Hash Cond'?: string;
  'Join Type'?: string;
  Plans?: RawPostgresExplainNode[];
  [key: string]: unknown;
}

interface RawPostgresExplainWrapper {
  Plan: RawPostgresExplainNode;
  'Planning Time'?: number;
  'Execution Time'?: number;
  Triggers?: unknown[];
}

let nodeIdCounter = 0;

function transformNode(raw: RawPostgresExplainNode): PlanNode {
  nodeIdCounter++;
  const id = `node-${nodeIdCounter}`;

  const node: PlanNode = {
    id,
    nodeType: raw['Node Type'] || 'Unknown',
    relationName: raw['Relation Name'],
    alias: raw['Alias'],
    startupCost: raw['Startup Cost'] || 0,
    totalCost: raw['Total Cost'] || 0,
    planRows: raw['Plan Rows'] || 0,
    actualStartupTimeMs: raw['Actual Startup Time'],
    actualTotalTimeMs: raw['Actual Total Time'],
    actualRows: raw['Actual Rows'],
    actualLoops: raw['Actual Loops'],
    filter: raw['Filter'],
    rowsRemovedByFilter: raw['Rows Removed by Filter'],
    indexName: raw['Index Name'],
    indexCond: raw['Index Cond'],
    hashCond: raw['Hash Cond'],
    joinType: raw['Join Type'],
    raw,
  };

  if (Array.isArray(raw['Plans'])) {
    node.plans = raw['Plans'].map(transformNode);
  }

  return node;
}

export function parsePostgresExplainJson(
  explainOutput: unknown,
): NormalizedPlan {
  nodeIdCounter = 0;

  let wrapper: RawPostgresExplainWrapper | null = null;

  if (Array.isArray(explainOutput) && explainOutput.length > 0) {
    wrapper = explainOutput[0] as RawPostgresExplainWrapper;
  } else if (
    typeof explainOutput === 'object' &&
    explainOutput !== null &&
    'Plan' in explainOutput
  ) {
    wrapper = explainOutput as RawPostgresExplainWrapper;
  }

  if (!wrapper || !wrapper.Plan) {
    throw new Error('Invalid EXPLAIN JSON structure: missing Plan root.');
  }

  const rootNode = transformNode(wrapper.Plan);
  const executionTimeMs = wrapper['Execution Time'];
  const planningTimeMs = wrapper['Planning Time'];
  const totalTimeMs =
    executionTimeMs !== undefined
      ? executionTimeMs + (planningTimeMs || 0)
      : rootNode.actualTotalTimeMs;

  const findings = extractPlanFindings(rootNode);

  return {
    rootNode,
    planningTimeMs,
    executionTimeMs,
    totalTimeMs,
    findings,
    rawJson: explainOutput,
  };
}
