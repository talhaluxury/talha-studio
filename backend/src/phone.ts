/** Digits only with country code (Pakistan default): 0300 1234567, 300-1234567 and +92 300 1234567 are the same number. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[^0-9]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "92" + d.slice(1);
  else if (d.length === 10 && d.startsWith("3")) d = "92" + d;
  return d.length >= 10 && d.length <= 15 ? d : null;
}
/** Phone accounts have no real email, so a reserved never-deliverable address (.invalid) is generated from the number. */
export const phoneEmail = (digits: string) => `p${digits}@phone.talha.invalid`;
