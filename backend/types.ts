/**
 * Типы для ответов KIE API (по документации в docs/kie-ai-api-documentation.md).
 * Используются в kieClient при разборе createTask и record-info.
 */

/** Ответ создания задачи: code, msg, data.taskId */
export interface KieTaskCreateResponse {
  code?: number;
  msg?: string;
  data?: { taskId?: string };
}

/**
 * Ответ record-info (опрос статуса).
 * Варианты по API: successFlag "0"|"1"|"2"|"3" или state (success|fail),
 * URL в data.response.result_urls или data.resultJson (JSON-строка с resultUrls).
 */
export interface KieRecordInfoResponse {
  code?: number;
  msg?: string;
  data?: {
    successFlag?: string | number;
    state?: string;
    resultJson?: string;
    failMsg?: string;
    response?: { result_urls?: string[] };
  };
}
