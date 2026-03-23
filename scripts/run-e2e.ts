import { Glob } from "bun"

const files = [...new Glob("src/**/*.e2e-spec.ts").scanSync(".")].map(
  (file) => `./${file}`
)

await Bun.$`docker compose -f docker-compose.e2e.yml up -d`

try {
  const result = Bun.spawnSync(
    ["bun", "test", "--preload", "./test/setup-e2e.ts", ...files],
    {
      stdio: ["inherit", "inherit", "inherit"],
    }
  )

  process.exit(result.exitCode)
} finally {
  await Bun.$`docker compose -f docker-compose.e2e.yml down -v`
}
