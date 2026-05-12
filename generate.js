const canva = require("../services/canva");

// ─── Build all editing operations from plan ──────────────────
function buildOperations(slides, richtexts, fills) {
  const ops = [];

  // Map page_index → elements
  const textByPage = {};
  const videoByPage = {};

  for (const rt of richtexts) {
    if (!textByPage[rt.page_index]) textByPage[rt.page_index] = [];
    textByPage[rt.page_index].push(rt);
  }
  for (const fill of fills) {
    if (fill.editable && fill.type === "video") {
      if (!videoByPage[fill.page_index]) videoByPage[fill.page_index] = [];
      videoByPage[fill.page_index].push(fill);
    }
  }

  for (const slide of slides) {
    const pi = slide.number; // page_index is 1-based

    // Text operations
    const texts = textByPage[pi] || [];
    if (texts.length > 0) {
      const el = texts[0];
      ops.push({ type: "replace_text", element_id: el.element_id, text: slide.text });
      ops.push({
        type: "format_text",
        element_id: el.element_id,
        formatting: { color: "#FFFFFF", text_align: "center", line_height: 1.1 },
      });
    }

    // Video operations (only for TC and TD)
    if (slide.has_video && slide.video_id) {
      const videos = videoByPage[pi] || [];
      const videoEl = videos.find((v) => v.containerElement?.dimension?.width >= 1000);
      if (videoEl) {
        ops.push({
          type: "update_fill",
          element_id: videoEl.element_id,
          asset_type: "video",
          asset_id: slide.video_id,
          alt_text: slide.video_desc || slide.video_category || "video",
        });
      }
    }
  }

  return ops;
}

// ─── Build position_element operations for centering ────────
function buildPositionOps(slides, richtextsAfterEdit) {
  const ops = [];
  const textByPage = {};
  for (const rt of richtextsAfterEdit) {
    if (!textByPage[rt.page_index]) textByPage[rt.page_index] = [];
    textByPage[rt.page_index].push(rt);
  }

  for (const slide of slides) {
    if (!slide.needs_position) continue;
    const pi = slide.number;
    const texts = textByPage[pi] || [];
    if (texts.length === 0) continue;
    const el = texts[0];
    ops.push({
      type: "position_element",
      element_id: el.element_id,
      top: slide.center_top,
      left: el.containerElement?.position?.left || 67.47,
    });
  }

  return ops;
}

// ─── Main generation function ────────────────────────────────
async function generateTemplate(accessToken, plan, onProgress) {
  const { slides, title } = plan;

  onProgress({ step: "creating", message: "Criando páginas no Canva...", progress: 5 });

  // STEP 1: Create design with first slide template
  let designId;
  const firstSlide = slides[0];

  // We'll use merge-designs logic: create from template
  // For now, create design then add pages
  // Note: exact Canva API endpoints depend on approved access
  designId = await canva.createDesignFromTemplate(accessToken, firstSlide.template_id, title);

  const totalSlides = slides.length;

  // Add remaining pages
  for (let i = 1; i < slides.length; i++) {
    const slide = slides[i];
    await canva.addPageFromTemplate(accessToken, designId, slide.template_id);
    const pct = Math.round(5 + (i / totalSlides) * 35);
    onProgress({ step: "creating", message: `Criando página ${i + 1}/${totalSlides}...`, progress: pct });
  }

  onProgress({ step: "editing", message: "Abrindo transação de edição...", progress: 40 });

  // STEP 2: Start editing transaction
  const { transactionId, richtexts, fills, pages } = await canva.startEditing(accessToken, designId);

  onProgress({ step: "editing", message: "Inserindo textos e vídeos...", progress: 50 });

  // STEP 3: Apply all text + video operations in one call
  const mainOps = buildOperations(slides, richtexts, fills);
  const editResult = await canva.applyOperations(
    accessToken,
    designId,
    transactionId,
    mainOps,
    1,
    pages
  );

  onProgress({ step: "centering", message: "Centralizando textos...", progress: 70 });

  // STEP 4: Apply position_element for slides that need it
  const posOps = buildPositionOps(slides, editResult.richtexts || richtexts);
  if (posOps.length > 0) {
    await canva.applyOperations(
      accessToken,
      designId,
      transactionId,
      posOps,
      2,
      pages
    );
  }

  onProgress({ step: "saving", message: "Salvando template...", progress: 90 });

  // STEP 5: Commit
  await canva.commitEditing(accessToken, designId, transactionId);

  // STEP 6: Get design URL
  const design = await canva.getDesign(accessToken, designId);

  onProgress({ step: "done", message: "Template pronto!", progress: 100 });

  return {
    designId,
    editUrl: design.urls?.edit_url || `https://www.canva.com/design/${designId}/edit`,
    viewUrl: design.urls?.view_url,
    title: design.title,
  };
}

module.exports = { generateTemplate };
