/**
 * GST state-code → state-name lookup. Used by invoice rendering and any
 * place-of-supply UI that wants to show "Punjab" rather than the bare "03".
 *
 * Source: India GST council, 36 states + UTs.
 */
const GST_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman & Diu',
  '26': 'Dadra & Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

/** Returns "Punjab (03)" — code padded to 2 digits, name appended when known. */
export function stateNameForCode(code: string | null | undefined): string {
  if (!code) return '—';
  const padded = String(code).padStart(2, '0');
  const name = GST_STATES[padded];
  return name ? `${name} (${padded})` : padded;
}

export function bareStateName(code: string | null | undefined): string | null {
  if (!code) return null;
  const padded = String(code).padStart(2, '0');
  return GST_STATES[padded] ?? null;
}
