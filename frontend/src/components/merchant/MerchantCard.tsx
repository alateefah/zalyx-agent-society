import { Briefcase } from "lucide-react";
import { RISK_MAP, DEFAULT_RISK } from "../../utils/constants";
import type { ZalyxMerchantSnapshot } from "../../types";

interface Props {
  merchant: ZalyxMerchantSnapshot;
  selected: boolean;
  onSelect: (merchant: ZalyxMerchantSnapshot) => void;
}

export function MerchantCard({ merchant, selected, onSelect }: Props) {
  const meta = RISK_MAP[merchant.businessType] ?? DEFAULT_RISK;
  const CardIcon = meta.Icon ?? Briefcase;

  return (
    <div
      className={`demo-card${selected ? " selected" : ""}`}
      onClick={() => onSelect(merchant)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(merchant)}
    >
      <div className="demo-card-header">
        <div className="demo-icon"><CardIcon size={14} /></div>
        <div>
          <div className="demo-card-id">{merchant.id}</div>
          <div className="demo-card-type">{merchant.businessType}</div>
        </div>
      </div>
      <span className={`badge ${meta.variant}`}>{meta.riskLabel}</span>
    </div>
  );
}
