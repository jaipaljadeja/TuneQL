'use client';

import React, { useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { useWorkspace } from '@/workspace/useWorkspace';
import { WorkspaceCommands } from '@/workspace/commands';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { KeyboardShortcut } from '@/components/ui/keyboard-shortcut';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Play,
  Search,
  Timer,
  BookmarkCheck,
  RotateCcw,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { INITIAL_BASELINE_SQL } from '@/db/ecommerce-fixture';

interface SqlEditorProps {
  onTabChange?: (tab: string) => void;
}

export function SqlEditor({ onTabChange }: SqlEditorProps) {
  const workspace = useWorkspace(
    useShallow((state) => ({
      baseline: state.baseline,
      constraints: state.constraints,
      initialQuery: state.initialQuery,
      query: state.query,
      status: state.status,
    })),
  );
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [actionType, setActionType] = React.useState<
    'run' | 'explain' | 'benchmark' | 'baseline' | null
  >(null);
  const [actionError, setActionError] = React.useState<string>();

  const handleQueryChange = useCallback((value: string) => {
    WorkspaceCommands.updateQueryDraft(value);
    setActionError(undefined);
  }, []);

  const handleRun = useCallback(async () => {
    setIsExecuting(true);
    setActionType('run');
    setActionError(undefined);
    try {
      await WorkspaceCommands.runQuery('human');
      if (onTabChange) onTabChange('results');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExecuting(false);
      setActionType(null);
    }
  }, [onTabChange]);

  const handleExplain = useCallback(async () => {
    setIsExecuting(true);
    setActionType('explain');
    setActionError(undefined);
    try {
      await WorkspaceCommands.explainQuery('analyze', 'human');
      if (onTabChange) onTabChange('plan');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExecuting(false);
      setActionType(null);
    }
  }, [onTabChange]);

  const handleBenchmark = useCallback(async () => {
    setIsExecuting(true);
    setActionType('benchmark');
    setActionError(undefined);
    try {
      await WorkspaceCommands.benchmarkQuery(undefined, undefined, 'human');
      if (onTabChange) onTabChange('benchmark');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExecuting(false);
      setActionType(null);
    }
  }, [onTabChange]);

  const handleSetBaseline = useCallback(async () => {
    setIsExecuting(true);
    setActionType('baseline');
    setActionError(undefined);
    try {
      await WorkspaceCommands.setBaseline('human');
      if (onTabChange) onTabChange('compare');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExecuting(false);
      setActionType(null);
    }
  }, [onTabChange]);

  const handleResetQuery = () => {
    WorkspaceCommands.setActiveQuery(
      workspace.initialQuery || INITIAL_BASELINE_SQL,
      'human',
    );
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (!isCmdOrCtrl) return;

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleRun();
      } else if (
        isCmdOrCtrl &&
        e.shiftKey &&
        (e.key === 'E' || e.key === 'e')
      ) {
        e.preventDefault();
        handleExplain();
      } else if (
        isCmdOrCtrl &&
        e.shiftKey &&
        (e.key === 'B' || e.key === 'b')
      ) {
        e.preventDefault();
        handleBenchmark();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBenchmark, handleExplain, handleRun]);

  const hasBaseline = !!workspace.baseline;
  const isQueryModified =
    workspace.baseline &&
    workspace.baseline.query.trim() !== workspace.query.trim();

  return (
    <div className="flex flex-col h-full bg-card/20 select-text">
      {/* Editor Top Bar */}
      <div className="h-[42px] border-b border-border/80 px-3 bg-muted/40 flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">
            SQL Query
          </span>
          {isQueryModified ? (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 border-amber-500/40 text-amber-300 font-mono"
            >
              Candidate Rewrite
            </Badge>
          ) : hasBaseline ? (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 border-sky-500/40 text-sky-300 font-mono"
            >
              Baseline Query
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 border-border/60 text-muted-foreground font-mono"
            >
              Ready
            </Badge>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="default"
            size="sm"
            onClick={handleRun}
            disabled={isExecuting || workspace.status === 'initializing'}
            className="h-7 text-xs px-2.5 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-xs"
            aria-keyshortcuts="Meta+Enter Control+Enter"
            title="Run query (Cmd/Ctrl + Enter)"
          >
            {isExecuting && actionType === 'run' ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
            ) : (
              <Play className="size-3.5 shrink-0 fill-current" />
            )}
            <span>Run</span>
            <KeyboardShortcut
              keys={['⌘', '↵']}
              className="ml-0.5 hidden opacity-80 sm:inline-flex"
            />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExplain}
            disabled={isExecuting || workspace.status === 'initializing'}
            className="h-7 text-xs px-2.5 gap-1.5 border-border/80 hover:bg-accent text-foreground"
            aria-keyshortcuts="Meta+Shift+E Control+Shift+E"
            title="Explain execution plan (Cmd/Ctrl + Shift + E)"
          >
            {isExecuting && actionType === 'explain' ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
            ) : (
              <Search className="size-3.5 shrink-0 text-sky-400" />
            )}
            <span>Explain</span>
            <KeyboardShortcut
              keys={['⌘', '⇧', 'E']}
              className="ml-0.5 hidden opacity-80 sm:inline-flex"
            />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleBenchmark}
            disabled={isExecuting || workspace.status === 'initializing'}
            className="h-7 text-xs px-2.5 gap-1.5 border-border/80 hover:bg-accent text-foreground"
            aria-keyshortcuts="Meta+Shift+B Control+Shift+B"
            title="Run benchmark (Cmd/Ctrl + Shift + B)"
          >
            {isExecuting && actionType === 'benchmark' ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-amber-400 motion-reduce:animate-none" />
            ) : (
              <Timer className="size-3.5 shrink-0 text-amber-400" />
            )}
            <span>Benchmark</span>
            <KeyboardShortcut
              keys={['⌘', '⇧', 'B']}
              className="ml-0.5 hidden opacity-80 sm:inline-flex"
            />
          </Button>

          <div className="h-4 w-px bg-border/80 mx-0.5" />

          <Button
            variant="outline"
            size="sm"
            onClick={handleSetBaseline}
            disabled={isExecuting || workspace.status === 'initializing'}
            className="h-7 text-xs px-2.5 gap-1.5 border-border/80 hover:bg-sky-500/10 hover:text-sky-300 text-foreground"
            title="Set current query & benchmark as Baseline"
          >
            {isExecuting && actionType === 'baseline' ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-sky-400 motion-reduce:animate-none" />
            ) : (
              <BookmarkCheck className="size-3.5 shrink-0 text-sky-400" />
            )}
            <span>Set Baseline</span>
          </Button>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleResetQuery}
                  disabled={!workspace.constraints.allowQueryRewrite}
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label="Reset to initial query"
                />
              }
            >
              <RotateCcw className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Reset to initial query</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {actionError ? (
        <Alert
          variant="destructive"
          className="rounded-none border-x-0 border-t-0 bg-destructive/5 px-3 py-2"
        >
          <AlertCircle />
          <AlertTitle className="text-xs">Query operation failed</AlertTitle>
          <AlertDescription className="font-mono text-[11px]">
            {actionError}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Code Editor Body */}
      <div className="flex-1 overflow-auto text-sm font-mono">
        <CodeMirror
          value={workspace.query}
          height="100%"
          theme={oneDark}
          extensions={[sql()]}
          onChange={handleQueryChange}
          editable={workspace.constraints.allowQueryRewrite}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightSpecialChars: true,
            history: true,
            foldGutter: true,
            drawSelection: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            syntaxHighlighting: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            defaultKeymap: true,
            searchKeymap: true,
            historyKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true,
          }}
          className="h-full text-xs font-mono"
        />
      </div>
    </div>
  );
}
