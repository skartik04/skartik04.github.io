import { getCollection } from "astro:content";

// A plain, factual index of the site for LLM/AI crawlers (the llms.txt convention).
// Auto-generated from published posts; drafts are excluded.
export async function GET() {
  const base = "https://skartik04.github.io";
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );

  let body = `# Kartik Sharma

> Personal site of Kartik Sharma, a PhD student in Electrical and Computer Engineering at UCLA, working on post-training for reasoning models and world models.

## Pages
- [Home](${base}/): bio, selected papers, and projects.
- [Blog](${base}/blog/): research notes and experiments.
`;

  if (posts.length) {
    body += `\n## Posts\n`;
    for (const p of posts) {
      body += `- [${p.data.title}](${base}/blog/${p.id}/): ${p.data.description}\n`;
    }
  }

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
