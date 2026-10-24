/** Percentage of two amounts in the same currency, rounded to one decimal. */
export function percentage(value: string | number | null | undefined, total: string | number | null | undefined): string | null {
  const parse = (input: typeof value) => {
    if (input === null || input === undefined) return null;
    const match = String(input).match(/^(-?)(\d+)(?:\.(\d+))?$/);
    return match ? { units: BigInt(match[2] + (match[3] || '')) * (match[1] ? -1n : 1n), scale: 10n ** BigInt((match[3] || '').length) } : null;
  };
  const numerator = parse(value), denominator = parse(total);
  if (!numerator || !denominator || denominator.units <= 0n) return null;
  const raw = numerator.units * denominator.scale * 1000n;
  const divisor = denominator.units * numerator.scale;
  const rounded = ((raw < 0n ? -raw : raw) + divisor / 2n) / divisor;
  return `${raw < 0n && rounded ? '-' : ''}${rounded / 10n}.${rounded % 10n}%`;
}
