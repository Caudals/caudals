import { describe, expect, it } from "vitest";
import {
  getAllBlogSlugs,
  getAdjacentBlogPosts,
  getBlogPost,
  getBlogPosts,
} from "@/lib/blog/posts";

describe("blog content loader", () => {
  it("returns localized posts ordered by publish date", async () => {
    const posts = await getBlogPosts("en");
    const publishedTimes = posts.map((post) => +new Date(post.publishedAt));

    expect(posts).toHaveLength(10);
    expect(posts[0]?.slug).toBe("el-impacto-de-los-modelos-open-weights-chinos-en-el-mercado-de-dataset");
    expect(publishedTimes).toEqual([...publishedTimes].sort((a, b) => b - a));
    expect(posts.some((post) => post.slug === "launching-caudals-clearer-dataset-operations" && post.featured)).toBe(true);
    expect(posts.every((post) => post.locale === "en")).toBe(true);
  });

  it("loads localized mdx content with headings for article pages", async () => {
    const post = await getBlogPost(
      "operational-playbooks-for-multimodal-datasets",
      "es",
    );

    expect(post).not.toBeNull();
    expect(post?.title).toContain("Playbooks operativos");
    expect(post?.headings.map((heading) => heading.id)).toContain(
      "empieza-por-el-contrato-de-recopilacion",
    );
  });

  it("exposes stable slugs and adjacent navigation", async () => {
    const slugs = await getAllBlogSlugs();
    const adjacent = await getAdjacentBlogPosts(
      "active-learning-guided-data-collection",
      "en",
    );

    expect(slugs).toEqual([
      "active-learning-guided-data-collection",
      "budgeting-a-dataset-collection-program",
      "el-impacto-de-los-modelos-open-weights-chinos-en-el-mercado-de-dataset",
      "how-much-data-to-fine-tune-a-model",
      "how-we-review-contributor-quality-signals",
      "launching-caudals-clearer-dataset-operations",
      "operational-playbooks-for-multimodal-datasets",
      "preference-data-rlhf",
      "proprietary-datasets-ml",
      "synthetic-vs-human-data",
    ]);
    expect(adjacent.next?.slug).toBe("preference-data-rlhf");
    expect(adjacent.previous?.slug).toBe(
      "how-much-data-to-fine-tune-a-model",
    );
  });
});
