export type ParsedRow = Record<string, string>;

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ",") {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  "full name": "name",
  fullname: "name",
  "full_name": "name",
  "first name": "name",
  lead: "name",
  phone: "phone",
  "phone number": "phone",
  phone_number: "phone",
  mobile: "phone",
  cell: "phone",
  email: "email",
  "email address": "email",
  interest: "interest",
  program: "interest",
  "what are you interested in": "interest",
  notes: "notes",
  note: "notes",
  campaign: "campaign",
  "ad campaign": "campaign",
  form: "formName",
  "form name": "formName",
  submitted: "submittedAt",
  "submitted at": "submittedAt",
  date: "submittedAt",
  created: "submittedAt",
  created_time: "submittedAt",
  child: "childName",
  "child name": "childName",
  age: "age",
};

/**
 * Parses a pasted CSV (Facebook Ads export, spreadsheet, or hand-typed list) into normalized rows.
 * Recognized headers are mapped to lead fields; anything else is kept as an intake answer.
 */
export function parseLeadCsv(text: string): { rows: ParsedRow[]; extras: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { rows: [], extras: [] };

  const rawHeaders = splitCsvLine(lines[0]);
  const headerLooksLikeData = rawHeaders.every((h) => !HEADER_ALIASES[h.toLowerCase()]);
  const headers = headerLooksLikeData
    ? ["name", "phone", "email", "interest"].slice(0, rawHeaders.length)
    : rawHeaders.map((h) => HEADER_ALIASES[h.toLowerCase()] ?? h);
  const extras = headers.filter((h) => !Object.values(HEADER_ALIASES).includes(h));

  const dataLines = headerLooksLikeData ? lines : lines.slice(1);
  const rows = dataLines.map((line) => {
    const cells = splitCsvLine(line);
    const row: ParsedRow = {};
    headers.forEach((header, index) => {
      const value = cells[index] ?? "";
      if (value) row[header] = value;
    });
    return row;
  });

  return { rows: rows.filter((r) => Object.keys(r).length > 0), extras };
}

export function ageGroupFromRow(row: ParsedRow): { ageGroup: string; childName: string | null } {
  const childName = row.childName ?? null;
  const text = `${row.interest ?? ""} ${row.notes ?? ""} ${row.formName ?? ""}`.toLowerCase();
  const age = Number(row.age);
  if (childName) return { ageGroup: "KID", childName };
  if (Number.isFinite(age) && age > 0 && age < 16) return { ageGroup: "KID", childName: null };
  if (/\b(kid|child|son|daughter|youth|teen)\b/.test(text)) return { ageGroup: "KID", childName: null };
  if (/\b(adult|myself|me)\b/.test(text)) return { ageGroup: "ADULT", childName: null };
  return { ageGroup: "UNKNOWN", childName: null };
}

export function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
