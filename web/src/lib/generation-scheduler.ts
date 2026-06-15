"use client";

type QueueEntry = {
    task: () => Promise<unknown>;
    limit: number;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
};

class GenerationScheduler {
    private active = 0;
    private queue: QueueEntry[] = [];

    submit<T>(task: () => Promise<T>, limit: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push({ task, limit, resolve: resolve as (value: unknown) => void, reject });
            this.flush();
        });
    }

    private flush() {
        while (this.queue.length > 0) {
            const maxConcurrent = Math.max(1, ...this.queue.map((entry) => entry.limit));
            if (this.active >= maxConcurrent) break;
            const entry = this.queue.shift()!;
            this.active++;
            entry
                .task()
                .then(entry.resolve, entry.reject)
                .finally(() => {
                    this.active--;
                    this.flush();
                });
        }
    }
}

export const generationScheduler = new GenerationScheduler();
