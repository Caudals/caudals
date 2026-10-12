import { EvaluationSignIn } from "@/components/evals/sign-in";
import { directSignupEnabled } from "@/lib/evals/signup";
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return (
    <EvaluationSignIn
      next={typeof params.next === "string" ? params.next : undefined}
      // Read at request time (launch L-05): "New here? Create a free account".
      directSignup={directSignupEnabled()}
    />
  );
}
