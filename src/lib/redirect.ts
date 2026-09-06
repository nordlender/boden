// A leading "//" (or "/\") is still relative enough to pass a bare
// startsWith('/') check, but browsers resolve it as protocol-relative —
// `//evil.com` becomes `https://evil.com`. Reject those too so this can't be
// used as an open redirect from a state-changing POST handler.
export function isSafeRedirectTarget(value: FormDataEntryValue | null): value is string {
	return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\');
}
