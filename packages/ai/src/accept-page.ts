import { DistilledPageSchema, type DistilledPage } from "@autoapply/core";

export function acceptPage(page: DistilledPage): DistilledPage {
  return DistilledPageSchema.parse(page);
}
