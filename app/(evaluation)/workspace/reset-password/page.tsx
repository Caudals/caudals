import { evalsPageMessages } from "@/components/evals/page-messages";
import { EvaluationResetPassword } from "@/components/evals/reset-password";
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; token?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      {await evalsPageMessages(["workspace/reset-password"])}
      <EvaluationResetPassword
        next={typeof params.next === "string" ? params.next : undefined}
        token={typeof params.token === "string" ? params.token : undefined}
        invalid={!!params.error}
      />
    </>
  );
}
