(function () {
  "use strict";

  const STORAGE_KEY = "promptLibrary";
  const PREVIEW_WORDS = 12;
  const MAX_STARS = 5;

  const form = document.getElementById("prompt-form");
  const titleInput = document.getElementById("title");
  const contentInput = document.getElementById("content");
  const modelInput = document.getElementById("model");
  const formError = document.getElementById("form-error");
  const list = document.getElementById("prompt-list");
  const emptyState = document.getElementById("empty-state");

  const exportBtn = document.getElementById("export-btn");
  const importBtn = document.getElementById("import-btn");
  const importFile = document.getElementById("import-file");
  const ioStatus = document.getElementById("io-status");

  const modalOverlay = document.getElementById("modal-overlay");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");
  const modalActions = document.getElementById("modal-actions");

  // Separate key so a failed import can restore the pre-import library.
  const BACKUP_KEY = "promptLibrary.backup";

  // Prompt IDs whose note is currently being edited (transient, not persisted).
  const editing = new Set();

  // Builds metadata for prompts saved before the metadata feature existed.
  // We can't recover the original model or creation time, so we stamp "now"
  // and mark the model as unknown; token estimates are still accurate.
  function backfillMetadata(prompt) {
    try {
      const meta = PromptMetadata.trackModel("unknown", prompt.content || "");
      meta.backfilled = true;
      return meta;
    } catch (e) {
      const now = new Date().toISOString();
      return {
        model: "unknown",
        createdAt: now,
        updatedAt: now,
        tokenEstimate: { min: 0, max: 0, confidence: "high" },
        backfilled: true,
      };
    }
  }

  function loadPrompts() {
    try {
      const prompts = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      // Migrate older prompts that predate the rating / note / metadata features.
      return prompts.map(function (p) {
        const prompt = Object.assign({ rating: 0, note: "" }, p);
        if (!prompt.metadata) {
          prompt.metadata = backfillMetadata(prompt);
        }
        return prompt;
      });
    } catch (e) {
      return [];
    }
  }

  function savePrompts(prompts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
  }

  // Advances a prompt's updatedAt timestamp after an edit. Failures here
  // (e.g. corrupt stored dates) must not block the edit itself.
  function touchMetadata(prompt) {
    if (!prompt.metadata) return;
    try {
      prompt.metadata = PromptMetadata.updateTimestamps(prompt.metadata);
    } catch (e) {
      // Leave the existing timestamp in place if it can't be updated.
    }
  }

  function makePreview(content) {
    const words = content.trim().split(/\s+/);
    const preview = words.slice(0, PREVIEW_WORDS).join(" ");
    return words.length > PREVIEW_WORDS ? preview + "…" : preview;
  }

  function setRating(id, rating) {
    const prompts = loadPrompts();
    const prompt = prompts.find(function (p) {
      return p.id === id;
    });
    if (!prompt) return;
    // Clicking the current rating again clears it back to unrated.
    prompt.rating = prompt.rating === rating ? 0 : rating;
    touchMetadata(prompt);
    savePrompts(prompts);
    render();
  }

  // Builds an interactive 5-star widget for a single prompt.
  function buildRating(prompt) {
    const wrap = document.createElement("div");
    wrap.className = "rating";
    wrap.setAttribute("role", "radiogroup");
    wrap.setAttribute(
      "aria-label",
      "Effectiveness rating for " + prompt.title
    );

    const stars = document.createElement("div");
    stars.className = "stars";

    function paint(value) {
      Array.prototype.forEach.call(stars.children, function (btn, i) {
        btn.classList.toggle("filled", i < value);
      });
    }

    for (let i = 1; i <= MAX_STARS; i++) {
      const star = document.createElement("button");
      star.type = "button";
      star.className = "star" + (i <= prompt.rating ? " filled" : "");
      star.textContent = "★";
      star.dataset.value = i;
      star.setAttribute("role", "radio");
      star.setAttribute("aria-checked", i === prompt.rating ? "true" : "false");
      star.setAttribute("aria-label", i + " out of " + MAX_STARS + " stars");

      star.addEventListener("click", function () {
        setRating(prompt.id, i);
      });
      // Preview on hover / keyboard focus without committing.
      star.addEventListener("mouseenter", function () {
        paint(i);
      });
      star.addEventListener("focus", function () {
        paint(i);
      });

      stars.appendChild(star);
    }

    // Restore the committed rating when the pointer leaves the widget.
    stars.addEventListener("mouseleave", function () {
      paint(prompt.rating);
    });
    stars.addEventListener("blur", function () {
      paint(prompt.rating);
    }, true);

    const label = document.createElement("span");
    label.className = "rating-label";
    label.textContent = prompt.rating
      ? prompt.rating + "/" + MAX_STARS
      : "Not yet rated";

    wrap.appendChild(stars);
    wrap.appendChild(label);
    return wrap;
  }

  // Persists a note; saving an empty note removes it. Retrieved via loadPrompts().
  function saveNote(id, text) {
    const prompts = loadPrompts();
    const prompt = prompts.find(function (p) {
      return p.id === id;
    });
    if (!prompt) return;
    prompt.note = text.trim();
    touchMetadata(prompt);
    savePrompts(prompts);
    editing.delete(id);
    render();
  }

  function deleteNote(id) {
    saveNote(id, "");
  }

  // Builds the notes area for a prompt: editor when editing or empty, else read-only.
  function buildNotes(prompt) {
    const wrap = document.createElement("div");
    wrap.className = "notes";

    const isEditing = editing.has(prompt.id);

    if (isEditing || !prompt.note) {
      const label = document.createElement("label");
      label.className = "notes-label";
      const fieldId = "note-" + prompt.id;
      label.setAttribute("for", fieldId);
      label.textContent = "Notes";

      const textarea = document.createElement("textarea");
      textarea.id = fieldId;
      textarea.className = "notes-input";
      textarea.rows = 3;
      textarea.placeholder = "No notes yet. Add one...";
      textarea.value = prompt.note;

      const save = document.createElement("button");
      save.type = "button";
      save.className = "btn-note-save";
      save.textContent = "Save";
      save.addEventListener("click", function () {
        saveNote(prompt.id, textarea.value);
      });

      wrap.appendChild(label);
      wrap.appendChild(textarea);
      wrap.appendChild(save);
    } else {
      const label = document.createElement("span");
      label.className = "notes-label";
      label.textContent = "Notes";

      const text = document.createElement("p");
      text.className = "notes-text";
      text.textContent = prompt.note;

      const actions = document.createElement("div");
      actions.className = "notes-actions";

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn-note";
      edit.textContent = "Edit";
      edit.addEventListener("click", function () {
        editing.add(prompt.id);
        render();
      });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn-note btn-note-delete";
      del.textContent = "Delete";
      del.addEventListener("click", function () {
        deleteNote(prompt.id);
      });

      actions.appendChild(edit);
      actions.appendChild(del);

      wrap.appendChild(label);
      wrap.appendChild(text);
      wrap.appendChild(actions);
    }

    return wrap;
  }

  // Formats an ISO 8601 timestamp for display, falling back to the raw
  // string if the browser can't parse it.
  function formatDate(iso) {
    const time = Date.parse(iso);
    if (Number.isNaN(time)) return iso || "—";
    return new Date(time).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Builds the read-only metadata block shown on each card: model name,
  // created / updated timestamps, and a color-coded token estimate.
  function buildMetadata(prompt) {
    const meta = prompt.metadata;
    const wrap = document.createElement("div");
    wrap.className = "meta";

    const model = document.createElement("div");
    model.className = "meta-row";
    model.innerHTML =
      '<span class="meta-key">Model</span>' +
      '<span class="meta-val meta-model"></span>';
    model.querySelector(".meta-model").textContent = meta.model;

    const created = document.createElement("div");
    created.className = "meta-row";
    created.innerHTML =
      '<span class="meta-key">Created</span>' +
      '<span class="meta-val"></span>';
    created.querySelector(".meta-val").textContent = formatDate(meta.createdAt);

    const est = meta.tokenEstimate || { min: 0, max: 0, confidence: "high" };
    const tokens = document.createElement("div");
    tokens.className = "meta-row";
    const badge =
      '<span class="token-badge token-' +
      est.confidence +
      '" title="Estimate confidence: ' +
      est.confidence +
      '">~' +
      est.min +
      "–" +
      est.max +
      " tokens</span>";
    tokens.innerHTML =
      '<span class="meta-key">Tokens</span>' +
      '<span class="meta-val">' +
      badge +
      "</span>";

    wrap.appendChild(model);
    wrap.appendChild(created);
    // Only surface "Updated" once it diverges from creation, to avoid noise.
    if (meta.updatedAt && meta.updatedAt !== meta.createdAt) {
      const updated = document.createElement("div");
      updated.className = "meta-row";
      updated.innerHTML =
        '<span class="meta-key">Updated</span>' +
        '<span class="meta-val"></span>';
      updated.querySelector(".meta-val").textContent = formatDate(
        meta.updatedAt
      );
      wrap.appendChild(updated);
    }
    wrap.appendChild(tokens);

    return wrap;
  }

  function render() {
    const prompts = loadPrompts();
    // Newest first, by metadata.createdAt descending.
    prompts.sort(function (a, b) {
      return Date.parse(b.metadata.createdAt) - Date.parse(a.metadata.createdAt);
    });
    list.innerHTML = "";
    emptyState.style.display = prompts.length ? "none" : "block";

    prompts.forEach(function (prompt) {
      const card = document.createElement("div");
      card.className = "card";

      const title = document.createElement("h3");
      title.className = "card-title";
      title.textContent = prompt.title;

      const preview = document.createElement("p");
      preview.className = "card-preview";
      preview.textContent = makePreview(prompt.content);

      const footer = document.createElement("div");
      footer.className = "card-footer";

      const del = document.createElement("button");
      del.className = "btn-delete";
      del.type = "button";
      del.textContent = "Delete";
      del.addEventListener("click", function () {
        deletePrompt(prompt.id);
      });

      footer.appendChild(buildRating(prompt));
      footer.appendChild(del);

      card.appendChild(title);
      card.appendChild(preview);
      card.appendChild(buildMetadata(prompt));
      card.appendChild(buildNotes(prompt));
      card.appendChild(footer);
      list.appendChild(card);
    });
  }

  function deletePrompt(id) {
    const prompts = loadPrompts().filter(function (p) {
      return p.id !== id;
    });
    savePrompts(prompts);
    render();
  }

  function showError(message) {
    formError.textContent = message || "";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    showError("");

    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    const model = modelInput.value.trim();
    if (!title || !content) return;

    try {
      // trackModel validates the model name and stamps timestamps + tokens.
      const metadata = PromptMetadata.trackModel(model, content);

      const prompts = loadPrompts();
      prompts.unshift({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        title: title,
        content: content,
        rating: 0,
        note: "",
        metadata: metadata,
      });
      savePrompts(prompts);

      form.reset();
      titleInput.focus();
      render();
    } catch (err) {
      showError(err.message);
    }
  });

  // ---- Export / import status line -------------------------------------

  // Shows a transient status message under the toolbar. `kind` styles it as
  // "success" or "error"; anything else is neutral.
  function setStatus(message, kind) {
    ioStatus.textContent = message || "";
    ioStatus.className = "io-status" + (kind ? " io-status-" + kind : "");
  }

  // ---- Modal conflict dialog -------------------------------------------

  // Opens the dialog with a title, body and a set of { label, value, kind }
  // buttons. Resolves with the chosen value, or null if dismissed (backdrop
  // click or Escape). Only one dialog is expected open at a time.
  function openDialog(title, body, buttons) {
    return new Promise(function (resolve) {
      modalTitle.textContent = title;
      modalBody.textContent = body;
      modalActions.innerHTML = "";

      function close(value) {
        modalOverlay.hidden = true;
        modalOverlay.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onKey);
        resolve(value);
      }

      function onBackdrop(e) {
        if (e.target === modalOverlay) close(null);
      }
      function onKey(e) {
        if (e.key === "Escape") close(null);
      }

      buttons.forEach(function (btn) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "btn-modal" + (btn.kind ? " btn-modal-" + btn.kind : "");
        el.textContent = btn.label;
        el.addEventListener("click", function () {
          close(btn.value);
        });
        modalActions.appendChild(el);
      });

      modalOverlay.hidden = false;
      modalOverlay.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKey);
      const first = modalActions.querySelector("button");
      if (first) first.focus();
    });
  }

  // ---- Export ----------------------------------------------------------

  function exportPrompts() {
    try {
      const prompts = loadPrompts();
      if (prompts.length === 0) {
        setStatus("Nothing to export — your library is empty.", "error");
        return;
      }
      const payload = PromptExport.buildExport(prompts);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = PromptExport.exportFilename();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus(
        "Exported " + prompts.length + " prompt" +
          (prompts.length === 1 ? "" : "s") + " to " + a.download + ".",
        "success"
      );
    } catch (err) {
      setStatus("Export failed: " + err.message, "error");
    }
  }

  // ---- Import ----------------------------------------------------------

  // Reads a File as text via a Promise so the flow can be written linearly.
  function readFileText(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(new Error("Could not read the selected file."));
      };
      reader.readAsText(file);
    });
  }

  // Persists the merged library, backing up the current one first and rolling
  // back if the write throws (e.g. localStorage quota exceeded).
  function commitImport(merged) {
    const previous = localStorage.getItem(STORAGE_KEY);
    if (previous !== null) {
      localStorage.setItem(BACKUP_KEY, previous);
    }
    try {
      savePrompts(merged);
      // Import succeeded — discard the safety backup.
      localStorage.removeItem(BACKUP_KEY);
      render();
    } catch (err) {
      // Roll back to the exact prior state.
      if (previous === null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, previous);
      }
      localStorage.removeItem(BACKUP_KEY);
      render();
      throw new Error(
        "Import could not be saved (" + err.message +
          "). Your existing library was restored."
      );
    }
  }

  // Turns a merge summary into a short human-readable sentence.
  function describeResult(summary) {
    const parts = [];
    if (summary.added) parts.push(summary.added + " added");
    if (summary.overwritten) parts.push(summary.overwritten + " replaced");
    if (summary.skipped) parts.push(summary.skipped + " skipped");
    return parts.length ? parts.join(", ") + "." : "No changes.";
  }

  async function importPrompts(file) {
    setStatus("Reading " + file.name + "…");
    let payload;
    try {
      const text = await readFileText(file);
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error("File is not valid JSON.");
      }
      payload = PromptExport.validateImport(data);
    } catch (err) {
      setStatus("Import failed: " + err.message, "error");
      return;
    }

    const existing = loadPrompts();
    const conflicts = PromptExport.findConflicts(existing, payload.prompts);

    // Decide the merge strategy, prompting only when there is a real conflict.
    let mode;
    if (existing.length === 0) {
      mode = "skip"; // nothing to conflict with; every prompt is simply added
    } else if (conflicts.length === 0) {
      const choice = await openDialog(
        "Import " + payload.prompts.length + " prompt(s)",
        "No conflicts with your " + existing.length +
          " existing prompt(s). How would you like to import?",
        [
          { label: "Merge (add all)", value: "skip", kind: "primary" },
          { label: "Replace entire library", value: "replace-all", kind: "danger" },
          { label: "Cancel", value: null },
        ]
      );
      if (!choice) {
        setStatus("Import cancelled.");
        return;
      }
      mode = choice;
    } else {
      const choice = await openDialog(
        "Resolve " + conflicts.length + " conflict(s)",
        conflicts.length +
          " imported prompt(s) share an id with prompts you already have. " +
          "Choose how to resolve the overlap:",
        [
          { label: "Keep mine (skip conflicts)", value: "skip", kind: "primary" },
          { label: "Use imported (overwrite)", value: "overwrite" },
          { label: "Replace entire library", value: "replace-all", kind: "danger" },
          { label: "Cancel", value: null },
        ]
      );
      if (!choice) {
        setStatus("Import cancelled.");
        return;
      }
      mode = choice;
    }

    try {
      const summary = PromptExport.mergePrompts(existing, payload.prompts, mode);
      commitImport(summary.prompts);
      setStatus("Import complete — " + describeResult(summary), "success");
    } catch (err) {
      setStatus(err.message, "error");
    }
  }

  exportBtn.addEventListener("click", exportPrompts);
  importBtn.addEventListener("click", function () {
    importFile.click();
  });
  importFile.addEventListener("change", function () {
    const file = importFile.files && importFile.files[0];
    if (file) importPrompts(file);
    // Reset so selecting the same file again still fires "change".
    importFile.value = "";
  });

  render();
})();
