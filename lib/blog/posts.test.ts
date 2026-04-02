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

    expect(posts).toHaveLength(5);
    expect(posts[0]?.slug).toBe("budgeting-a-dataset-collection-program");
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
      "operational-playbooks-for-multimodal-datasets",
      "en",
    );

    expect(slugs).toEqual([
      "budgeting-a-dataset-collection-program",
      "how-we-review-contributor-quality-signals",
      "launching-caudals-clearer-dataset-operations",
      "operational-playbooks-for-multimodal-datasets",
      "synthetic-vs-human-data",
    ]);
    expect(adjacent.next?.slug).toBe("launching-caudals-clearer-dataset-operations");
    expect(adjacent.previous?.slug).toBe(
      "how-we-review-contributor-quality-signals",
    );
  });
});
