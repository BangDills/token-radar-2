// Valuation model for token-radar bounty (make.fun token-radar-01)
// Deterministic valuation based on snapshot data: TVL, category multiples, growth, maturity, and chains.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ValuedProtocol {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number;
  is_watchlist: boolean;
  sector_multiple: number;
  growth_factor: number;
  maturity_factor: number;
  chain_factor: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

// Category sector multiples (Mcap/TVL benchmarks calibrated against liquid protocols)
export function getSectorMultiple(category: string | null): number {
  if (!category) return 0.22;
  const cat = category.toLowerCase().trim();
  if (cat.includes('ai agent') || cat.includes('decentralized ai')) return 0.50;
  if (cat.includes('derivative') || cat.includes('option') || cat.includes('interest rate')) return 0.45;
  if (cat.includes('dex') || cat.includes('launchpad')) return 0.35;
  if (cat.includes('basis')) return 0.32;
  if (cat.includes('rwa') || cat.includes('synthetic')) return 0.25;
  if (cat.includes('cdp')) return 0.24;
  if (cat.includes('lending') || cat.includes('collateral')) return 0.20;
  if (cat.includes('bridge')) return 0.18;
  if (cat.includes('risk curator')) return 0.18;
  if (cat.includes('yield') || cat.includes('farm')) return 0.16;
  if (cat.includes('stak') || cat.includes('restak') || cat.includes('anchor btc') || cat.includes('decentralized btc')) return 0.12;
  return 0.22;
}

// Growth factor: F_g = 1 + clamp(change_7d, -50, 100)/100 * 0.40
export function getGrowthFactor(change_7d: number | null): number {
  if (change_7d === null || change_7d === undefined || isNaN(change_7d)) return 1.0;
  const clamped = Math.max(-50, Math.min(100, change_7d));
  return 1 + (clamped / 100) * 0.40;
}

// Maturity factor based on days since listed_at:
// bootstrap 0–90 d: 0.70→0.90
// growth 90–240 d: 0.90→1.15
// prime TGE window 240–540 d: 1.15→1.25
// late 540–900 d: 1.25→1.10
// dormant >900 d: 0.95–1.05
export function getMaturityFactor(ageDays: number): number {
  if (ageDays <= 90) {
    return 0.70 + (ageDays / 90) * (0.90 - 0.70);
  } else if (ageDays <= 240) {
    return 0.90 + ((ageDays - 90) / 150) * (1.15 - 0.90);
  } else if (ageDays <= 540) {
    return 1.15 + ((ageDays - 240) / 300) * (1.25 - 1.15);
  } else if (ageDays <= 900) {
    return 1.25 - ((ageDays - 540) / 360) * (1.25 - 1.10);
  } else {
    // Smooth decay towards 0.95 for older protocols
    const decay = ((ageDays - 900) / 1000) * 0.08;
    return Math.max(0.95, 1.05 - decay);
  }
}

// Chain diversity factor: F_c = 1 + min(0.15, max(0, chains - 1) * 0.025)
export function getChainFactor(chains: string[]): number {
  const count = Array.isArray(chains) ? chains.length : 1;
  return 1 + Math.min(0.15, Math.max(0, count - 1) * 0.025);
}

// Calculate days between snapshot as_of and listed_at
export function calculateAgeDays(asOf: string, listedAt: string | null): number {
  if (!listedAt) return 365; // Unknown age treated as 365 d
  const asOfTs = new Date(asOf).getTime();
  const listedTs = new Date(listedAt).getTime();
  if (isNaN(asOfTs) || isNaN(listedTs)) return 365;
  const days = Math.floor((asOfTs - listedTs) / (1000 * 86400));
  return Math.max(0, days);
}

