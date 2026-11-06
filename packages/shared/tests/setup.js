import { vi } from 'vitest';
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  })),
});
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
const computedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element) => computedStyle(element);
HTMLElement.prototype.scrollIntoView = function () {};
URL.createObjectURL = vi.fn(() => 'blob:jcc-test');
URL.revokeObjectURL = vi.fn();
