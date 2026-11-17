// おすすめ 9マス: which post each square shows, and which comes next.
// Three pools by how well known the town is — 定番 (famous), 注目 (in
// between), 穴場 (little known) — fill 2, 3 and 4 squares, spread over the
// 3×3. A pool too small for its squares borrows from the nearest pool.
export type Tier = "famous" | "middle" | "hidden";
export type Pools<T> = Record<Tier, T[]>;
export interface Cell<T> {
  item: T;
  /** The pool the post came from (it can differ from the square's own when borrowed). */
  tier: Tier;
}

/** Each square's pool, row by row: 2 定番, 3 注目, 4 穴場. */
export const GRID_LAYOUT: readonly Tier[] = ["famous", "hidden", "middle", "hidden", "middle", "hidden", "middle", "famous", "hidden"];

const BORROW: Record<Tier, Tier[]> = {
  famous: ["famous", "middle", "hidden"],
  middle: ["middle", "hidden", "famous"],
  hidden: ["hidden", "middle", "famous"],
};

export class GridRotation<T extends { id: string }> {
  private next: Record<Tier, number> = { famous: 0, middle: 0, hidden: 0 };
  private pools: Pools<T>;
  constructor(pools: Pools<T>) {
    this.pools = pools;
  }

  /** The next post for a square of this tier that isn't already on screen. */
  take(tier: Tier, onScreen: Set<string>): Cell<T> | null {
    for (const from of BORROW[tier]) {
      const pool = this.pools[from];
      for (let tries = 0; tries < pool.length; tries++) {
        const item = pool[this.next[from] % pool.length];
        this.next[from] = (this.next[from] + 1) % pool.length;
        if (!onScreen.has(item.id)) return { item, tier: from };
      }
    }
    return null;
  }

  /** The first nine. */
  fill(layout: readonly Tier[] = GRID_LAYOUT): (Cell<T> | null)[] {
    const onScreen = new Set<string>();
    return layout.map((tier) => {
      const cell = this.take(tier, onScreen);
      if (cell) onScreen.add(cell.item.id);
      return cell;
    });
  }

  /** How many different posts there are to show. */
  get size() {
    return this.pools.famous.length + this.pools.middle.length + this.pools.hidden.length;
  }
}

/** The order squares change in: every square once, shuffled, then again. */
export function swapOrder(count: number, random: () => number = Math.random): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
