// Pure formatting helpers for money, account labels, dates, relative time.

function symbol(currency: string | null): string {
  switch (currency) {
    case null:
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    default:
      return `${currency} `;
  }
}

function withThousands(abs: number): string {
  return abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Account balance: no leading "+"; negative balances show "-$1,843.55".
export function formatBalance(
  value: number | null,
  currency: string | null,
): string {
  if (value == null) return "—";
  const sign = value < 0 ? "-" : "";
  return `${sign}${symbol(currency)}${withThousands(Math.abs(value))}`;
}

// Transaction amount: signed. Negative = spend ("-$5.40"), positive = income ("+$2,450.00").
export function formatAmount(value: number, currency: string | null): string {
  const sign = value < 0 ? "-" : "+";
  return `${sign}${symbol(currency)}${withThousands(Math.abs(value))}`;
}

export function accountLabel(name: string, mask: string | null): string {
  return mask ? `${name} ····${mask}` : name;
}

export function relativeTime(epochMs: number | null): string {
  if (!epochMs) return "";
  const s = Math.max(0, Math.floor((Date.now() - epochMs) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
