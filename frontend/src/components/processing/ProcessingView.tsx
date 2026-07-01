import { Swords } from "lucide-react";
import { AgentCard } from "../report/AgentCard";
import type { AgentDebateMessage } from "../../types";

interface Props {
  merchantId: string;
  label: string;
  isMock: boolean | null;
  liveMessages: AgentDebateMessage[];
}

export function ProcessingView({ merchantId, label, isMock, liveMessages }: Props) {
  return (
    <div className="processing-container">
      <div className="processing-header">
        <div className="spinner" />
        <div className="processing-info">
          <div className="processing-title">Agents running</div>
          <div className="processing-merchant">{merchantId}</div>
          <div className="processing-current">
            {label}
            {isMock && " · mock mode"}
          </div>
        </div>
      </div>

      {liveMessages.length > 0 && (
        <>
          <div className="live-transcript-label">Live transcript</div>
          <div className="debate-list">
            {liveMessages.map((msg, i) => {
              const isRound2Start =
                msg.round === 2 && (i === 0 || (liveMessages[i - 1].round ?? 1) < 2);
              return (
                <div key={i}>
                  {isRound2Start && (
                    <div className="round-divider">
                      <Swords size={12} /> Debate Round 2
                    </div>
                  )}
                  <AgentCard msg={msg} index={i} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
