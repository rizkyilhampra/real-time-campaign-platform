### 1\. Critical Logic Flaw in Job Completion Handling

This is the most significant issue I found upon deeper inspection.

**Location:** `src/worker/worker.ts`

**The Code:**
The worker has event listeners for `completed` and `failed` jobs. Both listeners execute this logic:

```typescript
const remainingJobs = await redis.decr(`blast:${blastId}:remaining`);
if (remainingJobs === 0) {
  await redisPublisher.publish(
    'blast:completed',
    JSON.stringify({ blastId })
  );
  await redis.del(`blast:${blastId}:remaining`);
}
```

**The Flaw:**
The application is configured to retry failed jobs (`attempts: 3` in `src/shared/jobs.ts`). The current logic decrements the `remaining` counter on *every* failure. If a job fails, the counter goes down. When BullMQ retries the job and it eventually succeeds, the counter is decremented *again* for the `completed` event.

This means a single job that fails twice before succeeding will decrement the counter three times. This will cause the `blast:completed` event to be published prematurely, long before all messages have actually been sent, fundamentally breaking the progress tracking feature.

**💡 Recommendation:**
Only decrement the counter when a job has permanently succeeded or permanently failed.

1.  Remove the decrementing logic from the `'failed'` event listener entirely.
2.  In the `'failed'` listener, check if the job has exhausted all its retry attempts. BullMQ provides this information. Only if it's the final failure should you then decrement the counter. A simpler approach is to only decrement on `'completed'`. The business logic needs to decide if a failed job (after all retries) counts towards completion. The cleanest approach is to only count successful sends.

### 2\. Implementation Fragility and Potential Edge Cases

The code makes assumptions that can easily break with dependency updates or unexpected data.

**Location:** `src/worker/services/SessionManager.ts`

**The Code:**

```typescript
if (!(err instanceof Error && err.message === 'Intentional Logout')) {
    logger.error({ err }, `Failed to logout session ${sessionId}`);
}
```

**The Flaw:**
The logic to suppress an error during logout relies on checking for a specific string in the error message: `'Intentional Logout'`. If the `@whiskeysockets/baileys` library changes this error message in a future version (which is common in community-driven projects), this check will fail, and your system will start logging legitimate logouts as critical errors.

**💡 Recommendation:**
Rely on error codes or types if the library provides them. If not, the current method is a necessary evil, but it should be heavily commented with a warning that it is fragile and must be checked every time the Baileys dependency is updated.

-----

**Location:** `src/api/controllers/blast.controller.ts`

**The Code:**

```typescript
const uniqueRecipients = Array.from(
  new Map(recipients.map((r) => [r.phone, r])).values()
);
```

**The Flaw:**
This elegantly deduplicates recipients based on phone number. However, it implicitly decides which data to keep when a duplicate phone number is found: the one that appears *last* in the combined list wins. If an Excel file contains `phone: 123, name: 'John'` and the campaign data contains `phone: 123, name: 'Jonathan'`, the name used will depend on the order of operations. This business logic is implicit and potentially unpredictable.

**💡 Recommendation:**
Make the deduplication strategy explicit. State the business rule (e.g., "Data from the uploaded Excel file will always override campaign data for the same phone number"). Then, implement the code to enforce that rule, for example by processing the campaign recipients first and the file recipients second, ensuring the file data overwrites the campaign data in the `Map`.

### 3\. Operational Oversights and Misconfigurations

These are issues that will likely cause problems in a real production environment.

**Location:** `src/worker/services/CampaignScheduler.ts`

**The Code:**

```typescript
cron.schedule('0 2 * * *', () => { ... });
```

**The Flaw:**
The job is scheduled for 2 AM. But in which timezone? `node-cron` uses the server's local timezone. A Docker container, by default, runs in UTC. If your business operates in Indonesia (WIB, UTC+7), this job will run at 9 AM local time, not 2 AM as intended. This is a very common operational mistake.

**💡 Recommendation:**
Either configure the `cron.schedule` function to use a specific timezone (it has options for this) or explicitly set the `TZ` environment variable in your Dockerfile and `docker-compose.yml` to match your operational timezone (e.g., `TZ=Asia/Jakarta`).

-----

**Location:** `src/worker/worker.ts`

**The Code:**

```typescript
const worker = new Worker<MessageJobData>(
  MESSAGE_QUEUE_NAME,
  processMessageJob,
  {
    connection: redis,
    concurrency: 10,
    limiter: {
      max: 5,
      duration: 1000,
    },
  }
);
```

**The Flaw:**
You have configured a `concurrency` of 10 and a `limiter` of 5 jobs per second. This means that at any given moment, up to 10 jobs can be processed in parallel, but the group as a whole is limited to starting only 5 new jobs per second. While not a bug, this configuration is unusual. The high concurrency is throttled by the lower rate limit, meaning 5 of your concurrent workers will likely be idle after the first second of processing a large batch. This might be intentional, but it also might be an unoptimized configuration that doesn't align with WhatsApp's actual sending limits, which can lead to getting your number blocked.

**💡 Recommendation:**
Re-evaluate this configuration. A lower concurrency that more closely matches the rate limit (e.g., `concurrency: 5`) might be more efficient and predictable. The rate limit should be carefully tuned based on testing and observation of the WhatsApp account's behavior to avoid being flagged for spam.
