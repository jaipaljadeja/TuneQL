'use client';

import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import dynamic from 'next/dynamic';
import { useWorkspace } from '@/workspace/useWorkspace';
import { WorkspaceCommands } from '@/workspace/commands';
import { registerWebMcpTools } from '@/webmcp/register-tools';
import { Header } from '@/components/workbench/Header';
import { WorkspaceBar } from '@/components/workbench/WorkspaceBar';
import { SchemaExplorer } from '@/components/workbench/SchemaExplorer';
import { ResultsTable } from '@/components/workbench/ResultsTable';
import { PlanTreeViewer } from '@/components/workbench/PlanTreeViewer';
import { BenchmarkPanel } from '@/components/workbench/BenchmarkPanel';
import { ComparisonPanel } from '@/components/workbench/ComparisonPanel';
import { PerformanceInspector } from '@/components/workbench/PerformanceInspector';
import { ActivityDrawer } from '@/components/workbench/ActivityDrawer';
import { CreateIndexDialog } from '@/components/workbench/CreateIndexDialog';
import { ConstraintsModal } from '@/components/workbench/ConstraintsModal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { usePanelRef } from 'react-resizable-panels';
import {
  Loader2,
  Table2,
  GitCommit,
  Timer,
  Scale,
  AlertCircle,
} from 'lucide-react';

const SqlEditor = dynamic(
  () =>
    import('@/components/workbench/SqlEditor').then(
      (module) => module.SqlEditor,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-full bg-[#11141b]" aria-label="Loading SQL editor" />
    ),
  },
);

