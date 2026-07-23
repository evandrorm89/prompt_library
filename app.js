(function () {
  "use strict";

  const STORAGE_KEY = "promptLibrary";
  const PREVIEW_WORDS = 12;

  const form = document.getElementById("prompt-form");
  const titleInput = document.getElementById("title");
  const contentInput = document.getElementById("content");
  const list = document.getElementById("prompt-list");
  const emptyState = document.getElementById("empty-state");

  function loadPrompts() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
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

      const del = document.createElement("button");
      del.className = "btn-delete";
      del.type = "button";
      del.textContent = "Delete";
      del.addEventListener("click", function () {
        deletePrompt(prompt.id);
      });

      card.appendChild(title);
      card.appendChild(preview);
      card.appendChild(del);
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
    });
    savePrompts(prompts);

    form.reset();
    titleInput.focus();
    render();
  });

  render();
})();
