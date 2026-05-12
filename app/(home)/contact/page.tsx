import { ContactPageContent } from "@/components/contact/contact-page-content";
import { buildPublicMetadata } from "@/lib/seo";

type ContactPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readPrefixedId(value: string | undefined, prefix: string) {
  if (!value) {
    return undefined;
  }

  return new RegExp(`^${prefix}_[0-9A-HJKMNP-TV-Z]{10,}$`).test(value)
    ? value
    : undefined;
}

export const metadata = buildPublicMetadata({
  title: "Contact Caudals",
  description:
    "Start a conversation with Caudals about dataset operations, pilot scope, and commercial fit.",
  pathname: "/contact",
});

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const params = (await searchParams) ?? {};

  return (
    <ContactPageContent
      catalogueListingId={readPrefixedId(firstSearchParam(params.dataset), "cl")}
      requestedDatasetId={readPrefixedId(firstSearchParam(params.brief), "ds")}
    />
  );
}
