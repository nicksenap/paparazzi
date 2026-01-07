/**
 * Tool handlers index.
 */

export { handleTakeScreenshot } from './screenshot';
export {
  handleGetConsoleLogs,
  handleGetNetworkRequests,
  handleGetExceptions,
  handleEvaluateJS,
} from './debugger';
export {
  handleGetActiveTab,
  handleGetDOMSnapshot,
  handleGetPerformanceMetrics,
  handleGetStorageData,
  handleRefreshPage,
} from './page';
export type { ToolResponse, ToolHandler } from './types';
