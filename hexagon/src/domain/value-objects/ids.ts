export class RequestId {
  private constructor(private readonly value: string) {}

  static create(): RequestId {
    return new RequestId(crypto.randomUUID());
  }

  static fromString(value: string): RequestId {
    if (!value || typeof value !== 'string') {
      throw new Error('Invalid request ID');
    }
    return new RequestId(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: RequestId): boolean {
    return this.value === other.value;
  }
}

export class WorkerId {
  private constructor(private readonly value: string) {}

  static create(): WorkerId {
    return new WorkerId(crypto.randomUUID());
  }

  static fromString(value: string): WorkerId {
    if (!value || typeof value !== 'string') {
      throw new Error('Invalid worker ID');
    }
    return new WorkerId(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: WorkerId): boolean {
    return this.value === other.value;
  }
}

export class CorrelationId {
  private constructor(private readonly value: string) {}

  static create(): CorrelationId {
    return new CorrelationId(crypto.randomUUID());
  }

  static fromString(value: string): CorrelationId {
    if (!value || typeof value !== 'string') {
      throw new Error('Invalid correlation ID');
    }
    return new CorrelationId(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: CorrelationId): boolean {
    return this.value === other.value;
  }
}
