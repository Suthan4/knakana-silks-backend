import { injectable, inject } from "tsyringe";
import { PrismaClient } from "@/generated/prisma/client.js";
import { EmailService } from "./email.service.js";

interface ClaimedEmailJob {
  id: bigint;
  recipient: string;
  subject: string;
  html: string;
  attempts: number;
}

@injectable()
export class EmailJobWorker {
  private running = false;
  private timer?: NodeJS.Timeout;
  private processing = false;

  private readonly batchSize = 10;
  private readonly pollIntervalMs = 5_000;
  private readonly maxAttempts = 5;

  constructor(
    @inject(PrismaClient) private prisma: PrismaClient,
    @inject(EmailService) private emailService: EmailService,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    console.info("[EMAIL_WORKER] Started");
    void this.runLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    console.info("[EMAIL_WORKER] Waiting for in-flight email batch to finish");
    while (this.processing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.info("[EMAIL_WORKER] Stopped");
  }

  private async runLoop(): Promise<void> {
    if (!this.running) return;

    try {
      if (!this.processing) {
        this.processing = true;
        await this.processBatch();
      }
    } catch (error) {
      console.error("[EMAIL_WORKER] Batch failed:", error);
    } finally {
      this.processing = false;
      if (this.running) {
        this.timer = setTimeout(() => void this.runLoop(), this.pollIntervalMs);
        this.timer.unref();
      }
    }
  }

  private async claimJobs(): Promise<ClaimedEmailJob[]> {
    return this.prisma.$transaction(async (tx) => {
      return tx.$queryRaw<ClaimedEmailJob[]>`
        WITH candidates AS (
          SELECT "id"
          FROM "email_jobs"
          WHERE
            ("status" = 'PENDING' AND "next_attempt_at" <= NOW())
            OR
            ("status" = 'PROCESSING' AND "locked_at" < NOW() - INTERVAL '10 minutes')
          ORDER BY "created_at" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${this.batchSize}
        )
        UPDATE "email_jobs" AS jobs
        SET
          "status" = 'PROCESSING',
          "attempts" = jobs."attempts" + 1,
          "locked_at" = NOW()
        FROM candidates
        WHERE jobs."id" = candidates."id"
        RETURNING jobs."id", jobs."recipient", jobs."subject", jobs."html", jobs."attempts"
      `;
    });
  }

  private async processBatch(): Promise<void> {
    const jobs = await this.claimJobs();

    for (const job of jobs) {
      try {
        await this.emailService.sendEmail({
          to: job.recipient,
          subject: job.subject,
          html: job.html,
        });

        await this.prisma.$executeRaw`
          UPDATE "email_jobs"
          SET
            "status" = 'SENT',
            "sent_at" = NOW(),
            "locked_at" = NULL,
            "last_error" = NULL
          WHERE "id" = ${job.id}
        `;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown email delivery error";
        const permanentlyFailed = job.attempts >= this.maxAttempts;
        const retryDelayMs = Math.min(
          60 * 60 * 1000,
          15_000 * 2 ** Math.max(0, job.attempts - 1),
        );
        const retryAt = new Date(Date.now() + retryDelayMs);

        await this.prisma.$executeRaw`
          UPDATE "email_jobs"
          SET
            "status" = ${permanentlyFailed ? "FAILED" : "PENDING"},
            "next_attempt_at" = ${retryAt},
            "locked_at" = NULL,
            "last_error" = ${message.slice(0, 2000)}
          WHERE "id" = ${job.id}
        `;

        console.error("[EMAIL_WORKER] Delivery failed", {
          jobId: job.id.toString(),
          recipient: job.recipient,
          attempt: job.attempts,
          permanentlyFailed,
          error: message,
        });
      }
    }
  }
}
