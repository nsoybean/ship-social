import assert from "node:assert/strict";
import test from "node:test";

import { createDraftVariants, isSocialReadyVariant } from "../lib/generation.js";

test("isSocialReadyVariant rejects compare-link commit-batch copy", () => {
  const candidate =
    "Small but meaningful release: 4 commits on main. Shipping in public means tightening UX details every week. " +
    "https://github.com/nsoybean/ship-social/compare/f813187facdc50ecabfeff5821777bc634cc3676...5e18c58e0e7ef6ceba005bcee90b26fe37451a4c";

  assert.equal(isSocialReadyVariant(candidate), false);
});

test("createDraftVariants sanitizes commit-batch fallback output", () => {
  const variants = createDraftVariants({
    repoFullName: "nsoybean/ship-social",
    styleId: "release_crisp",
    release: {
      title: "4 commits on main",
      tag: "4 commits",
      body: "- feat: version",
      url: "https://github.com/nsoybean/ship-social/compare/f813187facdc50ecabfeff5821777bc634cc3676...5e18c58e0e7ef6ceba005bcee90b26fe37451a4c"
    }
  });

  assert.equal(Array.isArray(variants), true);
  assert.equal(variants.length, 3);

  for (const variant of variants) {
    assert.equal(isSocialReadyVariant(variant.text), true);
    assert.equal(/compare\//i.test(variant.text), false);
    assert.equal(/\b\d+\s+commits?\s+on\s+/i.test(variant.text), false);
    assert.equal(/\bPR\s*#\d+\b/i.test(variant.text), false);
  }
});

test("createDraftVariants keeps non-technical release urls", () => {
  const releaseUrl = "https://github.com/nsoybean/ship-social/releases/tag/v0.1.3";
  const variants = createDraftVariants({
    repoFullName: "nsoybean/ship-social",
    styleId: "release_crisp",
    release: {
      title: "New release",
      tag: "v0.1.3",
      body: "Improved onboarding flow.",
      url: releaseUrl
    }
  });

  assert.equal(variants.some((variant) => variant.text.includes(releaseUrl)), true);
});
