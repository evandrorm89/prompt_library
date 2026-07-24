(function () {
  "use strict";

  const STORAGE_KEY = "promptLibrary";
  const PREVIEW_WORDS = 12;
  const MAX_STARS = 5;

  const form = document.getElementById("prompt-form");
  const titleInput = document.getElementById("title");
  const contentInput = document.getElementById("content");
  const list = document.getElementById("prompt-list");
  const emptyState = document.getElementById("empty-state");

  // Prompt IDs whose note is currently being edited (transient, not persisted).
  const editing = new Set();

  function loadPrompts() {
    try {
      const prompts = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      // Migrate older prompts that predate the rating / note features.
      return prompts.map(function (p) {
        return Object.assign({ rating: 0, note: "" }, p);
      });
    } catch (e) {
      return [];
    }
  }

  function savePrompts(prompts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
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

  function render() {
    const prompts = loadPrompts();
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

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    if (!title || !content) return;

    const prompts = loadPrompts();
    prompts.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      title: title,
      content: content,
      rating: 0,
      note: "",
    });
    savePrompts(prompts);

    form.reset();
    titleInput.focus();
    render();
  });

  render();
})();
