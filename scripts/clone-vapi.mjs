const KEY = "af10a5b9-0f82-43eb-b9e0-663a1eff5395";
const SRC = "33ee32f7-0aa6-4756-b10c-fbad4b633bc3";

const headers = {
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

const orig = await (
  await fetch(`https://api.vapi.ai/assistant/${SRC}`, { headers })
).json();

const STRIP = [
  "id",
  "orgId",
  "createdAt",
  "updatedAt",
  "isServerUrlSecretSet",
  "credentialIds",
];
for (const k of STRIP) delete orig[k];
orig.name = (orig.name || "Homie") + " (prod)";

const res = await fetch("https://api.vapi.ai/assistant", {
  method: "POST",
  headers,
  body: JSON.stringify(orig),
});
const text = await res.text();
if (!res.ok) {
  console.error("STATUS", res.status);
  console.error(text);
  process.exit(1);
}
const created = JSON.parse(text);
console.log("NEW_ASSISTANT_ID=" + created.id);
console.log("NAME=" + created.name);
