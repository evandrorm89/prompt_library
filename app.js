(function () {
  "use strict";

  var STORAGE_KEY = "prompt-library.prompts";

  var form = document.getElementById("prompt-form");
  var titleInput = document.getElementById("title");
  var contentInput = document.getElementById("content");
  var list = document.getElementById("prompt-list");
  var emptyState = document.getElementById("empty-state");
  var countEl = document.getElementById("count");

  function loadPrompts() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function savePrompts(prompts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
  }

  function render() {
    var prompts = loadPrompts();
    list.innerHTML = "";
    countEl.textContent = String(prompts.length);
    emptyState.classList.toggle("hidden", prompts.length > 0);

    prompts.forEach(function (prompt) {
      list.appendChild(createPromptElement(prompt));
    });
  }

  function createPromptElement(prompt) {
    var item = document.createElement("article");
    item.className = "prompt-item";

    var head = document.createElement("div");
    head.className = "prompt-item-head";

    var title = document.createElement("h3");
    title.textContent = prompt.title;

    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", function () {
      deletePrompt(prompt.id);
    });

    head.appendChild(title);
    head.appendChild(deleteBtn);

    var content = document.createElement("p");
    content.className = "prompt-content";
    content.textContent = prompt.content;

    item.appendChild(head);
    item.appendChild(content);
    return item;
  }

  function deletePrompt(id) {
    var prompts = loadPrompts().filter(function (p) {
      return p.id !== id;
    });
    savePrompts(prompts);
    render();
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var title = titleInput.value.trim();
    var content = contentInput.value.trim();
    if (!title || !content) {
      return;
    }

    var prompts = loadPrompts();
    prompts.unshift({
      id:
        Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
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
