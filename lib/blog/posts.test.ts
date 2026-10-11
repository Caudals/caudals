import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  getAllBlogSlugs,
  getAdjacentBlogPosts,
  getBlogPost,
  getBlogPosts,
} from "@/lib/blog/posts";

// The repository ships no bundled posts (the archive lives in Caudals Ops), so
// the loader is exercised against fixtures that keep the real MDX contract.
beforeAll(() => {
  process.env.BLOG_CONTENT_ROOT = path.join(process.cwd(), "tests", "fixtures", "blog");
});

describe("blog content loader", () => {
  it("returns localized posts ordered by publish date", async () => {
    const posts = await getBlogPosts("en");
    const publishedTimes = posts.map((post) => +new Date(post.publishedAt));

    expect(posts).toHaveLength(3);
    expect(posts[0]?.slug).toBe("active-learning-guided-data-collection");
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
      "operational-playbooks-for-multimodal-datasets",
      "en",
    );

    expect(slugs).toEqual([
      "active-learning-guided-data-collection",
      "launching-caudals-clearer-dataset-operations",
      "operational-playbooks-for-multimodal-datasets",
    ]);
    expect(adjacent.next?.slug).toBe("active-learning-guided-data-collection");
    expect(adjacent.previous?.slug).toBe(
      "launching-caudals-clearer-dataset-operations",
    );
  });
});
