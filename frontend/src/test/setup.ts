import '@testing-library/jest-dom/vitest';

// jsdom implements neither of these, and both are used by code under test:
// AnimatedScore reads prefers-reduced-motion, and the count-up runs on rAF.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
