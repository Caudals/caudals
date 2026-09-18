/** Currency is represented as decimal strings and integer nano-units, never floats. */
const SCALE = BigInt(1_000_000_000);
export function units(value: string): bigint {
  if (!/^(0|[1-9]\d{0,14})(\.\d{1,9})?$/.test(value)) throw new Error('invalid_decimal');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(9, '0'));
}
export function decimal(value: bigint): string {
  if (value < BigInt(0)) throw new Error('negative_money');
  return `${value / SCALE}.${(value % SCALE).toString().padStart(9, '0')}`;
}
export interface Price {
  input_price: string; output_price: string; cache_price: string; tool_price: string; uncertainty_bps: number;
}
export function priceUsage(price: Price, input: number, output: number, cached = 0, tools = 0): string {
  for (const n of [input, output, cached, tools]) if (!Number.isSafeInteger(n) || n < 0) throw new Error('invalid_usage');
  if (cached > input) throw new Error('invalid_cached_usage');
  return decimal(BigInt(input - cached) * units(price.input_price) + BigInt(cached) * units(price.cache_price) + BigInt(output) * units(price.output_price) + BigInt(tools) * units(price.tool_price));
}
export function worstCase(price: Price, input: number, output: number): string {
  // Cache can cost more than uncached input; reserve the higher tariff.
  const p = {...price, input_price: units(price.cache_price) > units(price.input_price) ? price.cache_price : price.input_price};
  const base = units(priceUsage(p, input, output));
  return decimal((base * BigInt(10000 + price.uncertainty_bps) + BigInt(9999)) / BigInt(10000));
}
