/**
 * RFC 4180 CSV field escaping.
 * Quotes fields that contain commas, double quotes, or line breaks.
 * Doubles embedded double quotes.
 */
export function escapeCsv(value) {
  const str = value == null ? '' : String(value);
  if (str.indexOf(',') >= 0 || str.indexOf('"') >= 0 || str.indexOf('\n') >= 0 || str.indexOf('\r') >= 0 || str.indexOf('\t') >= 0) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
