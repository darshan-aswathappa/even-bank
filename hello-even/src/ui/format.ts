// Pure formatting helpers for money, account labels, and dates.

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

export function formatFrequency(freq: string): string {
  switch (freq) {
    case "WEEKLY": return "/wk";
    case "BIWEEKLY": return "/2wk";
    case "SEMI_MONTHLY": return "/2×mo";
    case "MONTHLY": return "/mo";
    case "ANNUALLY": return "/yr";
    default: return "";
  }
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
