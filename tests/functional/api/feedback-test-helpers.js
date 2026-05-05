// Shared helpers for feedback API tests
import { test as fullTest } from "../../fixtures/full.js";
import { FeedbackAPI, getCredentials } from "../../utils/api/index.js";

// Extend fullTest with feedback API fixtures
export const test = fullTest.extend({
  feedbackAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  feedbackUserAPI: async ({ request }, use) => {
    const api = new FeedbackAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

export async function getThanksTypeId(feedbackAPI) {
  const { data } = await feedbackAPI.getFeedbackTypes();
  const items = data?.items || data || [];
  const thanksType = items.find(
    (t) =>
      t.name?.toLowerCase() === "thanks" ||
      t.code?.toLowerCase() === "thanks" ||
      t.selectable === true,
  );
  return thanksType?.id || items[0]?.id || null;
}

export async function findExistingFeedback(feedbackAPI) {
  const { data: myFeedbacks } = await feedbackAPI.getMyFeedbacks({ limit: 10 });
  const myItems = myFeedbacks?.items || myFeedbacks || [];
  if (myItems.length > 0) {
    return { feedbackId: myItems[0].id, feedback: myItems[0] };
  }

  const { data: ofMeFeedbacks } = await feedbackAPI.getFeedbacksOfMe({ limit: 10 });
  const ofMeItems = ofMeFeedbacks?.items || ofMeFeedbacks || [];
  if (ofMeItems.length > 0) {
    return { feedbackId: ofMeItems[0].id, feedback: ofMeItems[0] };
  }

  const { data: sharedFeedbacks } = await feedbackAPI.getSharedFeedbacks({ limit: 10 });
  const sharedItems = sharedFeedbacks?.items || sharedFeedbacks || [];
  if (sharedItems.length > 0) {
    return { feedbackId: sharedItems[0].id, feedback: sharedItems[0] };
  }

  return { feedbackId: null, feedback: null };
}

export async function findTargetUser(feedbackAPI) {
  const { response: usersResp, data: usersData } = await feedbackAPI.get(
    "/manager/users?limit=10",
  );
  if (usersResp.ok()) {
    const users = usersData?.items || usersData || [];
    if (users.length > 1) return users[1].id;
    if (users.length > 0) return users[0].id;
  }

  const { data } = await feedbackAPI.getFeedbacksOfEmployees({ limit: 50 });
  const items = data?.items || data || [];

  for (const feedback of items) {
    if (feedback.targetUsers?.length > 0) {
      const target = feedback.targetUsers[0];
      return target.userId || target.user?.id || target.id;
    }
    if (feedback.targets?.length > 0) {
      return feedback.targets[0].id || feedback.targets[0];
    }
  }

  for (const feedback of items) {
    if (feedback.authorUserId) return feedback.authorUserId;
    if (feedback.authorUser?.id) return feedback.authorUser.id;
  }

  return null;
}
