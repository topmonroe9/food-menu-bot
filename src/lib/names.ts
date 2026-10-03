// dative ("кому") of a russian first name, good enough for a default: the admin can always type the right form
const IRREGULAR: Record<string, string> = { павел: "Павлу", лев: "Льву", пётр: "Петру", петр: "Петру", любовь: "Любови" };

export function toDative(name: string): string {
  if (/\s/.test(name)) return name;
  const lower = name.toLowerCase();
  if (IRREGULAR[lower]) return IRREGULAR[lower];
  const stem = name.slice(0, -1);
  if (lower.endsWith("ия")) return `${stem}и`;
  if (/[ая]$/.test(lower)) return `${stem}е`;
  if (/[йь]$/.test(lower)) return `${stem}ю`;
  if (/[бвгджзклмнпрстфхцчшщ]$/.test(lower)) return `${name}у`;
  return name;
}
