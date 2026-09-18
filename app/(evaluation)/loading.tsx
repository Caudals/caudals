import { Status } from "@/components/evals/primitives";
import { t } from "@/lib/evals/messages/en";
export default function Loading() {
  return <Status>{t("loading")}</Status>;
}
