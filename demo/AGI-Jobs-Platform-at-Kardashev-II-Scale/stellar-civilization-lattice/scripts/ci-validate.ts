#!/usr/bin/env ts-node

process.env.KARDASHEV_DEMO_PROFILE =
  process.env.KARDASHEV_DEMO_PROFILE ?? "stellar-civilization-lattice";
process.env.KARDASHEV_DEMO_PREFIX =
  process.env.KARDASHEV_DEMO_PREFIX ?? "lattice";

async function main() {
  await import("../../scripts/ci-validate");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
