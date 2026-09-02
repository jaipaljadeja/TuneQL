import { PlanFinding, PlanNode } from '@/types';

export function extractPlanFindings(rootNode: PlanNode): PlanFinding[] {
  const findings: PlanFinding[] = [];
  const rootTime = rootNode.actualTotalTimeMs || 0;

  function traverse(node: PlanNode) {
    const nodeType = node.nodeType.toLowerCase();
    const loops = Math.max(1, node.actualLoops ?? 1);
    const producedRows = (node.actualRows ?? node.planRows) * loops;
    const removedRows = (node.rowsRemovedByFilter ?? 0) * loops;
    const examinedRows = producedRows + removedRows;

    // Rule 1: Large Sequential Scan
    if (nodeType.includes('seq scan') && examinedRows >= 5000) {
      findings.push({
        id: `finding-seq-scan-${node.id}`,
        severity: 'high',
        title: `Large Sequential Scan on ${node.relationName || 'table'}`,
        description: `Examined about ${examinedRows.toLocaleString()} rows across ${loops.toLocaleString()} loop(s). If this scan is selective and frequent, an index matching its filter or join columns may help.`,
        nodeType: node.nodeType,
        relation: node.relationName,
      });
    }

    // Rule 2: High Filter Row Drop
    if (removedRows > 2000) {
      const dropRatio =
        examinedRows > 0 ? (removedRows / examinedRows) * 100 : 0;
      if (dropRatio >= 50) {
        findings.push({
          id: `finding-filter-drop-${node.id}`,
          severity: 'medium',
          title: `Heavy Filter Rejection on ${node.relationName || node.nodeType}`,
          description: `The filter discarded about ${removedRows.toLocaleString()} rows across ${loops.toLocaleString()} loop(s), or ${dropRatio.toFixed(0)}% of examined rows. An index matching the filter may help if the predicate is selective.`,
          nodeType: node.nodeType,
          relation: node.relationName,
        });
      }
    }

    // Rule 3: Planner Cardinality Misestimate (> 10x)
    if (
      node.actualRows !== undefined &&
      node.planRows > 0 &&
      (node.actualRows / node.planRows > 10 ||
        node.planRows / Math.max(1, node.actualRows) > 10)
    ) {
      const ratio =
        node.actualRows > node.planRows
          ? (node.actualRows / node.planRows).toFixed(1)
          : (node.planRows / Math.max(1, node.actualRows)).toFixed(1);
      findings.push({
        id: `finding-estimate-mismatch-${node.id}`,
        severity: 'medium',
        title: `Planner Estimate Discrepancy (${ratio}x)`,
        description: `Postgres estimated ${node.planRows.toLocaleString()} rows but actually produced ${node.actualRows.toLocaleString()} rows. Outdated statistics or complex expressions may degrade plan choices.`,
        nodeType: node.nodeType,
        relation: node.relationName,
      });
    }

    // PostgreSQL reports these values as per-loop averages. Child timings are
    // inclusive, so this is a signal for inspection rather than attribution.
    const observedNodeTime = (node.actualTotalTimeMs ?? 0) * loops;
    if (
      rootTime > 10 &&
      node.actualTotalTimeMs !== undefined &&
      observedNodeTime / rootTime >= 0.5 &&
      node !== rootNode
    ) {
      findings.push({
        id: `finding-bottleneck-${node.id}`,
        severity: 'info',
        title: `High-cost child operation: ${node.nodeType}`,
        description: `This node's inclusive observed time is about ${observedNodeTime.toFixed(1)} ms across ${loops.toLocaleString()} loop(s), relative to ${rootTime.toFixed(1)} ms at the root. Inspect its children before attributing all of that time to this operation.`,
        nodeType: node.nodeType,
        relation: node.relationName,
      });
    }

    if (node.plans) {
      for (const child of node.plans) {
        traverse(child);
      }
    }
  }

  traverse(rootNode);
  return findings;
}
