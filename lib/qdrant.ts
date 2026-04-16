import { QdrantClient } from "@qdrant/js-client-rest";

const qdrantUrl = process.env.QDRANT_URL;
const qdrantApiKey = process.env.QDRANT_API_KEY;

if (!qdrantUrl) {
  throw new Error(
    "QDRANT_URL is not set. Configure it on the Convex deployment via `npx convex env set QDRANT_URL ...`",
  );
}

export const qdrantClient = new QdrantClient({
  url: qdrantUrl,
  apiKey: qdrantApiKey,
});

// One collection holds every embedded profile item across all users and
// entity types. Per-entity filtering is done via payload keys at query time.
export const PROFILE_ITEMS_COLLECTION = "profile_items";

// text-embedding-3-small dimensions
export const EMBEDDING_DIM = 1536;

let collectionEnsured = false;

export async function ensureProfileItemsCollection(): Promise<void> {
  if (collectionEnsured) return;
  const collections = await qdrantClient.getCollections();
  const exists = collections.collections.some(
    (c) => c.name === PROFILE_ITEMS_COLLECTION,
  );
  if (!exists) {
    await qdrantClient.createCollection(PROFILE_ITEMS_COLLECTION, {
      vectors: { size: EMBEDDING_DIM, distance: "Cosine" },
      optimizers_config: { default_segment_number: 2 },
    });
    // Payload indexes accelerate the filters we run on every query.
    await qdrantClient.createPayloadIndex(PROFILE_ITEMS_COLLECTION, {
      field_name: "userId",
      field_schema: "keyword",
    });
    await qdrantClient.createPayloadIndex(PROFILE_ITEMS_COLLECTION, {
      field_name: "entityType",
      field_schema: "keyword",
    });
    await qdrantClient.createPayloadIndex(PROFILE_ITEMS_COLLECTION, {
      field_name: "visibility",
      field_schema: "keyword",
    });
  }
  collectionEnsured = true;
}