// Concrete, data-driven farm plan generator tailored to protocol specifics and economics
export function generateFarmSteps(p: SnapshotProtocol, ageDays: number): string[] {
  const primaryChain = p.chains && p.chains.length > 0 ? p.chains[0] : 'Ethereum';
  const category = (p.category || 'DeFi').toLowerCase();
  const tvlMil = (p.tvl_usd / 1_000_000).toFixed(1);
  const name = p.name;

  const steps: string[] = [];

  // Step 1: Wallet setup, bridging, and gas provisioning
  if (primaryChain.toLowerCase() === 'ethereum') {
    steps.push(`Fund primary Web3 wallet with 0.20–0.50 ETH on Ethereum Mainnet; reserve $35 for contract approvals and batch gas execution fees.`);
  } else if (primaryChain.toLowerCase() === 'solana') {
    steps.push(`Setup dedicated Phantom/Backpack wallet with 2.0 SOL on Solana mainnet; reserve 0.15 SOL for state accounts and priority fee bursts (<$0.02/tx).`);
  } else {
    steps.push(`Bridge $400+ USDC or WETH to ${primaryChain} via canonical bridge; hold $20 in native gas tokens for multi-week execution overhead.`);
  }

  // Step 2: Core protocol liquidity interaction tailored by financial sector
  if (category.includes('lending') || category.includes('collateral')) {
    steps.push(`Supply $500–$2,500 USDC or wstETH collateral into ${name}'s verified core market ($${tvlMil}M TVL); borrow 30–40% LTV in low-volatility assets to maximize utilization scoring.`);
  } else if (category.includes('dex') || category.includes('launchpad')) {
    steps.push(`Provide $500+ concentrated liquidity into ${name}'s top volume pair on ${primaryChain}; maintain active in-range price ticks to accumulate fee yield and trading volume score.`);
  } else if (category.includes('derivative') || category.includes('option') || category.includes('basis') || category.includes('interest rate')) {
    steps.push(`Establish a delta-neutral hedged position with $400–$1,500 margin on ${name}; roll contracts every two weeks to maintain continuous open interest across funding rate cycles.`);
  } else if (category.includes('cdp')) {
    steps.push(`Mint native debt token against over-collateralized ETH on ${name}; deposit 80% of minted balance into stability pool for dual liquidation fee and token accrual.`);
  } else if (category.includes('ai agent') || category.includes('decentralized ai')) {
    steps.push(`Stake $350+ into ${name}'s decentralized inference or coordination nodes on ${primaryChain} to log verified agent work proofs and epoch reward vouchers.`);
  } else if (category.includes('stak') || category.includes('restak')) {
    steps.push(`Delegate $500+ into ${name}'s validator/operator cluster on ${primaryChain}; opt into active AVS validation sets to maximize eligibility across ecosystem drops.`);
  } else {
    steps.push(`Deposit $450+ into ${name}'s flagship auto-compounding vault on ${primaryChain}; maintain deposit without withdrawal to establish organic capital longevity.`);
  }

  // Step 3: Multi-chain dispersion or retention gate clearance
  if (p.chains.length > 1) {
    const secondChain = p.chains[1];
    steps.push(`Deploy secondary position ($200+) on ${secondChain} within 14 days to clear multi-network user qualification heuristics and ecosystem synergy quotas.`);
  } else {
    steps.push(`Maintain minimum 60-day continuous deposit tenure without early withdrawal to safely clear anti-sybil and anti-mercenary retention filters.`);
  }

  // Step 4: Governance snapshot participation and regular epoch cadence
  if (ageDays >= 240 && ageDays <= 540) {
    steps.push(`Actively participate in monthly Snapshot voting and testnet feedback rounds during this prime TGE window (age ${ageDays}d; estimated $2-$5 total gas cost).`);
  } else {
    steps.push(`Execute bi-weekly routine interactions (rebalance, harvest, or micro-swap) over 8+ consecutive weeks to log consistent active user activity.`);
  }

  return steps;
}

// Score a protocol using the radar value model
export function scoreProtocol(p: SnapshotProtocol, asOf: string, isWatchlist: boolean): ValuedProtocol {
  const ageDays = calculateAgeDays(asOf, p.listed_at);
  const sectorMultiple = getSectorMultiple(p.category);
  const growthFactor = getGrowthFactor(p.change_7d);
  const maturityFactor = getMaturityFactor(ageDays);
  const chainFactor = getChainFactor(p.chains);

  const rawVal = p.tvl_usd * sectorMultiple * growthFactor * maturityFactor * chainFactor;
  const impliedValueUsd = Math.max(1, Math.min(100_000_000_000_000, Math.round(rawVal)));
  const farmSteps = generateFarmSteps(p, ageDays);

  return {
    slug: p.slug,
    name: p.name,
    category: p.category || 'General DeFi',
    chains: p.chains || [],
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
    age_days: ageDays,
    is_watchlist: isWatchlist,
    sector_multiple: sectorMultiple,
    growth_factor: growthFactor,
    maturity_factor: maturityFactor,
    chain_factor: chainFactor,
    implied_value_usd: impliedValueUsd,
    farm_steps: farmSteps,
  };
}
