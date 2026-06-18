import "@testing-library/jest-dom";

// jsdom doesn't implement matchMedia; stub it (default: no match) so components
// using useIsNarrow / responsive hooks render in tests.
if (typeof window !== "undefined" && !window.matchMedia) {
  const noop = () => undefined;
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: noop,
      removeEventListener: noop,
      addListener: noop,
      removeListener: noop,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// jsdom doesn't implement <dialog>'s showModal()/close(); polyfill just enough
// for component tests (toggling `open` + firing `close`). Guarded so a future
// jsdom that ships native support isn't overridden.
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    };
  }
}
