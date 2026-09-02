'use client';

import { useWorkspace } from '@/workspace/useWorkspace';
import { Badge } from '@/components/ui/badge';
import { Activity, Bot, User, Cpu, ChevronUp, ChevronDown } from 'lucide-react';

interface ActivityDrawerProps {
  expanded: boolean;
  onToggle: () => void;
}

export function ActivityDrawer({ expanded, onToggle }: ActivityDrawerProps) {
  const activity = useWorkspace((state) => state.activity);
  const latestEvent = activity[0];

  return (
    <div className="h-full bg-card select-none text-xs overflow-hidden">
      {/* Bottom Bar Header */}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="activity-log"
        onClick={onToggle}
        className="h-[38px] w-full px-3 flex items-center justify-between cursor-pointer hover:bg-accent/30 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-semibold text-[11px] text-foreground shrink-0">
            Live Activity
          </span>

          {latestEvent ? (
            <div className="flex items-center gap-2 truncate text-muted-foreground text-[11px]">
              <span className="w-1 h-1 rounded-full bg-border" />
              <span className="font-mono text-[10px] text-muted-foreground/70">
                {latestEvent.timestamp}
              </span>
              <Badge
                variant="outline"
                className={`text-[9px] py-0 px-1 font-mono uppercase font-bold shrink-0 ${
                  latestEvent.source === 'agent'
                    ? 'border-indigo-500/40 text-indigo-300'
                    : latestEvent.source === 'human'
                      ? 'border-sky-500/40 text-sky-300'
                      : 'border-border/60 text-muted-foreground'
                }`}
              >
                {latestEvent.source}
              </Badge>
              <span className="truncate text-foreground/90">
                {latestEvent.action}: {latestEvent.details}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground text-[11px]">
              No activity recorded yet
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-[10px] font-mono">
            {activity.length} events
          </span>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
        </div>
      </button>

      {/* Expanded Activity Drawer */}
      <div
        id="activity-log"
        className="h-[calc(100%-38px)] overflow-y-auto border-t border-border/60 p-2 space-y-1 bg-background/50 font-mono text-[11px]"
      >
        {activity.map((event) => (
          <div
            key={event.id}
            className="px-2.5 py-1.5 rounded hover:bg-accent/30 flex items-start gap-2 text-muted-foreground transition-colors"
          >
            <span className="text-[10px] text-muted-foreground/60 w-16 shrink-0 mt-0.5">
              {event.timestamp}
            </span>
            <div className="shrink-0 mt-0.5">
              {event.source === 'agent' ? (
                <Bot className="w-3 h-3 text-indigo-400" />
              ) : event.source === 'human' ? (
                <User className="w-3 h-3 text-sky-400" />
              ) : (
                <Cpu className="w-3 h-3 text-muted-foreground" />
              )}
            </div>
            <Badge
              variant="outline"
              className={`text-[9px] py-0 px-1 font-mono uppercase font-bold shrink-0 ${
                event.source === 'agent'
                  ? 'border-indigo-500/40 text-indigo-300'
                  : event.source === 'human'
                    ? 'border-sky-500/40 text-sky-300'
                    : 'border-border/60 text-muted-foreground'
              }`}
            >
              {event.source}
            </Badge>
            <div className="flex-1 truncate">
              <span className="font-semibold text-foreground">
                {event.action}
              </span>
              {event.details && (
                <span className="text-muted-foreground ml-1.5">
                  — {event.details}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
