/**
 * JavaScript evaluation and DOM inspection.
 */

import type { EvaluateResult } from './types';
import { attachedTabs } from './state';
import { attachToTab } from './attach';

/**
 * Evaluate JavaScript in the page context.
 */
export async function evaluateJS(
  tabId: number,
  expression: string
): Promise<EvaluateResult> {
  if (!attachedTabs.has(tabId)) {
    await attachToTab(tabId);
  }

  try {
    const result = (await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression,
      returnByValue: true,
      generatePreview: true,
      userGesture: true,
    })) as {
      result: { type: string; value?: any; description?: string };
      exceptionDetails?: { exception: { description: string } };
    };

    if (result.exceptionDetails) {
      return {
        type: 'error',
        error: result.exceptionDetails.exception?.description || 'Unknown error',
      };
    }

    return {
      value: result.result.value,
      type: result.result.type,
      description: result.result.description,
    };
  } catch (err) {
    return {
      type: 'error',
      error: err instanceof Error ? err.message : 'Evaluation failed',
    };
  }
}

/**
 * Get the DOM as HTML.
 */
export async function getDOMSnapshot(tabId: number, selector?: string): Promise<string> {
  if (!attachedTabs.has(tabId)) {
    await attachToTab(tabId);
  }

  try {
    // Get the document root
    const doc = (await chrome.debugger.sendCommand({ tabId }, 'DOM.getDocument', {
      depth: -1,
      pierce: true,
    })) as { root: { nodeId: number } };

    let nodeId = doc.root.nodeId;

    // If a selector is provided, find that element
    if (selector) {
      const queryResult = (await chrome.debugger.sendCommand({ tabId }, 'DOM.querySelector', {
        nodeId,
        selector,
      })) as { nodeId: number };

      if (queryResult.nodeId === 0) {
        throw new Error(`Element not found: ${selector}`);
      }
      nodeId = queryResult.nodeId;
    }

    // Get outer HTML
    const html = (await chrome.debugger.sendCommand({ tabId }, 'DOM.getOuterHTML', {
      nodeId,
    })) as { outerHTML: string };

    return html.outerHTML;
  } catch (err) {
    throw new Error(`Failed to get DOM: ${err instanceof Error ? err.message : err}`);
  }
}
