const KEY = "af10a5b9-0f82-43eb-b9e0-663a1eff5395";
const ID = "a3ef20a2-14b3-4315-9ffb-f4047a0690c6";
const SERVER_URL = "https://homie-web.vercel.app/api/vapi/webhook";
const SECRET = "52751fe8f6e2e2762e807b932cb1a6a739f7352fb8e94f45a03d552535f1e811";

const res = await fetch(`https://api.vapi.ai/assistant/${ID}`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    server: { url: SERVER_URL, secret: SECRET, timeoutSeconds: 20 },
  }),
});
const text = await res.text();
if (!res.ok) {
  console.error("STATUS", res.status);
  console.error(text);
  process.exit(1);
}
const out = JSON.parse(text);
console.log("server.url =", out.server?.url);
console.log("isServerUrlSecretSet =", out.isServerUrlSecretSet);
console.log("id =", out.id);
