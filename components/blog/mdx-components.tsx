import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { blogMediaFrameClassName } from "@/components/blog/media-frame";
import { YouTubeEmbed } from "@/components/blog/youtube-embed";
import { DataBudgetCalculator } from "@/components/blog/dataset-budget-calculator";
import { slugifyHeading } from "@/lib/blog/shared";
import { cn } from "@/lib/utils";

function extractText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(extractText).join("");
  }
  if (children && typeof children === "object" && "props" in children) {
    const node = children as { props?: { children?: ReactNode } };
    return extractText(node.props?.children ?? "");
  }
  return "";
}

function Heading({
  as: Tag,
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"h2"> & {
  as: "h2" | "h3";
}) {
  const text = extractText(children);
  const id = slugifyHeading(text);
  return (
    <Tag id={id} className={className} {...props}>
      {children}
    </Tag>
  );
}

type CalloutProps = {
  children: ReactNode;
  title?: string;
};

function Callout({ children, title }: CalloutProps) {
  return (
    <aside className="my-8 border-l-2 border-black pl-6 py-2 text-black">
      {title ? (
        <p className="mb-2 text-xs font-medium uppercase tracking-widest">
          {title}
        </p>
      ) : null}
      <div className="space-y-4 leading-relaxed text-lg">
        {children}
      </div>
    </aside>
  );
}

export const mdxComponents = {
  Callout,
  a: ({ className, href = "", ...props }: ComponentPropsWithoutRef<"a">) => {
    const classes = cn(
      "font-normal text-black underline decoration-gray-300 underline-offset-4 transition-colors hover:decoration-black",
      className,
    );
    if (href.startsWith("/")) {
      return <Link href={href} className={classes} {...props} />;
    }
    return <a className={classes} href={href} rel="noreferrer" target="_blank" {...props} />;
  },
  blockquote: ({ className, ...props }: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className={cn("my-8 border-l border-gray-300 pl-6 text-2xl font-light italic text-gray-600", className)}
      {...props}
    />
  ),
  code: ({ className, ...props }: ComponentPropsWithoutRef<"code">) => (
    <code
      className={cn("rounded-sm bg-gray-100 px-1.5 py-0.5 text-[0.85em] font-mono text-black", className)}
      {...props}
    />
  ),
  h2: ({ className, ...props }: ComponentPropsWithoutRef<"h2">) => (
    <Heading
      as="h2"
      className={cn("mt-16 mb-6 scroll-mt-28 text-3xl font-normal tracking-tight text-black", className)}
      {...props}
    />
  ),
  h3: ({ className, ...props }: ComponentPropsWithoutRef<"h3">) => (
    <Heading
      as="h3"
      className={cn("mt-12 mb-4 scroll-mt-28 text-2xl font-normal tracking-tight text-black", className)}
      {...props}
    />
  ),
  hr: ({ className, ...props }: ComponentPropsWithoutRef<"hr">) => (
    <hr className={cn("my-12 border-t border-gray-200", className)} {...props} />
  ),
  li: ({ className, ...props }: ComponentPropsWithoutRef<"li">) => (
    <li className={cn("pl-2 text-lg leading-relaxed text-black mb-2", className)} {...props} />
  ),
  ol: ({ className, ...props }: ComponentPropsWithoutRef<"ol">) => (
    <ol className={cn("my-6 list-decimal space-y-2 pl-6 marker:text-gray-400", className)} {...props} />
  ),
  p: ({ className, ...props }: ComponentPropsWithoutRef<"p">) => (
    <p className={cn("mb-6 text-lg leading-relaxed text-black", className)} {...props} />
  ),
  pre: ({ className, ...props }: ComponentPropsWithoutRef<"pre">) => (
    <pre
      className={cn("my-8 overflow-x-auto rounded-none border border-gray-200 bg-gray-50 p-6 text-sm text-black", className)}
      {...props}
    />
  ),
  strong: ({ className, ...props }: ComponentPropsWithoutRef<"strong">) => (
    <strong className={cn("font-medium text-black", className)} {...props} />
  ),
  table: ({ className, ...props }: ComponentPropsWithoutRef<"table">) => (
    <div className="my-8 overflow-x-auto">
      <table className={cn("min-w-full border-collapse text-left text-sm", className)} {...props} />
    </div>
  ),
  tbody: ({ className, ...props }: ComponentPropsWithoutRef<"tbody">) => (
    <tbody className={cn("divide-y divide-gray-200", className)} {...props} />
  ),
  td: ({ className, ...props }: ComponentPropsWithoutRef<"td">) => (
    <td className={cn("py-4 pr-4 align-top text-black", className)} {...props} />
  ),
  th: ({ className, ...props }: ComponentPropsWithoutRef<"th">) => (
    <th
      className={cn("border-b border-black py-4 pr-4 align-bottom font-medium uppercase tracking-widest text-xs text-gray-500", className)}
      {...props}
    />
  ),
  ul: ({ className, ...props }: ComponentPropsWithoutRef<"ul">) => (
    <ul className={cn("my-6 list-disc space-y-2 pl-6 marker:text-gray-300", className)} {...props} />
  ),
  img: ({ className, alt, ...props }: ComponentPropsWithoutRef<"img">) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={cn(
        `${blogMediaFrameClassName} object-cover grayscale-[50%] contrast-125`,
        className,
      )}
      alt={alt}
      {...props}
    />
  ),
  video: ({ className, ...props }: ComponentPropsWithoutRef<"video">) => (
    <video
      className={cn(`${blogMediaFrameClassName} object-cover`, className)}
      controls
      {...props}
    />
  ),
  iframe: ({ className, ...props }: ComponentPropsWithoutRef<"iframe">) => (
    <div className={cn(`${blogMediaFrameClassName} overflow-hidden`, className)}>
      <iframe
        className="block aspect-video w-full"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        {...props}
      />
    </div>
  ),
  YouTube: YouTubeEmbed,
  DataBudgetCalculator,
};
