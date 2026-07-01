import { useState } from "react";
import { ChevronDown, UserCheck } from "lucide-react";
import { AGENT_META, MSG_TYPE_STYLE } from "../../utils/constants";
import type { AgentDebateMessage } from "../../types";

interface Props {
  msg: AgentDebateMessage;
  index: number;
}

export function AgentCard({ msg, index }: Props) {
  const [open, setOpen] = useState(false);
  const meta = AGENT_META[msg.agentName] ?? { color: "#64748b", Icon: UserCheck };
  const typeMeta = msg.messageType ? MSG_TYPE_STYLE[msg.messageType] : null;
  const { Icon } = meta;

  return (
    <div className="agent-card" style={{ borderLeftColor: meta.color }}>
      <div className="agent-card-header" onClick={() => setOpen(!open)}>
        <div className="agent-card-left">
          <div className="agent-num" style={{ background: meta.color }}>{index + 1}</div>
          <div className="agent-icon-wrap"><Icon size={14} /></div>
          <div className="agent-card-info">
            <div className="agent-card-name">
              {msg.agentName}
              {typeMeta && (
                <span
                  className="msg-type-tag"
                  style={{ background: typeMeta.bg, color: typeMeta.color }}
                >
                  {typeMeta.label}
                </span>
              )}
            </div>
            <div className="agent-card-role">{msg.agentRole}</div>
          </div>
        </div>
        <div className="agent-card-right">
          {msg.confidence !== undefined && (
            <span className="confidence-tag" style={{ color: meta.color }}>
              {msg.confidence.toFixed(0)}%
            </span>
          )}
          {msg.recommendation && (
            <span className="rec-tag">{msg.recommendation}</span>
          )}
          <ChevronDown
            size={14}
            className={`chevron${open ? " open" : ""}`}
          />
        </div>
      </div>
      {open && (
        <div className="agent-card-body">
          <p className="agent-card-message">{msg.message}</p>
          <div className="agent-card-ts">
            {new Date(msg.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
}
