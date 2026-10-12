export function scrubString(value: string): string;
export function scrubValue<T>(value: T, depth?: number): T;
export function scrubUrl(value: string | undefined): string | undefined;
export function scrubEvent<T>(event: T): T;
export function scrubBreadcrumb<T>(breadcrumb: T): T | null;
