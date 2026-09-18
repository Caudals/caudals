export class ConnectorRateLimit {
  private starts: number[] = [];
  private active = 0;
  constructor(private readonly requestsPerMinute: number, private readonly concurrent: number, private readonly now = () => Date.now()) {
    if (!Number.isInteger(requestsPerMinute) || requestsPerMinute < 1 || !Number.isInteger(concurrent) || concurrent < 1) throw new Error("invalid_rate_limit");
  }
  async run<T>(operation: () => Promise<T>): Promise<T> {
    const cutoff = this.now() - 60_000;
    this.starts = this.starts.filter((value) => value > cutoff);
    if (this.active >= this.concurrent) throw new Error("target_concurrency_limited");
    if (this.starts.length >= this.requestsPerMinute) throw new Error("target_rate_limited");
    this.active++; this.starts.push(this.now());
    try { return await operation(); } finally { this.active--; }
  }
}
