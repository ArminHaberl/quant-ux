/**
 * Mongo DB does not allow field names that contain dots or start with '$'.
 * Survey answers (e.g. RadioTable row names) can contain such characters,
 * so object keys in event state values have to be sanitized before they
 * are stored. All consumers of the stored values must use the same
 * sanitization to look keys up again.
 */
export function sanitizeObjectKey (key) {
	return String(key).replace(/\./g, '_').replace(/^\$/, '_')
}

export function sanitizeStateValue (value) {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const result = {}
		Object.keys(value).forEach(key => {
			result[sanitizeObjectKey(key)] = value[key]
		})
		return result
	}
	return value
}
