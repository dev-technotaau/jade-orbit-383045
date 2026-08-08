/**
 * Convert paise (integer) to Indian-rupee words (e.g. "Rupees Nine Hundred
 * Ninety Nine Only"). Used on GST invoices — Section 31 of CGST Act.
 *
 * Pure function, no deps.
 */
const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t] : `${TENS[t]} ${ONES[o]}`;
}

function threeDigits(n: number): string {
  if (n < 100) return twoDigits(n);
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return rest === 0 ? `${ONES[h]} Hundred` : `${ONES[h]} Hundred ${twoDigits(rest)}`;
}

export function rupeesToWords(rupeesInteger: number): string {
  if (rupeesInteger === 0) return 'Zero';
  if (rupeesInteger < 0) return `Negative ${rupeesToWords(Math.abs(rupeesInteger))}`;

  const parts: string[] = [];
  // Indian numbering: crore (10^7), lakh (10^5), thousand (10^3), hundred
  const crore = Math.floor(rupeesInteger / 10_000_000);
  rupeesInteger %= 10_000_000;
  const lakh = Math.floor(rupeesInteger / 100_000);
  rupeesInteger %= 100_000;
  const thousand = Math.floor(rupeesInteger / 1000);
  rupeesInteger %= 1000;
  const hundred = rupeesInteger;

  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function paiseToWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const subPaise = paise % 100;
  const rupeeWords = rupeesToWords(rupees);
  if (subPaise === 0) return `Rupees ${rupeeWords} Only`;
  return `Rupees ${rupeeWords} and ${twoDigits(subPaise)} Paise Only`;
}
