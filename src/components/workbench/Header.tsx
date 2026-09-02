'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkspace } from '@/workspace/useWorkspace';
import { WorkspaceCommands } from '@/workspace/commands';
import { WorkspaceManager } from '@/workspace/manager';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  RotateCcw,
  SlidersHorizontal,
  Bot,
  AlertTriangle,
  Loader2,
  ClipboardCopy,
  ShieldCheck,
  ShieldQuestion,
} from 'lucide-react';

interface HeaderProps {
  onOpenConstraints: () => void;
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.866-.014-1.7-2.782.605-3.369-1.343-3.369-1.343-.455-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.071 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.091-.647.349-1.088.635-1.338-2.221-.253-4.555-1.112-4.555-4.947 0-1.092.39-1.986 1.03-2.686-.103-.253-.446-1.27.098-2.647 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.026 2.747-1.026.546 1.377.203 2.394.1 2.647.64.7 1.028 1.594 1.028 2.686 0 3.844-2.337 4.69-4.566 4.938.359.31.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.523 2 12 2Z" />
    </svg>
  );
}

export function Header({ onOpenConstraints }: HeaderProps) {
  const workspace = useWorkspace(
    useShallow((state) => ({
      catalogRevision: state.catalogRevision,
      constraints: state.constraints,
      id: state.id,
      name: state.name,
      registeredToolsCount: state.registeredToolsCount,
      revision: state.revision,
      status: state.status,
      webMcpAvailable: state.webMcpAvailable,
      agentWorkspaceAdminEnabled: state.agentWorkspaceAdminEnabled,
      hasWorkspace: state.workspaces.length > 0,
    })),
  );
  const [resetOpen, setResetOpen] = useState(false);
  const [webMcpHelpOpen, setWebMcpHelpOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fullAccessOpen, setFullAccessOpen] = useState(false);

  const copyMission = async () => {
    const mission = `Optimize the active TuneQL workspace "${workspace.name}" (${workspace.id}). Start by reading the workspace and constraints. Current workspace revision: ${workspace.revision}; catalog revision: ${workspace.catalogRevision}. Target runtime: ${workspace.constraints.targetRuntimeMs ?? 'none'} ms. Preserve result equivalence and stay within the allowed index/query constraints. Re-read workspace state after human changes.`;
    await navigator.clipboard.writeText(mission);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <header className="h-12 border-b border-border/80 bg-card px-4 flex items-center justify-between select-none">
      {/* Left: Brand & Workspace */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Image
            src="/icon-192.png"
            alt=""
            width={32}
            height={32}
            priority
            unoptimized
            className="size-8 rounded-lg shadow-xs"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-sm tracking-tight text-foreground">
                TuneQL
              </h1>
              <Badge
                variant="outline"
                className="text-[10px] py-0 px-1.5 font-mono text-muted-foreground border-border/60"
              >
                v1.0
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-none">
              PostgreSQL Optimization Workbench
            </p>
          </div>
        </div>
      </div>

      {/* Center: System Status */}
      <div className="hidden md:flex items-center gap-3">
        {/* DB Engine Status */}
        {!workspace.hasWorkspace ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 border border-border/60 text-[11px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
            <span>No workspace</span>
          </div>
        ) : workspace.status === 'initializing' ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
            <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none text-amber-400" />
            <span>PostgreSQL WASM Loading…</span>
          </div>
        ) : workspace.status === 'error' ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-[11px] text-destructive">
            <AlertTriangle className="w-3 h-3 text-destructive" />
            <span>Database Error</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>PGlite Ready</span>
          </div>
        )}

        {/* WebMCP Status */}
        {workspace.webMcpAvailable ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-[11px] text-indigo-300">
            <Bot className="w-3 h-3 text-indigo-400" />
            <span className="font-semibold text-indigo-200">WebMCP Active</span>
            <span className="text-[10px] opacity-75">
              ({workspace.registeredToolsCount} tools)
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setWebMcpHelpOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/80 border border-border/60 text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
            <span>Human-only mode</span>
          </button>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {workspace.hasWorkspace && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void copyMission()}
            className="h-8 text-xs gap-1.5"
            aria-label="Copy agent mission"
            title="Copy a mission prompt for a WebMCP agent"
          >
            <ClipboardCopy className="size-3.5" />
            <span className="hidden xl:inline">
              {copied ? 'Copied' : 'Copy Agent Mission'}
            </span>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            workspace.agentWorkspaceAdminEnabled
              ? void WorkspaceManager.setAgentAdministration(false)
              : setFullAccessOpen(true)
          }
          className={`h-8 text-xs gap-1.5 ${workspace.agentWorkspaceAdminEnabled ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15' : 'border-border/80 bg-background/50 text-muted-foreground hover:text-foreground'}`}
          title="Control whether WebMCP agents can administer workspaces"
        >
          {workspace.agentWorkspaceAdminEnabled ? (
            <ShieldCheck className="size-3.5" />
          ) : (
            <ShieldQuestion className="size-3.5" />
          )}
          <span>
            {workspace.agentWorkspaceAdminEnabled
              ? 'Full Access'
              : 'Ask Approval'}
          </span>
        </Button>
        {workspace.hasWorkspace && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenConstraints}
            className="h-8 text-xs font-medium gap-1.5 bg-background/50 hover:bg-accent border-border/80 text-foreground"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Constraints</span>
            {workspace.constraints.maxNewIndexes > 0 && (
              <Badge
                variant="secondary"
                className="px-1 py-0 text-[10px] ml-0.5"
              >
                ≤{workspace.constraints.maxNewIndexes} idx
              </Badge>
            )}
          </Button>
        )}

        {workspace.hasWorkspace && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setResetOpen(true)}
            disabled={workspace.status === 'initializing'}
            className="h-8 text-xs font-medium gap-1.5 bg-background/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 border-border/80"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </Button>
        )}

        <a
          href="https://github.com/jaipaljadeja/TuneQL"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open TuneQL on GitHub"
          title="GitHub repository"
        >
          <GitHubIcon className="size-4" />
        </a>
      </div>
      <ConfirmActionDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={`Reset ${workspace.name}?`}
        description="This recreates the original local database and clears baselines, attempts, and candidate indexes."
        confirmLabel="Reset Workspace"
        destructive
        onConfirm={() => WorkspaceCommands.resetWorkspace()}
      />
      <Dialog open={webMcpHelpOpen} onOpenChange={setWebMcpHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect a WebMCP agent</DialogTitle>
            <DialogDescription>
              Open TuneQL in ChatGPT’s in-app browser or a Chrome build with
              WebMCP enabled. Once the browser exposes{' '}
              <code className="font-mono">document.modelContext</code>, TuneQL
              registers its domain tools automatically. No database data is sent
              to a TuneQL backend.
            </DialogDescription>
          </DialogHeader>
          <a
            className="text-xs text-sky-400 underline"
            href="https://learn.chatgpt.com/docs/webmcp"
            target="_blank"
            rel="noreferrer"
          >
            ChatGPT WebMCP setup guide
          </a>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        open={fullAccessOpen}
        onOpenChange={setFullAccessOpen}
        title="Give agents full workspace access?"
        description="Agents will be able to create, switch, rename, and delete local workspaces. They still cannot change this permission, upload files, or bypass workspace constraints. You can return to Ask Approval at any time."
        confirmLabel="Enable Full Access"
        onConfirm={() => WorkspaceManager.setAgentAdministration(true)}
      />
    </header>
  );
}
