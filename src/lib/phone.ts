// keeps digits only and brings russian numbers to one form, so "8 900…" and "+7 (900)…" end up as the same client
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("9")) digits = `7${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function formatPhone(digits: string): string {
  const m = digits.match(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : `+${digits}`;
}

export function whatsappLink(digits: string, text?: string): string {
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
