'use client';

import { useState } from 'react';
import { useWorkspace } from '@/workspace/useWorkspace';
import { WorkspaceCommands } from '@/workspace/commands';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SlidersHorizontal, CheckCircle2 } from 'lucide-react';

interface ConstraintsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConstraintsModal({
  open,
  onOpenChange,
}: ConstraintsModalProps) {
  const constraints = useWorkspace((state) => state.constraints);
  const [targetRuntime, setTargetRuntime] = useState(
    String(constraints.targetRuntimeMs || 5),
  );
  const [allowRewrite, setAllowRewrite] = useState(
    constraints.allowQueryRewrite,
  );
  const [allowIndexes, setAllowIndexes] = useState(constraints.allowIndexes);
  const [maxIndexes, setMaxIndexes] = useState(
    String(constraints.maxNewIndexes),
  );

  const handleSave = () => {
    const parsedMaxIndexes = Number(maxIndexes);
    WorkspaceCommands.updateConstraints({
      targetRuntimeMs: targetRuntime ? Number(targetRuntime) : undefined,
      allowQueryRewrite: allowRewrite,
      allowIndexes,
      maxNewIndexes: Number.isFinite(parsedMaxIndexes)
        ? Math.max(0, Math.min(5, parsedMaxIndexes))
        : 1,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border text-foreground text-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="w-4 h-4 text-sky-400" />
            <span>Optimization Guardrails & Constraints</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-1 text-xs">
          <p className="text-muted-foreground text-[11px]">
            Set strict requirements for both human experimentation and external
            WebMCP agents operating this workspace.
          </p>

          {/* Target Runtime */}
          <div className="grid gap-2">
            <label
              htmlFor="target-runtime"
              className="block text-[11px] font-semibold text-foreground"
            >
              Target Runtime (ms)
            </label>
            <Input
              id="target-runtime"
              name="target-runtime"
              autoComplete="off"
              type="number"
              value={targetRuntime}
              onChange={(e) => setTargetRuntime(e.target.value)}
              placeholder="150"
              className="h-8 font-mono bg-background/50 border-border/80 text-xs"
            />
            <span className="text-[10px] text-muted-foreground">
              For example: &ldquo;Get this query below 5 ms.&rdquo;
            </span>
          </div>

          {/* Result Equivalence Mandatory */}
          <div className="p-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Full Result Equivalence</span>
            </div>
            <span className="text-[10px] text-emerald-300 font-mono font-bold">
              MANDATORY
            </span>
          </div>

          {/* Allow Query Rewrite */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-md border border-border/50 bg-background/30">
            <div>
              <span className="font-semibold text-foreground">
                Allow Query Rewrites
              </span>
              <p className="text-[10px] text-muted-foreground">
                Permits changing SQL structure or syntax.
              </p>
            </div>
            <Switch
              aria-label="Allow query rewrites"
              checked={allowRewrite}
              onCheckedChange={setAllowRewrite}
            />
          </div>

          {/* Allow Index Modifications */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-md border border-border/50 bg-background/30">
            <div>
              <span className="font-semibold text-foreground">
                Allow Index Additions
              </span>
              <p className="text-[10px] text-muted-foreground">
                Permits creating candidate indexes.
              </p>
            </div>
            <Switch
              aria-label="Allow index additions"
              checked={allowIndexes}
              onCheckedChange={setAllowIndexes}
            />
          </div>

          {/* Max New Indexes */}
          {allowIndexes && (
            <div className="grid gap-2">
              <label
                htmlFor="maximum-new-indexes"
                className="block text-[11px] font-semibold text-foreground"
              >
                Maximum New Indexes (0–5)
              </label>
              <Input
                id="maximum-new-indexes"
                name="maximum-new-indexes"
                autoComplete="off"
                type="number"
                min="0"
                max="5"
                value={maxIndexes}
                onChange={(e) => setMaxIndexes(e.target.value)}
                className="h-8 font-mono bg-background/50 border-border/80 text-xs"
              />
              <span className="text-[10px] text-muted-foreground">
                Challenge demo default is 1 new index.
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            Save Constraints
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
