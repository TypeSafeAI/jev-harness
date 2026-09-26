# Web sharing for Jev Harness

The repository's configured public homepage, verified against its served community arena on 2026-09-26, is `https://jev.guru`. This is a community deployment, not an official TypeSafe AI product. A different deployment or fork must deliberately configure its own origin.

`app/layout.tsx` supplies the public metadata base and accurate unofficial-community descriptions. `app/opengraph-image.tsx` renders a static 1200×630 PNG. It accepts no request parameters, provider output, private source, keys, or user-controlled SVG. Do not add those inputs to public sharing images. The existing root page and arena redirect are unchanged; no root canonical collapses route identities.

## Verify locally

Use the existing pinned pnpm toolchain. The regular `pnpm test` command includes the source-contract regression. After `pnpm build`, start the local production server with `pnpm start`; in a second terminal run:

```sh
node scripts/check-sharing-http.mjs
```

The smoke test only requests loopback HTML and image paths. It checks rendered public origins, Twitter card metadata, real HTTP responses, PNG signatures and 1200×630 dimensions. It never invokes an API/comparison endpoint, runs browser JavaScript, or starts a model/CLI comparison. CI performs the same check with no provider key and retains generated images plus provenance under `test-results/sharing/`. That generated directory is gitignored; publish evidence deliberately rather than accidentally committing local outputs.

A successful local/CI image check is not proof that the public deployment already serves the new build. Verify production separately after deployment. The generated image is editorial artwork, not an application screenshot or a benchmark result.

The checked-in [repository SVG](assets/social-preview.svg) is an editable 1280×640 source for a separate repository card. To configure GitHub Social preview, export it to PNG, inspect that raster, and upload it through the repository's Social preview settings. This repository does not claim that a separate 1280×640 raster is checked in. Committing the SVG or web renderer does not apply About/topics or upload a repository Social preview. Follow the [shared publishing guide](https://github.com/TypeSafeAI/.github/blob/main/docs/discovery/SHARING.md).
