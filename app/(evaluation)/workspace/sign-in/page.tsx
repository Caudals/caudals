import { evalsPageMessages } from "@/components/evals/page-messages";
import { EvaluationSignIn } from "@/components/evals/sign-in";
import { directSignupEnabled } from "@/lib/evals/signup";
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      {await evalsPageMessages(["workspace/sign-in"])}
      <EvaluationSignIn
      next={typeof params.next === "string" ? params.next : undefined}
      // Read at request time (launch L-05): "New here? Create a free account".
      directSignup={directSignupEnabled()}
      />
    </>
  );
}
