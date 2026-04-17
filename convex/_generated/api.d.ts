/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentTools from "../agentTools.js";
import type * as ai from "../ai.js";
import type * as cheapShark from "../cheapShark.js";
import type * as conversationMessages from "../conversationMessages.js";
import type * as conversations from "../conversations.js";
import type * as dm from "../dm.js";
import type * as dmAgent from "../dmAgent.js";
import type * as embeddings from "../embeddings.js";
import type * as embeddingsBackfill from "../embeddingsBackfill.js";
import type * as friends from "../friends.js";
import type * as http from "../http.js";
import type * as itunes from "../itunes.js";
import type * as jikan from "../jikan.js";
import type * as messages from "../messages.js";
import type * as openLibrary from "../openLibrary.js";
import type * as spotify from "../spotify.js";
import type * as tvmaze from "../tvmaze.js";
import type * as users from "../users.js";
import type * as vapiCalls from "../vapiCalls.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentTools: typeof agentTools;
  ai: typeof ai;
  cheapShark: typeof cheapShark;
  conversationMessages: typeof conversationMessages;
  conversations: typeof conversations;
  dm: typeof dm;
  dmAgent: typeof dmAgent;
  embeddings: typeof embeddings;
  embeddingsBackfill: typeof embeddingsBackfill;
  friends: typeof friends;
  http: typeof http;
  itunes: typeof itunes;
  jikan: typeof jikan;
  messages: typeof messages;
  openLibrary: typeof openLibrary;
  spotify: typeof spotify;
  tvmaze: typeof tvmaze;
  users: typeof users;
  vapiCalls: typeof vapiCalls;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
