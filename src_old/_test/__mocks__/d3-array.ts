export const quantile = jest
  .fn()
  .mockImplementation((arr: number[], p: number) => {
    const sorted = arr.sort((a, b) => a - b);
    const index = p * (sorted.length - 1);
    return sorted[Math.floor(index)];
  });
