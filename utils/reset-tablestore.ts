/**
 * Reset Alibaba Cloud Tablestore and repopulate the merchant table.
 *
 * This is intended for deployment refreshes. It deletes the configured
 * decisions and merchants tables, recreates them, then seeds merchants from
 * data/snapshots/*.json. It requires an explicit confirmation value so a normal
 * local command cannot wipe cloud data by accident.
 *
 * Usage:
 *   CONFIRM_TABLESTORE_RESET=<OTS_INSTANCE> yarn reset:tablestore
 */
import dotenv from "dotenv";
dotenv.config();
process.env.DATA_BACKEND = "tablestore";

async function main() {
  const { resetTablestoreAndSeedMerchants } = await import("./tablestore");
  const expected = process.env.OTS_INSTANCE;
  if (!expected) {
    throw new Error("OTS_INSTANCE is required.");
  }
  if (process.env.CONFIRM_TABLESTORE_RESET !== expected) {
    throw new Error(
      `Refusing to reset Tablestore. Set CONFIRM_TABLESTORE_RESET=${expected} to continue.`
    );
  }

  await resetTablestoreAndSeedMerchants();
  console.log("✅ Tablestore reset complete; merchant table repopulated.");
}

main().catch((err) => {
  console.error("Tablestore reset failed:", err);
  process.exit(1);
});
