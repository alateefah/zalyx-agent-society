/**
 * Seed merchant snapshots into Alibaba Cloud Tablestore.
 *
 * This writes input merchants only. It does not create underwriting decisions;
 * decisions are produced by real underwriting runs.
 *
 *   yarn seed
 */
import dotenv from "dotenv";
dotenv.config();
process.env.DATA_BACKEND = process.env.DATA_BACKEND || "tablestore";

async function main() {
  const { initTablestore, seedMerchantTableFromSnapshots } = await import("./tablestore");
  await initTablestore();
  const n = await seedMerchantTableFromSnapshots();
  console.log(`✅ Seeded ${n} merchant snapshot(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
