// CSV export for trends, reports and alarm logs. UTF-8 with BOM so Excel shows Thai text correctly.

type Cell = string | number | null | undefined;

function escape(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  const s = String(cell);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Cell[][]): string {
  return rows.map((r) => r.map(escape).join(",")).join("\r\n");
}

/** Local "YYYY-MM-DD HH:mm", which Excel reads as a date-time. */
export function csvTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function downloadCsv(filename: string, rows: Cell[][]) {
  const blob = new Blob(["\uFEFF", toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Value for <input type="datetime-local"> in the viewer's time zone. */
export function toLocalInput(t: number): string {
  return csvTime(t).replace(" ", "T");
}

export function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}
