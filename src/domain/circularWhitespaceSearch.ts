export interface CircularWhitespaceCenterProposalInput {
  center: { x: number; y: number };
  radius: number;
  width: number;
  height: number;
  bottomReservedPx: number;
  bounds: { left: number; right: number; top: number; bottom: number };
}

/** Suggests one bounded center shift toward the side with more free space. */
export function proposeCircularWhitespaceCenter({
  center,
  radius,
  width,
  height,
  bottomReservedPx,
  bounds,
}: CircularWhitespaceCenterProposalInput): { x: number; y: number } | undefined {
  const values = [center.x, center.y, radius, width, height, bottomReservedPx,
    bounds.left, bounds.right, bounds.top, bounds.bottom];
  if (!values.every(Number.isFinite) || radius < 0 || width <= 0 || height <= 0) return undefined;

  const padding = 10;
  const usableBottom = height - Math.max(0, bottomReservedPx);
  const minX = padding + radius;
  const maxX = width - padding - radius;
  const minY = padding + radius;
  const maxY = usableBottom - padding - radius;
  if (minX > maxX || minY > maxY) return undefined;

  const slack = {
    left: bounds.left - padding,
    right: width - padding - bounds.right,
    top: bounds.top - padding,
    bottom: usableBottom - padding - bounds.bottom,
  };
  const xImbalance = slack.right - slack.left;
  const yImbalance = slack.bottom - slack.top;
  const xMagnitude = Math.abs(xImbalance);
  const yMagnitude = Math.abs(yImbalance);
  const minimumImbalance = Math.max(24, 0.15 * radius);
  if (Math.max(xMagnitude, yMagnitude) < minimumImbalance) return undefined;

  // Select a single dominant axis. Ties favor vertical movement for stable behavior.
  const useVertical = yMagnitude >= xMagnitude;
  const imbalance = useVertical ? yImbalance : xImbalance;
  const proposedShift = Math.sign(imbalance) * Math.min(0.7 * Math.abs(imbalance), 0.5 * radius);
  if (Math.abs(proposedShift) < 12) return undefined;

  if (useVertical) {
    const y = Math.max(minY, Math.min(maxY, center.y + proposedShift));
    if (Math.abs(y - center.y) < 12) return undefined;
    return { x: center.x, y };
  }
  const x = Math.max(minX, Math.min(maxX, center.x + proposedShift));
  if (Math.abs(x - center.x) < 12) return undefined;
  return { x, y: center.y };
}
