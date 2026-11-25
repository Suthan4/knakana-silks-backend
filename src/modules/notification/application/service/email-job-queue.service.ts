import { Prisma } from "@/generated/prisma/client.js";
import type { EmailJobInput } from "./product-request-email.templates.js";

/**
 * Transactional email outbox.
 * Jobs are committed with the business change, then delivered by EmailJobWorker.
 */
export async function enqueueEmailJobs(
  transaction: Prisma.TransactionClient,
  jobs: EmailJobInput[],
): Promise<void> {
  for (const job of jobs) {
    if (!job.recipient?.trim()) continue;

    await transaction.$executeRaw`
      INSERT INTO "email_jobs" ("recipient", "subject", "html")
      VALUES (${job.recipient.trim()}, ${job.subject}, ${job.html})
    `;
  }
}
