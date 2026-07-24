// Export / import system for the Prompt Library.
//
// Pure functions exposed on window.PromptExport — no DOM or localStorage
// access lives here, so the logic stays testable. The app.js layer wires
// these to file download / upload, backups and the conflict dialog.
//
// Export document schema (SCHEMA_VERSION = 1):
//   {
//     version:    1,                     // bumped on breaking schema changes
//     exportedAt: "<ISO 8601>",          // when the file was produced
//     statistics: {                      // derived, informational only
//       totalPrompts:  <number>,
//       averageRating: <number|null>,    // mean of rated prompts, 2 dp
//       ratedCount:    <number>,
//       mostUsedModel: <string|null>
//     },
//     prompts: [ <Prompt>, ... ]         // the full library
//   }
//
// Prompt: { id, title, content, rating, note, metadata } — matching the
// shape app.js persists under the "promptLibrary" localStorage key.
(function (global) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const MAX_STARS = 5;

  // ---- Statistics -------------------------------------------------------

  // Average effectiveness rating across *rated* prompts only (unrated
  // prompts would otherwise drag the mean toward zero and misrepresent it).
  // Returns null when nothing has been rated yet.
  function averageRating(prompts) {
    const rated = prompts.filter(function (p) {
      return typeof p.rating === "number" && p.rating > 0;
    });
    if (rated.length === 0) return null;
    const sum = rated.reduce(function (acc, p) {
      return acc + p.rating;
    }, 0);
    return Math.round((sum / rated.length) * 100) / 100;
  }

  // The model name attached to the most prompts. Ties are broken by whichever
  // model reached that count first (insertion order). Returns null when empty.
  function mostUsedModel(prompts) {
    const counts = new Map();
    let best = null;
    let bestCount = 0;
    prompts.forEach(function (p) {
      const model = p.metadata && p.metadata.model;
      if (!model) return;
      const next = (counts.get(model) || 0) + 1;
      counts.set(model, next);
      if (next > bestCount) {
        best = model;
        bestCount = next;
      }
    });
    return best;
  }

  function buildStatistics(prompts) {
    const rated = prompts.filter(function (p) {
      return typeof p.rating === "number" && p.rating > 0;
    });
    return {
      totalPrompts: prompts.length,
      averageRating: averageRating(prompts),
      ratedCount: rated.length,
      mostUsedModel: mostUsedModel(prompts),
    };
  }

  // ---- Export -----------------------------------------------------------

  // Wraps the library in the versioned export envelope. Throws if the input
  // is not an array so we never write a malformed file.
  function buildExport(prompts) {
    if (!Array.isArray(prompts)) {
      throw new TypeError("prompts must be an array");
    }
    return {
      version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      statistics: buildStatistics(prompts),
      prompts: prompts,
    };
  }

  // Timestamped filename, e.g. prompt-library-2026-07-24-153012.json.
  function exportFilename(date) {
    const d = date || new Date();
    const pad = function (n) {
      return String(n).padStart(2, "0");
    };
    const stamp =
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      "-" +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      pad(d.getSeconds());
    return "prompt-library-" + stamp + ".json";
  }

  // ---- Import validation ------------------------------------------------

  // Rebuilds the metadata block for an imported prompt that is missing it or
  // carries a malformed one, so the rest of the app can render it safely.
  function repairMetadata(prompt) {
    const meta = prompt.metadata;
    const validIso =
      meta &&
      global.PromptMetadata &&
      global.PromptMetadata.isValidISO(meta.createdAt) &&
      global.PromptMetadata.isValidISO(meta.updatedAt);
    if (meta && validIso && typeof meta.model === "string") {
      return meta;
    }
    if (global.PromptMetadata) {
      const rebuilt = global.PromptMetadata.trackModel(
        (meta && typeof meta.model === "string" && meta.model.trim()) ||
          "unknown",
        typeof prompt.content === "string" ? prompt.content : ""
      );
      rebuilt.backfilled = true;
      return rebuilt;
    }
    const now = new Date().toISOString();
    return {
      model: "unknown",
      createdAt: now,
      updatedAt: now,
      tokenEstimate: { min: 0, max: 0, confidence: "high" },
      backfilled: true,
    };
  }

  // Validates and normalises a single prompt from an imported file. Returns a
  // clean prompt object; throws a descriptive error keyed to its position.
  function normalizePrompt(raw, index) {
    const where = "prompt #" + (index + 1);
    if (!raw || typeof raw !== "object") {
      throw new Error(where + " is not an object");
    }
    if (typeof raw.id !== "string" || raw.id.trim() === "") {
      throw new Error(where + ' is missing a valid "id"');
    }
    if (typeof raw.title !== "string" || raw.title.trim() === "") {
      throw new Error(where + ' (id ' + raw.id + ') is missing a "title"');
    }
    if (typeof raw.content !== "string" || raw.content.trim() === "") {
      throw new Error(where + ' (id ' + raw.id + ') is missing "content"');
    }

    let rating = raw.rating;
    if (
      typeof rating !== "number" ||
      !Number.isInteger(rating) ||
      rating < 0 ||
      rating > MAX_STARS
    ) {
      rating = 0;
    }

    const prompt = {
      id: raw.id,
      title: raw.title,
      content: raw.content,
      rating: rating,
      note: typeof raw.note === "string" ? raw.note : "",
      metadata: null,
    };
    prompt.metadata = repairMetadata(raw);
    return prompt;
  }

  // Validates the top-level export envelope and returns a normalised
  // { version, prompts } payload. Throws detailed, user-facing errors.
  function validateImport(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("File is not a valid Prompt Library export.");
    }
    if (typeof data.version !== "number") {
      throw new Error('Export is missing a numeric "version" field.');
    }
    if (data.version > SCHEMA_VERSION) {
      throw new Error(
        "This file was created by a newer version (v" +
          data.version +
          "). This app supports up to v" +
          SCHEMA_VERSION +
          ". Please update before importing."
      );
    }
    if (!Array.isArray(data.prompts)) {
      throw new Error('Export is missing a "prompts" array.');
    }

    const prompts = data.prompts.map(normalizePrompt);

    // Duplicate ids *within the file* are ambiguous — reject rather than
    // silently keeping one.
    const seen = new Set();
    prompts.forEach(function (p) {
      if (seen.has(p.id)) {
        throw new Error("File contains duplicate prompt id: " + p.id);
      }
      seen.add(p.id);
    });

    return { version: data.version, prompts: prompts };
  }

  // ---- Merge ------------------------------------------------------------

  // Ids present in both the existing library and the incoming file. These are
  // the conflicts the user must resolve before a merge.
  function findConflicts(existing, incoming) {
    const existingIds = new Set(
      existing.map(function (p) {
        return p.id;
      })
    );
    return incoming
      .filter(function (p) {
        return existingIds.has(p.id);
      })
      .map(function (p) {
        return p.id;
      });
  }

  // Combines existing + incoming prompts under one of three strategies:
  //   "replace-all" — discard existing entirely, keep only the imported set
  //   "overwrite"   — incoming wins on id collisions
  //   "skip"        — existing wins on id collisions (default, non-destructive)
  // Returns { prompts, added, overwritten, skipped }.
  function mergePrompts(existing, incoming, mode) {
    const summary = { added: 0, overwritten: 0, skipped: 0, prompts: null };

    if (mode === "replace-all") {
      summary.added = incoming.length;
      summary.prompts = incoming.slice();
      return summary;
    }

    const merged = existing.slice();
    const indexById = new Map();
    merged.forEach(function (p, i) {
      indexById.set(p.id, i);
    });

    incoming.forEach(function (p) {
      if (indexById.has(p.id)) {
        if (mode === "overwrite") {
          merged[indexById.get(p.id)] = p;
          summary.overwritten++;
        } else {
          summary.skipped++;
        }
      } else {
        indexById.set(p.id, merged.length);
        merged.push(p);
        summary.added++;
      }
    });

    summary.prompts = merged;
    return summary;
  }

  global.PromptExport = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    buildStatistics: buildStatistics,
    buildExport: buildExport,
    exportFilename: exportFilename,
    normalizePrompt: normalizePrompt,
    validateImport: validateImport,
    findConflicts: findConflicts,
    mergePrompts: mergePrompts,
  };
})(window);
