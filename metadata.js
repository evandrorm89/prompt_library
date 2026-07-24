// Metadata tracking system for the Prompt Library.
//
// Exposes three pure functions on window.PromptMetadata:
//   trackModel(modelName, content)  -> MetadataObject
//   updateTimestamps(metadata)      -> MetadataObject
//   estimateTokens(text, isCode)    -> TokenEstimate
//
// MetadataObject: { model, createdAt, updatedAt, tokenEstimate }
// TokenEstimate:  { min, max, confidence: 'high' | 'medium' | 'low' }
(function (global) {
  "use strict";

  const MAX_MODEL_LENGTH = 100;
  const CODE_MULTIPLIER = 1.3;

  // Confidence thresholds, keyed off the upper-bound (max) token estimate.
  const HIGH_MAX = 1000; // < 1000  -> high
  const LOW_MIN = 5000; //  > 5000  -> low  (1000-5000 -> medium)

  // Matches the strict ISO 8601 form produced by Date.prototype.toISOString():
  // YYYY-MM-DDTHH:mm:ss.sssZ
  const ISO_8601 =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  function isValidISO(value) {
    if (typeof value !== "string" || !ISO_8601.test(value)) return false;
    const time = Date.parse(value);
    return !Number.isNaN(time);
  }

  function assertModelName(modelName) {
    if (typeof modelName !== "string") {
      throw new TypeError(
        "modelName must be a string, received " + typeof modelName
      );
    }
    const trimmed = modelName.trim();
    if (trimmed.length === 0) {
      throw new Error("modelName must be a non-empty string");
    }
    if (trimmed.length > MAX_MODEL_LENGTH) {
      throw new Error(
        "modelName must be at most " +
          MAX_MODEL_LENGTH +
          " characters (received " +
          trimmed.length +
          ")"
      );
    }
    return trimmed;
  }

  function confidenceFor(maxTokens) {
    if (maxTokens < HIGH_MAX) return "high";
    if (maxTokens > LOW_MIN) return "low";
    return "medium";
  }

  // Rough heuristic token estimate. Returns a low/high bound plus a
  // confidence label describing how tight that range is expected to be.
  function estimateTokens(text, isCode) {
    if (typeof text !== "string") {
      throw new TypeError(
        "text must be a string, received " + typeof text
      );
    }

    const trimmed = text.trim();
    const wordCount = trimmed.length ? trimmed.split(/\s+/).length : 0;
    const charCount = text.length;

    let min = 0.75 * wordCount;
    let max = 0.25 * charCount;

    if (isCode) {
      min *= CODE_MULTIPLIER;
      max *= CODE_MULTIPLIER;
    }

    min = Math.round(min);
    max = Math.round(max);

    // Guard against inputs (e.g. long unbroken strings) where the
    // character-based upper bound falls below the word-based lower bound.
    if (max < min) max = min;

    return {
      min: min,
      max: max,
      confidence: confidenceFor(max),
    };
  }

  // Creates a fresh MetadataObject for a prompt. createdAt and updatedAt
  // are stamped with the current time; tokens are estimated from content.
  function trackModel(modelName, content) {
    const model = assertModelName(modelName);

    if (typeof content !== "string") {
      throw new TypeError(
        "content must be a string, received " + typeof content
      );
    }

    const now = new Date().toISOString();

    return {
      model: model,
      createdAt: now,
      updatedAt: now,
      tokenEstimate: estimateTokens(content, false),
    };
  }

  // Returns a copy of metadata with updatedAt advanced to now.
  // Throws if the stored dates are malformed or if the new updatedAt
  // would predate createdAt.
  function updateTimestamps(metadata) {
    if (!metadata || typeof metadata !== "object") {
      throw new TypeError("metadata must be an object");
    }
    if (!isValidISO(metadata.createdAt)) {
      throw new Error(
        "metadata.createdAt is not a valid ISO 8601 string: " +
          metadata.createdAt
      );
    }
    if (!isValidISO(metadata.updatedAt)) {
      throw new Error(
        "metadata.updatedAt is not a valid ISO 8601 string: " +
          metadata.updatedAt
      );
    }

    const updatedAt = new Date().toISOString();

    if (Date.parse(updatedAt) < Date.parse(metadata.createdAt)) {
      throw new Error(
        "updatedAt (" +
          updatedAt +
          ") cannot be earlier than createdAt (" +
          metadata.createdAt +
          ")"
      );
    }

    return Object.assign({}, metadata, { updatedAt: updatedAt });
  }

  global.PromptMetadata = {
    trackModel: trackModel,
    updateTimestamps: updateTimestamps,
    estimateTokens: estimateTokens,
    isValidISO: isValidISO,
  };
})(window);
