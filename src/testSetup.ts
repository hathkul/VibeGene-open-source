// Tell React 19 that DOM-based tests use act() to flush updates. This enables
// React's real unwrapped-update warnings rather than hiding them.
if (typeof window !== 'undefined') {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
}
