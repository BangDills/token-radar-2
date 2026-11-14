// main.ts - Token Radar entrypoint (make.fun token-radar-01)
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { scoreProtocol, type Snapshot, type SnapshotProtocol, type ValuedProtocol, type BoardRow } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

function parseArgs(): { inputPath: string; outDir: string } {
  let inputPath = process.env.MAKEFUN_INPUT_DIR 
    ? join(process.env.MAKEFUN_INPUT_DIR, 'snapshot.json') 
    : '/input/snapshot.json';
  let outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      process.stdout.write('Usage: node main.ts [--input <snapshot.json>] [--output <outDir>]\n');
      process.exit(0);
    } else if (args[i] === '--input' && i + 1 < args.length) {
      inputPath = args[i + 1];
      i++;
    } else if (args[i] === '--output' && i + 1 < args.length) {
      outDir = args[i + 1];
      i++;
    }
  }

  // Fallbacks if running locally in workspace
  if (!existsSync(inputPath)) {
    const localInput = resolve('input/snapshot.json');
    if (existsSync(localInput)) inputPath = localInput;
  }

  return { inputPath, outDir };
}

function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

function main(): void {
  const { inputPath, outDir } = parseArgs();
  const repoDir = process.cwd();

  // 1. Read snapshot
  const rawInput = readFileSync(inputPath, 'utf-8');
  const snapshot: Snapshot = JSON.parse(rawInput);
  const watchlistSet = new Set(snapshot.watchlist || []);

  // 2. Score pre-token protocols
  const preTokenProtocols = snapshot.protocols.filter(isPreToken);
  const valuedPreToken: ValuedProtocol[] = preTokenProtocols.map(p => 
    scoreProtocol(p, snapshot.as_of, watchlistSet.has(p.slug))
  );

  // Deterministic sort: descending implied value, then descending TVL, then slug ascending
  valuedPreToken.sort((a, b) => {
    if (b.implied_value_usd !== a.implied_value_usd) {
      return b.implied_value_usd - a.implied_value_usd;
    }
    if (b.tvl_usd !== a.tvl_usd) {
      return b.tvl_usd - a.tvl_usd;
    }
    return a.slug.localeCompare(b.slug);
  });

  // Verify all watchlist protocols are included
  const includedSlugs = new Set(valuedPreToken.map(r => r.slug));
  for (const wSlug of snapshot.watchlist) {
    if (!includedSlugs.has(wSlug)) {
      const missingProto = snapshot.protocols.find(p => p.slug === wSlug);
      if (missingProto) {
        const valued = scoreProtocol(missingProto, snapshot.as_of, true);
        valuedPreToken.push(valued);
        includedSlugs.add(wSlug);
      }
    }
  }

  // Final re-sort to ensure non-increasing values
  valuedPreToken.sort((a, b) => {
    if (b.implied_value_usd !== a.implied_value_usd) {
      return b.implied_value_usd - a.implied_value_usd;
    }
    if (b.tvl_usd !== a.tvl_usd) {
      return b.tvl_usd - a.tvl_usd;
    }
    return a.slug.localeCompare(b.slug);
  });

  // Build board rows with 1-indexed contiguous ranks
  const boardRows: BoardRow[] = valuedPreToken.map((p, idx) => ({
    slug: p.slug,
    name: p.name,
    rank: idx + 1,
    implied_value_usd: p.implied_value_usd,
    farm_steps: p.farm_steps,
  }));

  // Also collect live protocols for the dashboard
  const liveProtocols = snapshot.protocols.filter(p => !isPreToken(p)).map(p => ({
    slug: p.slug,
    name: p.name,
    category: p.category || 'DeFi',
    chains: p.chains || [],
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    symbol: p.symbol,
    gecko_id: p.gecko_id,
  }));

  // Ensure output directory exists
  mkdirSync(outDir, { recursive: true });

  // 2. Write board.json
  const boardJson = JSON.stringify({ rows: boardRows }, null, 2);
  writeFileSync(join(outDir, 'board.json'), boardJson, 'utf-8');

  // 3. Write data.js for dashboard with rich analytics metadata
  const totalImpliedUsd = valuedPreToken.reduce((acc, p) => acc + p.implied_value_usd, 0);
  const totalPreTvlUsd = valuedPreToken.reduce((acc, p) => acc + p.tvl_usd, 0);
  const radarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    total_snapshot_protocols: snapshot.protocols.length,
    total_pre_token_protocols: valuedPreToken.length,
    total_pre_token_tvl: totalPreTvlUsd,
    total_implied_valuation: totalImpliedUsd,
    watchlist_count: snapshot.watchlist.length,
    board: valuedPreToken.map((p, idx) => ({
      ...p,
      rank: idx + 1,
    })),
    live: liveProtocols,
    model_metadata: {
      formula: 'Implied Value = round(TVL * M * F_g * F_maturity * F_c)',
      version: '1.2.0-deterministic',
    },
  };
  const dataJsContent = `window.RADAR = ${JSON.stringify(radarData)};\n`;
  writeFileSync(join(outDir, 'data.js'), dataJsContent, 'utf-8');

  // 4. Copy dashboard/ and screenshots/ to $out
  const srcDashboard = join(repoDir, 'dashboard');
  const dstDashboard = join(outDir, 'dashboard');
  if (existsSync(srcDashboard)) {
    cpSync(srcDashboard, dstDashboard, { recursive: true });
  }

  const srcScreenshots = join(repoDir, 'screenshots');
  const dstScreenshots = join(outDir, 'screenshots');
  if (existsSync(srcScreenshots)) {
    cpSync(srcScreenshots, dstScreenshots, { recursive: true });
  }

  // 5. Build dossier.json
  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  // 6. Print one-line summary to stderr and exit 0
  process.stderr.write(
    `token-radar: scored ${snapshot.protocols.length} protocols -> ${boardRows.length} ranked rows, dossier built in ${outDir}\n`
  );
  process.exit(0);
}

main();
