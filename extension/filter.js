/**
 * DOM filtering: find matching text, pick the smallest useful content
 * boundary, and hide it with a CSS class. Nothing is ever rewritten or
 * deleted, so the page stays recoverable.
 */
(function (global) {
  'use strict';

  const HIDDEN_CLASS = 'word-filter-hidden';
  const PROCESSED_ATTRIBUTE = 'data-word-filter-processed';
  const BOUNDARY_SELECTOR = 'article, [role="article"], section, li, main';
  const SKIPPED_SELECTOR = 'script, style, noscript, template, title, textarea, option, head, svg, math';
  const MARKED_SELECTOR = '[' + PROCESSED_ATTRIBUTE + '], .' + HIDDEN_CLASS;
  const CLEAR_SELECTOR = '.' + HIDDEN_CLASS + ', ' + MARKED_SELECTOR;

  function isContentBoundary(element) {
    return element.matches(BOUNDARY_SELECTOR);
  }

  /**
   * Visibility check. Uses checkVisibility() where available (real browsers);
   * falls back to an ancestor walk for inline styles and the hidden
   * attribute (jsdom and older engines). Ancestors marked by this
   * extension are already excluded by the caller's closest() check.
   */
  function isVisible(element) {
    if (typeof element.checkVisibility === 'function') {
      return element.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true });
    }
    for (let node = element; node; node = node.parentElement) {
      if (node.hidden) return false;
      const style = node.style;
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.contentVisibility === 'hidden')) {
        return false;
      }
    }
    return true;
  }

  function acceptTextNode(node) {
    const element = node.parentElement;
    if (!element) return false;
    const text = node.nodeValue;
    if (!text || !text.trim()) return false;
    if (element.closest(SKIPPED_SELECTOR)) return false;
    if (element.closest(MARKED_SELECTOR)) return false;
    if (!isVisible(element)) return false;
    return true;
  }

  /**
   * Walk up from the matching text and return the deepest content boundary
   * (article / [role=article] / section / li / main). If none exists, fall
   * back to the immediate containing element - but never body or html.
   */
  function findHideTarget(textNode, doc) {
    const start = textNode.parentElement;
    if (!start) return null;
    for (let node = start; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
      if (isContentBoundary(node)) return node;
    }
    if (start === doc.body || start === doc.documentElement) return null;
    return start;
  }

  function hideElement(element) {
    if (element.classList.contains(HIDDEN_CLASS)) return false;
    element.classList.add(HIDDEN_CLASS);
    element.setAttribute(PROCESSED_ATTRIBUTE, '');
    return true;
  }

  /**
   * Scan a document or subtree for matching text. Returns the number of
   * elements hidden by this scan.
   */
  function scanRoot(root, matcher) {
    if (!root || typeof matcher !== 'function') return 0;
    const doc = root.nodeType === 9 ? root : root.ownerDocument;
    if (!doc) return 0;
    const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
      acceptNode: function (node) {
        if (!acceptTextNode(node)) return 2; // NodeFilter.FILTER_REJECT
        return matcher(node.nodeValue) ? 1 : 3; // FILTER_ACCEPT : FILTER_SKIP
      },
    });
    let hidden = 0;
    let node;
    while ((node = walker.nextNode())) {
      const target = findHideTarget(node, doc);
      if (target && hideElement(target)) hidden += 1;
    }
    return hidden;
  }

  /** Remove all filtering marks under (and including) root. */
  function clearAll(root) {
    if (!root || !root.querySelector) return 0;
    let cleared = 0;
    if (root.nodeType === 1 && root.matches && root.matches(CLEAR_SELECTOR)) {
      root.classList.remove(HIDDEN_CLASS);
      root.removeAttribute(PROCESSED_ATTRIBUTE);
      cleared += 1;
    }
    root.querySelectorAll(CLEAR_SELECTOR).forEach(function (element) {
      element.classList.remove(HIDDEN_CLASS);
      element.removeAttribute(PROCESSED_ATTRIBUTE);
      cleared += 1;
    });
    return cleared;
  }

  global.WordFilterDOM = {
    HIDDEN_CLASS: HIDDEN_CLASS,
    PROCESSED_ATTRIBUTE: PROCESSED_ATTRIBUTE,
    BOUNDARY_SELECTOR: BOUNDARY_SELECTOR,
    isVisible: isVisible,
    findHideTarget: findHideTarget,
    hideElement: hideElement,
    scanRoot: scanRoot,
    clearAll: clearAll,
  };
})(globalThis);
