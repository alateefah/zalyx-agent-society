export const fmt = (n: number): string =>
  `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

export const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

export const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
