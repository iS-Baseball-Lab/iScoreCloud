// filepath: src/__tests__/modal-scroll-lock.test.ts
import { describe, expect, it } from "vitest";
import {
  canScrollAlongAxis,
  decideModalScrollAllowance,
  isScrollableOverflowValue,
  type ScrollAxisMetrics,
} from "@/lib/liff/modal-scroll-lock";

const NON_SCROLLABLE_AXIS: ScrollAxisMetrics = {
  scrollOffset: 0,
  clientSize: 320,
  scrollSize: 320,
  isOverflowScrollable: false,
};

describe("modal-scroll-lock core scroll boundary & touch guard logic", () => {
  it("identifies scrollable CSS overflow values accurately", () => {
    expect(isScrollableOverflowValue("auto")).toBe(true);
    expect(isScrollableOverflowValue("scroll")).toBe(true);
    expect(isScrollableOverflowValue("overlay")).toBe(true);
    expect(isScrollableOverflowValue("hidden")).toBe(false);
    expect(isScrollableOverflowValue("clip")).toBe(false);
    expect(isScrollableOverflowValue("visible")).toBe(false);
  });

  it("evaluates scrollability and top/bottom boundary saturation with subpixel tolerance", () => {
    // At top (scrollTop = 0, clientHeight = 400, scrollHeight = 1000)
    const atTop: ScrollAxisMetrics = {
      scrollOffset: 0,
      clientSize: 400,
      scrollSize: 1000,
      isOverflowScrollable: true,
    };
    expect(canScrollAlongAxis(atTop, 16)).toBe(true); // scrolling down allowed
    expect(canScrollAlongAxis(atTop, -16)).toBe(false); // pulling past top blocked

    // In middle (scrollTop = 250)
    const inMiddle: ScrollAxisMetrics = {
      scrollOffset: 250,
      clientSize: 400,
      scrollSize: 1000,
      isOverflowScrollable: true,
    };
    expect(canScrollAlongAxis(inMiddle, 16)).toBe(true);
    expect(canScrollAlongAxis(inMiddle, -16)).toBe(true);

    // At bottom including fractional DPR subpixel gap (scrollTop = 599.33, clientHeight = 400, scrollHeight = 1000)
    const atBottomSubpixel: ScrollAxisMetrics = {
      scrollOffset: 599.33,
      clientSize: 400,
      scrollSize: 1000,
      isOverflowScrollable: true,
    };
    expect(canScrollAlongAxis(atBottomSubpixel, 16)).toBe(false); // pushing past bottom blocked
    expect(canScrollAlongAxis(atBottomSubpixel, -16)).toBe(true); // reversing back up allowed immediately

    // Container has overflow-y: auto, but content fits without overflowing (WebKit Bug 243462 case)
    const shortModalBody: ScrollAxisMetrics = {
      scrollOffset: 0,
      clientSize: 400,
      scrollSize: 400,
      isOverflowScrollable: true,
    };
    expect(canScrollAlongAxis(shortModalBody, 16)).toBe(false);
    expect(canScrollAlongAxis(shortModalBody, -16)).toBe(false);
  });

  it("blocks touch/wheel outside the topmost modal or on non-scrollable backdrop/header/footer/short modals", () => {
    // Touch outside topmost modal (e.g., background or underlying stacked modal)
    expect(
      decideModalScrollAllowance({
        isInsideTopModal: false,
        isNativeDragControl: false,
        scrollDeltaX: 0,
        scrollDeltaY: 24,
        scrollableAncestors: [
          {
            x: NON_SCROLLABLE_AXIS,
            y: {
              scrollOffset: 100,
              clientSize: 400,
              scrollSize: 1200,
              isOverflowScrollable: true,
            },
          },
        ],
      })
    ).toBe(false);

    // Touch on modal backdrop, A-3 header cap, or footer (no scrollable ancestors)
    expect(
      decideModalScrollAllowance({
        isInsideTopModal: true,
        isNativeDragControl: false,
        scrollDeltaX: 0,
        scrollDeltaY: 18,
        scrollableAncestors: [],
      })
    ).toBe(false);

    // Touch inside a short modal whose overflow-y-auto body fits completely without scrolling
    expect(
      decideModalScrollAllowance({
        isInsideTopModal: true,
        isNativeDragControl: false,
        scrollDeltaX: 0,
        scrollDeltaY: 18,
        scrollableAncestors: [
          {
            x: NON_SCROLLABLE_AXIS,
            y: {
              scrollOffset: 0,
              clientSize: 360,
              scrollSize: 280,
              isOverflowScrollable: true,
            },
          },
        ],
      })
    ).toBe(false);
  });

  it("allows smooth scrolling inside modal body and chains from nested textarea to modal body without leaking to background", () => {
    const atBottomTextarea: ScrollAxisMetrics = {
      scrollOffset: 80,
      clientSize: 100,
      scrollSize: 180,
      isOverflowScrollable: true,
    };
    const scrollableModalBody: ScrollAxisMetrics = {
      scrollOffset: 120,
      clientSize: 420,
      scrollSize: 960,
      isOverflowScrollable: true,
    };
    const atBottomModalBody: ScrollAxisMetrics = {
      scrollOffset: 540,
      clientSize: 420,
      scrollSize: 960,
      isOverflowScrollable: true,
    };

    // Inner textarea is at bottom, but parent modal body still has scroll room -> allowed!
    expect(
      decideModalScrollAllowance({
        isInsideTopModal: true,
        isNativeDragControl: false,
        scrollDeltaX: 0,
        scrollDeltaY: 20,
        scrollableAncestors: [
          { x: NON_SCROLLABLE_AXIS, y: atBottomTextarea },
          { x: NON_SCROLLABLE_AXIS, y: scrollableModalBody },
        ],
      })
    ).toBe(true);

    // Both inner textarea AND parent modal body are at bottom -> blocked from leaking to background page!
    expect(
      decideModalScrollAllowance({
        isInsideTopModal: true,
        isNativeDragControl: false,
        scrollDeltaX: 0,
        scrollDeltaY: 20,
        scrollableAncestors: [
          { x: NON_SCROLLABLE_AXIS, y: atBottomTextarea },
          { x: NON_SCROLLABLE_AXIS, y: atBottomModalBody },
        ],
      })
    ).toBe(false);
  });

  it("permits range sliders, horizontal scroll containers, and tiny initial thumb-roll jitter without leaking", () => {
    // Native range slider (e.g. photo cropper zoom slider)
    expect(
      decideModalScrollAllowance({
        isInsideTopModal: true,
        isNativeDragControl: true,
        scrollDeltaX: 15,
        scrollDeltaY: 2,
        scrollableAncestors: [],
      })
    ).toBe(true);

    // Initial 2px sideways thumb roll while starting a downward scroll inside a vertical modal
    expect(
      decideModalScrollAllowance({
        isInsideTopModal: true,
        isNativeDragControl: false,
        scrollDeltaX: 3,
        scrollDeltaY: 2,
        totalDx: -3,
        totalDy: -2,
        scrollableAncestors: [
          {
            x: NON_SCROLLABLE_AXIS,
            y: {
              scrollOffset: 0,
              clientSize: 400,
              scrollSize: 900,
              isOverflowScrollable: true,
            },
          },
        ],
      })
    ).toBe(true);

    // Intentional wide horizontal swipe inside a vertical-only modal -> blocked from scrolling background
    expect(
      decideModalScrollAllowance({
        isInsideTopModal: true,
        isNativeDragControl: false,
        scrollDeltaX: 28,
        scrollDeltaY: 3,
        totalDx: -28,
        totalDy: -3,
        scrollableAncestors: [
          {
            x: NON_SCROLLABLE_AXIS,
            y: {
              scrollOffset: 100,
              clientSize: 400,
              scrollSize: 900,
              isOverflowScrollable: true,
            },
          },
        ],
      })
    ).toBe(false);

    // Horizontal chip bar / 2D scorebook viewer with horizontal scroll room -> allowed!
    expect(
      decideModalScrollAllowance({
        isInsideTopModal: true,
        isNativeDragControl: false,
        scrollDeltaX: 28,
        scrollDeltaY: 3,
        totalDx: -28,
        totalDy: -3,
        scrollableAncestors: [
          {
            x: {
              scrollOffset: 40,
              clientSize: 320,
              scrollSize: 980,
              isOverflowScrollable: true,
            },
            y: NON_SCROLLABLE_AXIS,
          },
        ],
      })
    ).toBe(true);
  });
});
