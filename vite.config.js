const axios = require("axios");

const CANVA_API = "https://api.canva.com/rest/v1";

// ─── HTTP client with token ──────────────────────────────────
function client(accessToken) {
  return axios.create({
    baseURL: CANVA_API,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

// ─── Poll until job completes ────────────────────────────────
async function pollJob(api, jobId, maxWait = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data } = await api.get(`/jobs/${jobId}`);
    if (data.job.status === "success") return data.job.result;
    if (data.job.status === "failed") throw new Error(`Job ${jobId} failed`);
  }
  throw new Error("Job timed out");
}

// ─── Create new design from template ────────────────────────
async function createDesign(accessToken, templateId, title) {
  const api = client(accessToken);
  const { data } = await api.post("/designs", {
    design_type: { type: "preset", name: "video_vertical" },
    title,
  });
  return data.design.id;
}

// ─── Add a page from a template ─────────────────────────────
async function addPageFromTemplate(accessToken, designId, templateId) {
  const api = client(accessToken);
  const { data } = await api.post(`/designs/${designId}/pages`, {
    source: { type: "design", design_id: templateId },
  });
  if (data.job?.id) return await pollJob(api, data.job.id);
  return data;
}

// ─── Start editing transaction ───────────────────────────────
async function startEditing(accessToken, designId) {
  const api = client(accessToken);
  const { data } = await api.post(`/designs/${designId}/editing`);
  return {
    transactionId: data.transaction.id,
    richtexts: data.richtexts || [],
    fills: data.fills || [],
    pages: data.pages || [],
  };
}

// ─── Apply editing operations ────────────────────────────────
async function applyOperations(accessToken, designId, transactionId, operations, pageIndex, pages) {
  const api = client(accessToken);
  const { data } = await api.patch(`/designs/${designId}/editing`, {
    transaction_id: transactionId,
    page_index: pageIndex,
    pages,
    operations,
  });
  return data;
}

// ─── Commit transaction ──────────────────────────────────────
async function commitEditing(accessToken, designId, transactionId) {
  const api = client(accessToken);
  await api.post(`/designs/${designId}/editing/commit`, {
    transaction_id: transactionId,
  });
}

// ─── Cancel transaction ──────────────────────────────────────
async function cancelEditing(accessToken, designId, transactionId) {
  const api = client(accessToken);
  await api.post(`/designs/${designId}/editing/cancel`, {
    transaction_id: transactionId,
  });
}

// ─── Get design info ─────────────────────────────────────────
async function getDesign(accessToken, designId) {
  const api = client(accessToken);
  const { data } = await api.get(`/designs/${designId}`);
  return data.design;
}

module.exports = {
  createDesign,
  addPageFromTemplate,
  startEditing,
  applyOperations,
  commitEditing,
  cancelEditing,
  getDesign,
  pollJob,
  client,
};
