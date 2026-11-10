/**
 * Session IDs are 32 char hashes. Table cells show a short prefix; the
 * full id stays in the title tooltip and the copy action.
 */
export function shortSessionId (id, keep = 8) {
  if (id == null) {
    return ''
  }
  const str = String(id)
  if (str.length <= keep) {
    return str
  }
  return str.slice(0, keep) + '…'
}
