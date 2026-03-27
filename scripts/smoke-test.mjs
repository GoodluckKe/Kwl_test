const baseUrl = process.env.BASE_URL || "http://localhost:3010";

async function expectJson(path, expectedStatus = 200) {
  const resp = await fetch(`${baseUrl}${path}`);
  if (resp.status !== expectedStatus) {
    throw new Error(`Expected ${path} -> ${expectedStatus}, got ${resp.status}`);
  }
  return resp.json();
}

async function main() {
  const health = await expectJson("/api/healthz");
  if (!health.ok) throw new Error("healthz returned ok=false");

  const manifest = await expectJson("/api/integration/manifest");
  if (!Array.isArray(manifest.tools) || manifest.tools.length < 3) {
    throw new Error("integration manifest missing tools");
  }

  const rootResp = await fetch(`${baseUrl}/`);
  if (!rootResp.ok) throw new Error(`GET / failed with ${rootResp.status}`);

  const tutorialResp = await fetch(`${baseUrl}/tutorial`);
  if (!tutorialResp.ok) throw new Error(`GET /tutorial failed with ${tutorialResp.status}`);

  const noAuthResp = await fetch(`${baseUrl}/api/integration/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: "get_player_profile", input: {} }),
  });
  if (noAuthResp.status !== 401) {
    throw new Error(`Expected unauthenticated integration call to return 401, got ${noAuthResp.status}`);
  }

  console.log("Smoke tests passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
