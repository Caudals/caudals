import { EvaluationSignIn } from "@/components/evals/sign-in";
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return (
    <EvaluationSignIn
      next={typeof params.next === "string" ? params.next : undefined}
    />
  );
}