export default function WorkbenchPage() {
  const workspace = useWorkspace(
    useShallow((state) => ({
      id: state.id,
      status: state.status,
      errorMessage: state.errorMessage,
      schema: state.schema,
      lastPlan: state.lastPlan,
      lastBenchmark: state.lastBenchmark,
      lastComparison: state.lastComparison,
    })),
  );
  const [activeTab, setActiveTab] = useState('results');
  const [createIndexOpen, setCreateIndexOpen] = useState(false);
  const [constraintsOpen, setConstraintsOpen] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [initMessage, setInitMessage] = useState(
    'Starting local PostgreSQL engine…',
  );
  const activityPanelRef = usePanelRef();
  const isInitializing = workspace.status === 'initializing';

  useEffect(() => {
    let cancelled = false;
    let unregisterTools: (() => void) | undefined;

    void (async () => {
      try {
        await WorkspaceCommands.initWorkspace((message) => {
          if (!cancelled) setInitMessage(message);
        });
        if (cancelled) return;
        const registration = await registerWebMcpTools();
        if (cancelled) registration.cleanup();
        else unregisterTools = registration.cleanup;
      } catch {
        // The command and registration layers publish recoverable state to the UI.
      }
    })();

    return () => {
      cancelled = true;
      unregisterTools?.();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden font-sans select-none relative">
      {/* Top Header */}
      <Header onOpenConstraints={() => setConstraintsOpen(true)} />
      <WorkspaceBar />

      <div className="flex-1 min-h-0 relative">
        <ResizablePanelGroup orientation="vertical" className="h-full">
          <ResizablePanel id="workbench" defaultSize="97%" minSize="45%">
            <ResizablePanelGroup orientation="horizontal" className="h-full">
              <ResizablePanel
                id="schema"
                defaultSize="15%"
                minSize="180px"
                maxSize="30%"
                className="min-w-0 overflow-hidden"
              >
                <SchemaExplorer
                  onOpenCreateIndex={() => setCreateIndexOpen(true)}
                />
              </ResizablePanel>
              <ResizableHandle
                aria-label="Resize schema explorer"
                className="hover:bg-muted-foreground/40 focus-visible:bg-ring"
              />

              <ResizablePanel
                id="workspace"
                defaultSize="66%"
                minSize="38%"
                className="min-w-0 overflow-hidden"
              >
                <main className="h-full min-w-0 bg-background overflow-hidden">
                  <ResizablePanelGroup
                    orientation="vertical"
                    className="h-full"
                  >
                    <ResizablePanel
                      id="query"
                      defaultSize="34%"
                      minSize="160px"
                      maxSize="72%"
                      className="min-h-0 overflow-hidden"
                    >
                      <SqlEditor onTabChange={(tab) => setActiveTab(tab)} />
                    </ResizablePanel>
                    <ResizableHandle
                      aria-label="Resize query and results panels"
                      className="hover:bg-muted-foreground/40 focus-visible:bg-ring"
                    />
                    <ResizablePanel
                      id="output"
                      defaultSize="66%"
                      minSize="180px"
                      className="min-h-0 overflow-hidden bg-card/20"
                    >
                      <Tabs
                        value={activeTab}
                        onValueChange={setActiveTab}
                        className="h-full flex flex-col"
                      >
                        {/* Tab Navigation */}
                        <div className="border-b border-border/80 px-3 bg-muted/30 flex items-center justify-between h-9 select-none">
                          <TabsList className="h-7 bg-background/50 p-0.5 border border-border/60">
                            <TabsTrigger
                              value="results"
                              className="text-xs h-6 px-2.5 gap-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground transition-colors"
                            >
                              <Table2 className="w-3.5 h-3.5" />
                              <span>Results</span>
                            </TabsTrigger>
                            <TabsTrigger
                              value="plan"
                              className="text-xs h-6 px-2.5 gap-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground transition-colors"
                            >
                              <GitCommit className="w-3.5 h-3.5 text-sky-400" />
                              <span>Plan</span>
                              {workspace.lastPlan?.findings.length ? (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              ) : null}
                            </TabsTrigger>
                            <TabsTrigger
                              value="benchmark"
                              className="text-xs h-6 px-2.5 gap-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground transition-colors"
                            >
                              <Timer className="w-3.5 h-3.5 text-amber-400" />
                              <span>Benchmark</span>
                              {workspace.lastBenchmark && (
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  {workspace.lastBenchmark.medianMs}ms
                                </span>
                              )}
                            </TabsTrigger>
                            <TabsTrigger
                              value="compare"
                              className="text-xs h-6 px-2.5 gap-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground transition-colors"
                            >
                              <Scale className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Comparison</span>
                              {workspace.lastComparison && (
                                <span className="text-[10px] font-mono font-bold text-emerald-400">
                                  {workspace.lastComparison.speedup}x
                                </span>
                              )}
                            </TabsTrigger>
                          </TabsList>
                        </div>

                        {/* Tab Contents */}
                        <div className="flex-1 overflow-hidden">
                          <TabsContent
                            value="results"
                            className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col"
                          >
                            <ResultsTable />
                          </TabsContent>
                          <TabsContent
                            value="plan"
                            className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col"
                          >
                            <PlanTreeViewer />
                          </TabsContent>
                          <TabsContent
                            value="benchmark"
                            className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col"
                          >
                            <BenchmarkPanel />
                          </TabsContent>
                          <TabsContent
                            value="compare"
                            className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col"
                          >
                            <ComparisonPanel />
                          </TabsContent>
                        </div>
                      </Tabs>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </main>
              </ResizablePanel>
              <ResizableHandle
                aria-label="Resize performance inspector"
                className="hover:bg-muted-foreground/40 focus-visible:bg-ring"
              />

              <ResizablePanel
                id="inspector"
                defaultSize="19%"
                minSize="240px"
                maxSize="34%"
                className="min-w-0 overflow-hidden"
              >
                <PerformanceInspector
                  onOpenConstraints={() => setConstraintsOpen(true)}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle
            aria-label="Resize activity log"
            className="hover:bg-muted-foreground/40 focus-visible:bg-ring"
          />
          <ResizablePanel
            id="activity"
            panelRef={activityPanelRef}
            defaultSize="3%"
            minSize="38px"
            maxSize="40%"
            collapsedSize="38px"
            collapsible
            className="min-h-0 overflow-hidden"
            onResize={({ inPixels }) => setActivityExpanded(inPixels > 48)}
          >
            <ActivityDrawer
              expanded={activityExpanded}
              onToggle={() => {
                if (activityPanelRef.current?.isCollapsed())
                  activityPanelRef.current.resize('24%');
                else activityPanelRef.current?.collapse();
              }}
            />
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* Lightweight boot surface; no backdrop filter or layout animation during WASM startup. */}
        {isInitializing && (
          <div
            className="absolute inset-0 z-50 bg-background flex flex-col items-center justify-center p-8"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="p-5 rounded-lg bg-card border border-border/80 shadow-lg flex flex-col items-center space-y-3 max-w-sm text-center">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none text-emerald-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Initializing PostgreSQL Sandbox
                </h3>
                <p className="text-xs text-muted-foreground font-mono">
                  {initMessage}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Boot Error State */}
        {workspace.status === 'error' && !workspace.schema.tables.length && (
          <div className="absolute inset-0 z-50 bg-background/95 flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-center justify-center text-destructive">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
            <div className="space-y-2 max-w-md">
              <h2 className="text-base font-semibold text-foreground">
                PostgreSQL Boot Error
              </h2>
              <p className="text-xs text-muted-foreground font-mono bg-muted/40 p-3 rounded border border-border/60 text-left">
                {workspace.errorMessage || 'Failed to initialize database.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateIndexDialog
        key={`create-index-dialog-${workspace.id}`}
        open={createIndexOpen}
        onOpenChange={setCreateIndexOpen}
      />
      <ConstraintsModal
        key={`constraints-modal-${workspace.id}`}
        open={constraintsOpen}
        onOpenChange={setConstraintsOpen}
      />
    </div>
  );
}
