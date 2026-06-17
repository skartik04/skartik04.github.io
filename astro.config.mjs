// @ts-check
import { defineConfig } from "astro/config";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import rehypeSlug from "rehype-slug";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://skartik04.github.io",
  integrations: [sitemap()],
  markdown: {
    remarkPlugins: [remarkMath],
    // rehype-slug gives headings IDs (silent) so the table of contents can link to them.
    rehypePlugins: [rehypeKatex, rehypeSlug],
  },
});
