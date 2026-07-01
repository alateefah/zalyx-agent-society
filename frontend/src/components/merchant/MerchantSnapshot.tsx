import { fmt } from "../../utils/format";
import type { ZalyxMerchantSnapshot } from "../../types";

interface Props {
  merchant: ZalyxMerchantSnapshot;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="snapshot-item">
      <span className="snapshot-label">{label}</span>
      <span className="snapshot-value">{value}</span>
    </div>
  );
}

export function MerchantSnapshot({ merchant }: Props) {
  return (
    <div className="snapshot-grid">
      <Row label="Merchant ID"           value={merchant.id} />
      <Row label="Business type"         value={merchant.businessType} />
      <Row label="Platform age"          value={`${merchant.ageInDays} days`} />
      <Row label="Total orders"          value={`${merchant.orders.total} (${merchant.orders.completed} completed)`} />
      <Row label="Uncollected receivables" value={fmt(merchant.receivables.uncollectedNaira)} />
      <Row label="Active days (30d)"     value={`${merchant.signals.period30d.activeDays}`} />
      {merchant.existingDecision && (
        <Row label="Zalyx score" value={`${merchant.existingDecision.score}/100 · Tier ${merchant.existingDecision.tier}`} />
      )}
      <Row label="Revenue months" value={`${merchant.monthlyRevenue.length}`} />
    </div>
  );
}
