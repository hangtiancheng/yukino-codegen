import { Bot, ListTodo, Users, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { Badge } from "@/shared/ui";
import type { AgentActivity } from "../use-agent-transcript";

export type ActivityPanelProps = {
  readonly activity: AgentActivity;
  readonly onClose: () => void;
};

const statusVariant = (
  status: string,
): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "running") return "default";
  if (status === "completed") return "secondary";
  if (status === "failed") return "destructive";
  return "outline";
};

/**
 * Remote parity Agents panel: live subagent/fork activity, background tasks,
 * and in-process teammates fed by the server activity bridge.
 */
export function ActivityPanel({
  activity,
  onClose,
}: ActivityPanelProps): ReactNode {
  const empty =
    activity.subagents.length === 0 &&
    activity.tasks.length === 0 &&
    activity.teammates.length === 0;
  return (
    <div className="border-border/80 bg-card shadow-soft flex min-h-0 flex-col rounded-xl border">
      <div className="border-border/70 flex items-center gap-2 border-b px-3 py-2">
        <span className="text-sm font-semibold">Agents activity</span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground ml-auto"
          aria-label="Close activity panel"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        {empty ? (
          <p className="text-muted-foreground py-6 text-center text-xs">
            No subagents, background tasks, or teammates are active.
          </p>
        ) : null}

        {activity.subagents.length > 0 ? (
          <section className="space-y-1.5">
            <h3 className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold uppercase">
              <Bot className="size-3.5" aria-hidden="true" /> Subagents
            </h3>
            {activity.subagents.map((agent) => (
              <div
                key={agent.toolCallId}
                className="border-border/60 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1 truncate font-mono">
                  {agent.role}
                  {agent.background ? " · background" : ""}
                </span>
                {agent.activeTools.length > 0 ? (
                  <span className="text-muted-foreground truncate">
                    {agent.activeTools.map((tool) => tool.toolName).join(", ")}
                  </span>
                ) : null}
                <Badge variant={statusVariant(agent.status)}>
                  {agent.status}
                </Badge>
              </div>
            ))}
          </section>
        ) : null}

        {activity.tasks.length > 0 ? (
          <section className="space-y-1.5">
            <h3 className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold uppercase">
              <ListTodo className="size-3.5" aria-hidden="true" /> Background
              tasks
            </h3>
            {activity.tasks.map((task) => (
              <div
                key={task.id}
                className="border-border/60 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1 truncate">
                  {task.name}
                  <span className="text-muted-foreground"> · {task.kind}</span>
                </span>
                <Badge variant={statusVariant(task.status)}>
                  {task.status}
                </Badge>
              </div>
            ))}
          </section>
        ) : null}

        {activity.teammates.length > 0 ? (
          <section className="space-y-1.5">
            <h3 className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold uppercase">
              <Users className="size-3.5" aria-hidden="true" /> Teammates
            </h3>
            {activity.teammates.map((member) => (
              <div
                key={`${member.teamName}:${member.name}`}
                className="border-border/60 rounded-lg border px-2.5 py-1.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {member.name}
                    <span className="text-muted-foreground">
                      {" "}
                      · {member.teamName}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-muted-foreground",
                      member.status === "running" &&
                        "text-foreground animate-pulse",
                    )}
                  >
                    {member.spinnerVerb}
                  </span>
                  <Badge variant={statusVariant(member.status)}>
                    {member.status}
                  </Badge>
                </div>
                {member.lastMessage !== null &&
                member.lastMessage.length > 0 ? (
                  <p className="text-muted-foreground mt-1 truncate">
                    {member.lastMessage}
                  </p>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
