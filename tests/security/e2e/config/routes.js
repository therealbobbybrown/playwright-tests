// tests/security/e2e/config/routes.js
// Конфигурация маршрутов для тестов безопасности

/**
 * Все маршруты фронтенда для проверки доступа
 */
export const routeTemplates = [
  "/about",
  "/api/auth/google",
  "/api/auth/telegram",
  "/api/build-id",
  "/api/status",
  "/auth",
  "/department-code/surveys/:surveyId/:revisionAlias/:code",
  "/development-plans/:developmentPlanId",
  "/development-plans/:developmentPlanId/objectives/:objectiveId",
  "/development-plans/add/from-template",
  "/development-plans/add",
  "/development-plans",
  "/development-plans/templates/:developmentPlanTemplateId/edit",
  "/development-plans/templates/:developmentPlanTemplateId",
  "/development-plans/templates/:developmentPlanTemplateId/objectives/:objectiveId",
  "/development-plans/templates/add",
  "/development-plans/templates",
  "/download",
  "/feedbacks/:feedbackId",
  "/feedbacks/add",
  "/feedbacks/feed/:name",
  "/feedbacks/feed/of-me",
  "/feedbacks/feed/my",
  "/feedbacks/feed/shared",
  "/feedbacks/feed/of-employees",
  "/forget-password/authorization",
  "/forget-password/set-password",
  "/gift-shop",
  // '/gift-shop/orders', - страница не существует в Next.js (только /gift-shop/)
  "/group-code/surveys/:surveyId/:revisionAlias/:code",
  "/integration/discord/connect/callback",
  "/integration/discord/connect",
  "/integration/discord/direct/callback",
  "/integration/discord/direct",
  "/integration/slack/direct",
  "/integration/sso/auth/callback",
  "/invite/:inviteUUID",
  "/invite/:inviteUUID/join",
  "/karma/transactions",
  // '/karma/history', - страница не существует (только /karma/transactions)
  "/link/surveys/:surveyId/:revisionAlias",
  "/login",
  "/manager/assessments/:assessmentId",
  // '/manager/assessments/:assessmentId/edit', - редактирование через модалку
  "/manager/assessments/add",
  "/manager/assessments",
  "/manager/assessments/templates/:assessmentTemplateId",
  // '/manager/assessments/templates/:assessmentTemplateId/edit', - редактирование через модалку
  "/manager/assessments/templates/add",
  "/manager/assessments/templates",
  "/manager/company/brand",
  "/manager/company/import/:service/:entity",
  "/manager/company",
  "/manager/company/integration/:platformName",
  "/manager/company/integrations",
  "/manager/company/notifications",
  "/manager/company/roles/:roleId",
  // '/manager/company/roles/:roleId/edit', - редактирование через модалку
  "/manager/company/roles/add",
  "/manager/company/roles",
  "/manager/company/surveys/:surveyId",
  // '/manager/company/surveys/:surveyId/edit', - редактирование через модалку
  // '/manager/company/surveys/:surveyId/results', - страница не существует
  // '/manager/company/surveys/:surveyId/statistics', - страница не существует
  "/manager/company/surveys/add",
  "/manager/company/surveys",
  "/manager/company/surveys/templates",
  // '/manager/company/surveys/templates/:surveyTemplateId', - страница не существует (templates.js - список)
  "/manager/competence-scales/:competenceScaleId",
  // '/manager/competence-scales/:competenceScaleId/edit', - редактирование через модалку
  "/manager/competence-scales/add",
  "/manager/competence-scales",
  "/manager/competencies/:competenceId/edit",
  "/manager/competencies/:competenceId",
  "/manager/competencies/add",
  "/manager/competencies",
  "/manager/development-actions/:developmentActionId/edit",
  // '/manager/development-actions/:developmentActionId', - нет index, только /edit
  "/manager/development-actions/add",
  "/manager/development-actions",
  "/manager/feedbacks",
  "/manager/feedbacks/:feedbackId",
  "/manager/gift-shop/settings",
  // '/manager/gift-shop/gifts', - страница не существует (gift-shop админка только settings)
  // '/manager/gift-shop/gifts/:giftId', - страница не существует
  // '/manager/gift-shop/gifts/add', - страница не существует
  // '/manager/gift-shop/orders', - страница не существует
  "/manager/integration-settings/mattermost",
  "/manager/karma/:tab",
  "/manager/karma/transfers/deposit",
  // '/manager/karma/transfers/withdraw', - страница не существует (только deposit)
  "/manager/karma/settings",
  // '/manager/ninebox', - страница не существует (только /manager/ninebox/settings)
  "/manager/ninebox/settings",
  // '/manager/ninebox/:nineboxId' - removed: NineBox не имеет отдельных страниц по ID, только settings
  "/manager/performance-reviews/:performanceReviewId",
  // '/manager/performance-reviews/:performanceReviewId/edit', - редактирование через модалку
  // '/manager/performance-reviews/:performanceReviewId/results', - страница не существует
  // '/manager/performance-reviews/:performanceReviewId/statistics', - страница не существует
  "/manager/performance-reviews/add",
  "/manager/performance-reviews",
  "/manager/statistics/feedback-requests",
  "/manager/statistics/feedbacks",
  // '/manager/statistics/performance-reviews', - страница не существует
  // '/manager/statistics/surveys', - страница не существует
  "/manager/structure/constructor",
  "/manager/structure/departments/:entityType/:entityId",
  // '/manager/structure/departments/:entityType/:entityId/edit', - редактирование через модалку
  // '/manager/structure/departments/add', - создание через модалку
  "/manager/structure/import",
  "/manager/structure/invite-links/:inviteLinkUUID",
  // '/manager/structure/invite-links/:inviteLinkUUID/edit', - редактирование через модалку
  "/manager/structure/invite-links/add",
  "/manager/structure/invite-links",
  "/manager/structure/user-groups/:userGroupId",
  // '/manager/structure/user-groups/:userGroupId/edit', - редактирование через модалку
  "/manager/structure/user-groups/add",
  // '/manager/structure/user-groups', - нет index страницы (только /manager/structure/users)
  "/manager/structure/users/:userId",
  // '/manager/structure/users/:userId/edit', - редактирование через модалку
  "/manager/structure/users/add",
  "/manager/structure/users",
  "/manager/token1s",
  "/notifications",
  "/performance-reviews/:performanceReviewId/results/export",
  "/performance-reviews/:performanceReviewId/results",
  "/personal/surveys/:surveyId/:revisionAlias/:code",
  "/personal/surveys/:surveyId/:revisionAlias",
  "/policies/:alias",
  "/policies/cookies",
  "/policies/personal-data-processing",
  "/policies/terms",
  "/profile/:userId",
  "/profile/settings",
  "/profile/settings/password",
  // '/profile/settings/notifications', - страница не существует
  "/requests/:feedbackRequestId",
  "/requests/add",
  "/requests/feed/:name",
  "/requests/feed/for-me",
  "/requests/feed/my",
  "/requests/feed/of-employees",
  "/signup/authorization",
  "/signup/confirm-invite",
  "/signup/confirm-social",
  "/signup/set-password",
  "/statistics",
  "/surveys/:surveyId/:revisionAlias",
  "/telegram/shortcut",
  "/telegram/start",
  "/users/departments/:entityType/:entityId",
  "/users/list",
  "/users/structure",
];

