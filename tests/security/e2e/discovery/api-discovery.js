// tests/security/e2e/discovery/api-discovery.js
// Сбор параметров из API endpoints

import { pickFirstItem, extractId } from "../utils/api-helpers.js";
import { listCalls } from "../config/routes.js";

/**
 * Выбирает подходящий Performance Review item (предпочитает активные, не-черновики)
 * @param {any} data - ответ API
 * @returns {any|null}
 */
export function pickPerformanceReviewItem(data) {
  const items =
    data?.items ?? data?.rows ?? data?.results ?? data?.data?.items ?? [];
  if (!Array.isArray(items) || items.length === 0) return null;

  const normalizeStatus = (item) => {
    const parts = [
      item.status,
      item.state,
      item.status?.type,
      item.status?.code,
      item.status?.name,
      item.statusName,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    return parts.join(" ");
  };

  const isDraft = (item) => {
    if (item.isDraft === true || item.draft === true) return true;
    const status = normalizeStatus(item);
    return status.includes("draft") || status.includes("черновик");
  };

  const isActive = (item) => {
    if (item.isActive === true) return true;
    const status = normalizeStatus(item);
    return status.includes("active") || status.includes("актив");
  };

  return (
    items.find((item) => isActive(item)) ??
    items.find((item) => !isDraft(item)) ??
    items[0]
  );
}

/**
 * Собирает базовые сущности из списочных API endpoints
 * @param {Object} ctx - контекст с apiGet, setParam, collectedParams
 * @param {import('@playwright/test').Page} page
 * @param {string} apiBase
 */
export async function collectListEntities(ctx, page, apiBase) {
  const { apiGet, setParam, collectedParams } = ctx;

  for (const { paths, key, query } of listCalls) {
    let item = null;
    let data = null;
    for (const path of paths) {
      const userId = collectedParams.get("userId");
      const actualQuery =
        path === "/admin/feedback-requests" && userId
          ? { ...query, authorUserId: userId, targetUserId: userId }
          : query;
      data = await apiGet(page, apiBase, path, actualQuery);
      item =
        key === "performanceReviewId"
          ? pickPerformanceReviewItem(data)
          : pickFirstItem(data);
      if (item) break;
    }
    if (!item) continue;

    const idValue = extractId(item, key);
    if (key === "inviteLinkUUID") {
      const inviteValue = item.uuid ?? item.inviteUUID ?? idValue;
      if (inviteValue !== null && inviteValue !== undefined) {
        setParam(key, inviteValue);
        setParam("inviteUUID", inviteValue);
      }
    } else if (idValue !== null && idValue !== undefined) {
      setParam(key, idValue);
    }
  }
}

/**
 * Собирает assessment template ID
 */
export async function collectAssessmentTemplate(ctx, page, apiBase) {
  const { apiGet, setParam, collectedParams, unavailableParams } = ctx;

  const assessmentId = collectedParams.get("assessmentId");
  if (!collectedParams.has("assessmentTemplateId") && assessmentId) {
    const templates = await apiGet(
      page,
      apiBase,
      "/manager/assessments/templates",
      {
        limit: 1,
        offset: 0,
      },
    );
    const templateItem = pickFirstItem(templates);
    const templateId = extractId(templateItem, "assessmentTemplateId");
    if (templateId) {
      setParam("assessmentTemplateId", templateId);
    } else {
      unavailableParams.add("assessmentTemplateId");
    }
  }
}

/**
 * Собирает feedback request ID
 */
export async function collectFeedbackRequest(ctx, page, apiBase) {
  const { apiGet, apiPost, setParam, collectedParams } = ctx;

  const userId = collectedParams.get("userId");
  if (!collectedParams.has("feedbackRequestId") && userId) {
    const baseQuery = {
      answerStatus: "all",
      limit: 1,
      offset: 0,
      id: 0,
    };
    const myList = await apiGet(
      page,
      apiBase,
      "/private/feedback-requests/my",
      {
        ...baseQuery,
        targetUserId: userId,
        accessUserId: userId,
      },
    );
    let requestItem = pickFirstItem(myList);
    if (!requestItem) {
      const forMeList = await apiGet(
        page,
        apiBase,
        "/private/feedback-requests/for-me",
        {
          ...baseQuery,
          authorUserId: userId,
          targetUserId: userId,
        },
      );
      requestItem = pickFirstItem(forMeList);
    }
    const requestId = extractId(requestItem, "feedbackRequestId");
    if (requestId) setParam("feedbackRequestId", requestId);
  }

  // Создаём feedback request если не нашли
  if (!collectedParams.has("feedbackRequestId") && userId) {
    const users = await apiGet(page, apiBase, "/manager/users", {
      limit: 5,
      offset: 0,
    });
    const userItems =
      users?.items ?? users?.rows ?? users?.results ?? users?.data?.items ?? [];
    const otherUser = userItems.find(
      (item) =>
        extractId(item, "userId") &&
        String(extractId(item, "userId")) !== String(userId),
    );
    const otherUserId = otherUser
      ? Number(extractId(otherUser, "userId"))
      : null;

    if (otherUserId) {
      const created = await apiPost(
        page,
        apiBase,
        "/private/feedback-requests",
        {
          comment: "Security auto request",
          requestedUsersIds: [otherUserId],
          targets: [{ targetType: "user", entityId: otherUserId }],
        },
      );
      const createdId = extractId(created, "feedbackRequestId");
      if (createdId) setParam("feedbackRequestId", createdId);
    }
  }
}

/**
 * Собирает survey revision и code
 */
export async function collectSurveyRevision(ctx, page, apiBase) {
  const { apiGet, setParam, collectedParams } = ctx;

  const surveyId = collectedParams.get("surveyId");
  if (!surveyId) return;

  // Получаем revisionAlias
  const revision = await apiGet(
    page,
    apiBase,
    `/private/surveys/${surveyId}/revisions/last`,
  );
  if (revision) {
    setParam(
      "revisionAlias",
      revision.alias ?? revision.revisionAlias ?? revision.id,
    );
  }

  if (!collectedParams.has("revisionAlias")) {
    const revisions = await apiGet(
      page,
      apiBase,
      `/manager/surveys/${surveyId}/revisions`,
    );
    const revisionItem = pickFirstItem(revisions);
    setParam(
      "revisionAlias",
      revisionItem?.alias ?? revisionItem?.revisionAlias ?? revisionItem?.id,
    );
  }

  if (!collectedParams.has("revisionAlias")) {
    const surveyDetails = await apiGet(
      page,
      apiBase,
      `/private/surveys/${surveyId}`,
    );
    setParam(
      "revisionAlias",
      surveyDetails?.alias ??
        surveyDetails?.revisionAlias ??
        surveyDetails?.lastRevisionAlias ??
        surveyDetails?.id,
    );
  }

  // Получаем code (JWT токен)
  const groupToken = await apiGet(
    page,
    apiBase,
    `/manager/surveys/${surveyId}/group-code/export/get-token`,
  );
  const personalToken = await apiGet(
    page,
    apiBase,
    `/manager/surveys/${surveyId}/personal-code/export/get-token`,
  );
  if (!collectedParams.has("code")) {
    const token =
      groupToken?.code ??
      groupToken?.token ??
      personalToken?.code ??
      personalToken?.token ??
      groupToken?.value ??
      personalToken?.value;
    if (token) setParam("code", token);
  }
}

/**
 * Собирает performance review revisions, nominations и revision users
 */
export async function collectPerformanceReviewDetails(ctx, page, apiBase) {
  const { apiGet, setParam, collectedParams } = ctx;

  const performanceReviewId = collectedParams.get("performanceReviewId");
  if (!performanceReviewId) return;

  const revisions = await apiGet(
    page,
    apiBase,
    `/manager/performance-reviews/${performanceReviewId}/revisions`,
  );
  const revisionItem = pickFirstItem(revisions);
  const revisionId =
    revisionItem?.id ?? revisionItem?.revisionId ?? revisionItem?.value;
  const revisionAlias =
    revisionItem?.alias ?? revisionItem?.revisionAlias ?? revisionId;

  if (revisionId) {
    setParam("revisionId", revisionId);
  }
  if (revisionAlias) {
    setParam("revisionAlias", revisionAlias);
  }

  // Получаем nominations
  if (revisionId) {
    let nominations = await apiGet(
      page,
      apiBase,
      `/manager/performance-reviews/${performanceReviewId}/nominations/of-revision/${revisionId}`,
    );
    if (!nominations) {
      nominations = await apiGet(
        page,
        apiBase,
        `/private/performance-reviews/${performanceReviewId}/nominations/of-revision/${revisionId}`,
      );
    }
    if (!nominations && revisionAlias) {
      nominations = await apiGet(
        page,
        apiBase,
        `/private/performance-reviews/${performanceReviewId}/${revisionAlias}/nominations`,
      );
    }
    if (!nominations && revisionAlias) {
      nominations = await apiGet(
        page,
        apiBase,
        `/private/performance-reviews/${performanceReviewId}/nominations/of-revision/${revisionAlias}/info`,
      );
    }
    if (!nominations) {
      nominations = await apiGet(
        page,
        apiBase,
        `/manager/performance-reviews/${performanceReviewId}/nominations`,
      );
    }
    const nominationItem = pickFirstItem(nominations);
    const nominationId = extractId(nominationItem, "nominationId");
    if (nominationId) {
      setParam("nominationId", nominationId);
    }
  }

  // Получаем revision users
  if (revisionAlias) {
    const revisionUsers = await apiGet(
      page,
      apiBase,
      `/private/performance-reviews/${performanceReviewId}/${revisionAlias}/revision-users`,
    );
    const revisionUserItem = pickFirstItem(revisionUsers);
    const revisionUserId =
      revisionUserItem?.id ??
      revisionUserItem?.revisionUserId ??
      revisionUserItem?.userId;
    if (revisionUserId) {
      setParam("revisionUserId", revisionUserId);
    }
  }

  // Дополнительный вызов для users-counts
  await apiGet(
    page,
    apiBase,
    `/manager/performance-reviews/${performanceReviewId}/nominations/users-counts`,
  );
}

/**
 * Ищет nomination ID по всем performance reviews (fallback)
 */
export async function findNominationFromReviews(ctx, page, apiBase) {
  const { apiGet, setParam, collectedParams } = ctx;

  if (collectedParams.has("nominationId")) return;

  const reviews = await apiGet(page, apiBase, "/manager/performance-reviews", {
    limit: 5,
    offset: 0,
  });
  const reviewItems =
    reviews?.items ??
    reviews?.rows ??
    reviews?.results ??
    reviews?.data?.items ??
    [];

  for (const review of reviewItems) {
    const reviewId = extractId(review, "performanceReviewId");
    if (!reviewId) continue;

    const revisions = await apiGet(
      page,
      apiBase,
      `/manager/performance-reviews/${reviewId}/revisions`,
    );
    const revisionItem = pickFirstItem(revisions);
    const revisionId =
      revisionItem?.id ?? revisionItem?.revisionId ?? revisionItem?.value;
    const revisionAlias =
      revisionItem?.alias ?? revisionItem?.revisionAlias ?? revisionId;
    if (!revisionId || !revisionAlias) continue;

    let nominations = await apiGet(
      page,
      apiBase,
      `/manager/performance-reviews/${reviewId}/nominations/of-revision/${revisionId}`,
    );
    if (!nominations) {
      nominations = await apiGet(
        page,
        apiBase,
        `/private/performance-reviews/${reviewId}/nominations/of-revision/${revisionId}`,
      );
    }
    const nominationItem = pickFirstItem(nominations);
    const nominationId = extractId(nominationItem, "nominationId");
    if (!nominationId) continue;

    setParam("performanceReviewId", reviewId);
    setParam("revisionAlias", revisionAlias);
    setParam("nominationId", nominationId);

    const revisionUsers = await apiGet(
      page,
      apiBase,
      `/private/performance-reviews/${reviewId}/${revisionAlias}/revision-users`,
    );
    const revisionUserItem = pickFirstItem(revisionUsers);
    const revisionUserId =
      revisionUserItem?.id ??
      revisionUserItem?.revisionUserId ??
      revisionUserItem?.userId;
    if (revisionUserId) setParam("revisionUserId", revisionUserId);
    break;
  }
}

/**
 * Ищет revision user ID по всем performance reviews (fallback)
 */
export async function findRevisionUserFromReviews(ctx, page, apiBase) {
  const { apiGet, setParam, collectedParams } = ctx;

  if (collectedParams.has("revisionUserId")) return;

  const reviews = await apiGet(page, apiBase, "/manager/performance-reviews", {
    limit: 5,
    offset: 0,
  });
  const reviewItems =
    reviews?.items ??
    reviews?.rows ??
    reviews?.results ??
    reviews?.data?.items ??
    [];

  for (const review of reviewItems) {
    const reviewId = extractId(review, "performanceReviewId");
    if (!reviewId) continue;

    const revisions = await apiGet(
      page,
      apiBase,
      `/manager/performance-reviews/${reviewId}/revisions`,
    );
    const revisionItem = pickFirstItem(revisions);
    const revisionAlias =
      revisionItem?.alias ?? revisionItem?.revisionAlias ?? revisionItem?.id;
    if (!revisionAlias) continue;

    const revisionUsers = await apiGet(
      page,
      apiBase,
      `/private/performance-reviews/${reviewId}/${revisionAlias}/revision-users`,
    );
    const revisionUserItem = pickFirstItem(revisionUsers);
    const revisionUserId =
      revisionUserItem?.id ??
      revisionUserItem?.revisionUserId ??
      revisionUserItem?.userId;
    if (!revisionUserId) continue;

    setParam("revisionUserId", revisionUserId);
    break;
  }
}

/**
 * Собирает development plan objectives
 */
export async function collectDevelopmentPlanObjectives(ctx, page, apiBase) {
  const { apiGet, apiPost, setParam, collectedParams } = ctx;

  const ensureDevelopmentPlanObjective = async (planId) => {
    if (!planId || collectedParams.has("developmentPlanObjectiveId")) return;
    const plan =
      (await apiGet(page, apiBase, `/private/development-plans/${planId}`)) ??
      (await apiGet(page, apiBase, `/manager/development-plans/${planId}`));
    const objectives =
      plan?.objectives ??
      plan?.goals ??
      plan?.items ??
      plan?.data?.objectives ??
      plan?.data?.goals ??
      plan?.data?.items ??
      [];
    const objectiveItem = Array.isArray(objectives) ? objectives[0] : null;
    let objectiveId = extractId(objectiveItem, "objectiveId");
    if (!objectiveId) {
      const objectivesList = await apiGet(
        page,
        apiBase,
        `/private/development-plans/${planId}/objectives`,
        { limit: 1, offset: 0 },
      );
      const firstObjective = pickFirstItem(objectivesList);
      objectiveId = extractId(firstObjective, "objectiveId");
    }
    if (objectiveId) setParam("developmentPlanObjectiveId", objectiveId);
  };

  const developmentPlanId = collectedParams.get("developmentPlanId");
  if (developmentPlanId) {
    await ensureDevelopmentPlanObjective(developmentPlanId);
  } else {
    const listBody = { limit: 1, offset: 0 };
    const planList =
      (await apiPost(
        page,
        apiBase,
        "/private/development-plans/get",
        listBody,
      )) ??
      (await apiPost(
        page,
        apiBase,
        "/private/development-plans/get/for-head",
        listBody,
      )) ??
      (await apiPost(
        page,
        apiBase,
        "/private/development-plans/get/for-curator",
        listBody,
      )) ??
      (await apiPost(
        page,
        apiBase,
        "/private/development-plans/get/for-responsible",
        listBody,
      ));
    const planItem = pickFirstItem(planList);
    const planId = extractId(planItem, "developmentPlanId");
    if (planId) {
      setParam("developmentPlanId", planId);
      await ensureDevelopmentPlanObjective(planId);
    }
  }
}

/**
 * Собирает development plan template objectives
 */
export async function collectDevelopmentPlanTemplateObjectives(
  ctx,
  page,
  apiBase,
) {
  const { apiGet, setParam, collectedParams } = ctx;

  const developmentPlanTemplateId = collectedParams.get(
    "developmentPlanTemplateId",
  );
  if (!developmentPlanTemplateId) return;

  const template =
    (await apiGet(
      page,
      apiBase,
      `/private/development-plan-templates/${developmentPlanTemplateId}`,
    )) ??
    (await apiGet(
      page,
      apiBase,
      `/manager/development-plan-templates/${developmentPlanTemplateId}`,
    ));

  const objectives =
    template?.objectives ??
    template?.goals ??
    template?.items ??
    template?.data?.objectives ??
    template?.data?.goals ??
    template?.data?.items ??
    [];
  const objectiveItem = Array.isArray(objectives) ? objectives[0] : null;
  const objectiveId = extractId(objectiveItem, "objectiveId");
  if (objectiveId) setParam("developmentPlanTemplateObjectiveId", objectiveId);
}

/**
 * Собирает integration platform name
 */
export async function collectIntegrationPlatform(ctx, page, apiBase) {
  const { apiGet, setParam, collectedParams } = ctx;

  const integrations = await apiGet(
    page,
    apiBase,
    "/manager/company/integrations",
  );
  if (!collectedParams.has("platformName") && integrations) {
    const platform =
      integrations?.platformName ??
      integrations?.name ??
      integrations?.items?.[0]?.platformName ??
      integrations?.items?.[0]?.name ??
      integrations?.data?.items?.[0]?.platformName ??
      integrations?.data?.items?.[0]?.name;
    if (platform) setParam("platformName", platform);
  }
}
