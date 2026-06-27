import type { ZalyxMerchantSnapshot } from "../../types";

interface Props {
  value: string;
  error: string;
  onChange: (val: string, parsed: ZalyxMerchantSnapshot | null) => void;
}

export function CustomJsonInput({ value, error, onChange }: Props) {
  const handleChange = (raw: string) => {
    try {
      const parsed: ZalyxMerchantSnapshot = JSON.parse(raw);
      onChange(raw, parsed);
    } catch {
      onChange(raw, null);
    }
  };

  return (
    <div>
      <textarea
        className={`json-input${error ? " error" : ""}`}
        rows={10}
        placeholder='{ "id": "MERCHANT-001", "businessName": "...", ... }'
        value={value}
        onChange={(e) => handleChange(e.target.value)}
      />
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