/**
 * Маршруты, доступные без авторизации
 */
export const publicRoutes = new Set(["/feedbacks/add"]);

/**
 * Маршруты, которые могут вернуть 500 даже для админа
 * (требуют назначения пользователя на опрос, специфичных условий и т.д.)
 */
export const expectedServerErrorRoutes = new Set([
  "/surveys/:surveyId/:revisionAlias", // требует назначения на опрос
  "/personal/surveys/:surveyId/:revisionAlias", // требует персонального назначения на опрос
  "/department-code/surveys/:surveyId/:revisionAlias/:code", // department-code требует особых условий
  "/group-code/surveys/:surveyId/:revisionAlias/:code", // group-code может вернуть 500 при невалидном токене
  "/policies/:alias", // может не существовать для alias
  "/policies/cookies", // зависит от конфигурации
  "/signup/confirm-invite", // требует валидного invite token
  "/telegram/shortcut", // требует телеграм-интеграции
  "/manager/company/import/:service/:entity", // импорт требует настроенной интеграции (google/users и т.д.)
]);

/**
 * Настройки кеширования
 */
export const cacheConfig = {
  ttlMs: 4 * 60 * 60 * 1000, // 4 часа
  idCachePath: "test-results/security-id-cache.json",
  discoveryReportPath: "test-results/security-discovery.json",
};

/**
 * API endpoints для discovery параметров
 * Используется в collectFromApi для получения ID сущностей
 */
export const listCalls = [
  { paths: ["/manager/roles"], key: "roleId", query: { limit: 1, offset: 0 } },
  {
    paths: ["/manager/assessments"],
    key: "assessmentId",
    query: { limit: 1, offset: 0 },
  },
  {
    paths: ["/manager/assessments/templates"],
    key: "assessmentTemplateId",
    query: { limit: 1, offset: 0 },
  },
  {
    paths: ["/manager/competence-scales"],
    key: "competenceScaleId",
    query: { limit: 1, offset: 0 },
  },
  {
    paths: ["/manager/competencies"],
    key: "competenceId",
    query: { limit: 1, offset: 0 },
  },
  {
    paths: ["/manager/development-actions", "/private/development-actions"],
    key: "developmentActionId",
    query: { limit: 1, offset: 0 },
  },
  {
    paths: ["/manager/performance-reviews"],
    key: "performanceReviewId",
    query: { limit: 10, offset: 0 },
  },
  {
    paths: ["/manager/surveys", "/manager/company/surveys", "/private/surveys"],
    key: "surveyId",
    query: { limit: 5, offset: 0 },
  },
  {
    paths: ["/manager/surveys/templates", "/manager/company/surveys/templates"],
    key: "surveyTemplateId",
    query: { limit: 1, offset: 0 },
  },
  {
    paths: ["/manager/invite-links"],
    key: "inviteLinkUUID",
    query: { limit: 1, offset: 0 },
  },
  {
    paths: ["/manager/user-groups"],
    key: "userGroupId",
    query: { limit: 1, offset: 0 },
  },
  {
    paths: ["/manager/departments"],
    key: "entityId",
    query: { limit: 1, offset: 0 },
  },
  { paths: ["/manager/users"], key: "userId", query: { limit: 1, offset: 0 } },
  {
    paths: ["/manager/feedbacks"],
    key: "feedbackId",
    query: { limit: 1, offset: 0 },
  },
  {
    paths: ["/manager/development-plans"],
    key: "developmentPlanId",
    query: { limit: 1, offset: 0 },
  },
  {
    paths: [
      "/private/development-plan-templates",
      "/manager/development-plan-templates",
      "/private/development-plan-templates/get",
    ],
    key: "developmentPlanTemplateId",
    query: { limit: 1, offset: 0 },
  },
  {
    paths: ["/admin/feedback-requests", "/private/feedback-requests/for-me"],
    key: "feedbackRequestId",
    query: { limit: 1, offset: 0 },
  },
  { paths: ["/manager/gifts"], key: "giftId", query: { limit: 1, offset: 0 } },
  // nineboxId removed - NineBox не имеет отдельных сущностей по ID
];
