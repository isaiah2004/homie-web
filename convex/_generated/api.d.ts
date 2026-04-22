/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _lib_authz from "../_lib/authz.js";
import type * as _lib_geo from "../_lib/geo.js";
import type * as _lib_time from "../_lib/time.js";
import type * as adMetrics from "../adMetrics.js";
import type * as ads from "../ads.js";
import type * as agentTools from "../agentTools.js";
import type * as ai from "../ai.js";
import type * as attachments from "../attachments.js";
import type * as billing from "../billing.js";
import type * as businessMembers from "../businessMembers.js";
import type * as businesses from "../businesses.js";
import type * as cheapShark from "../cheapShark.js";
import type * as communities from "../communities.js";
import type * as communityAds from "../communityAds.js";
import type * as communityAnnouncements from "../communityAnnouncements.js";
import type * as communityMembers from "../communityMembers.js";
import type * as communityPolls from "../communityPolls.js";
import type * as conversationMessages from "../conversationMessages.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as devSeed from "../devSeed.js";
import type * as dm from "../dm.js";
import type * as dmAgent from "../dmAgent.js";
import type * as embeddings from "../embeddings.js";
import type * as embeddingsBackfill from "../embeddingsBackfill.js";
import type * as eventInvites from "../eventInvites.js";
import type * as events from "../events.js";
import type * as friends from "../friends.js";
import type * as groupChatAgent from "../groupChatAgent.js";
import type * as groupChatMessages from "../groupChatMessages.js";
import type * as groupChats from "../groupChats.js";
import type * as http from "../http.js";
import type * as itunes from "../itunes.js";
import type * as jikan from "../jikan.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_mime from "../lib/mime.js";
import type * as lib_r2 from "../lib/r2.js";
import type * as messages from "../messages.js";
import type * as notifications from "../notifications.js";
import type * as openLibrary from "../openLibrary.js";
import type * as orgChannels from "../orgChannels.js";
import type * as parseGoogleMapsLink from "../parseGoogleMapsLink.js";
import type * as r2 from "../r2.js";
import type * as spotify from "../spotify.js";
import type * as tvmaze from "../tvmaze.js";
import type * as users from "../users.js";
import type * as vapiCalls from "../vapiCalls.js";
import type * as vapiHandler from "../vapiHandler.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_lib/authz": typeof _lib_authz;
  "_lib/geo": typeof _lib_geo;
  "_lib/time": typeof _lib_time;
  adMetrics: typeof adMetrics;
  ads: typeof ads;
  agentTools: typeof agentTools;
  ai: typeof ai;
  attachments: typeof attachments;
  billing: typeof billing;
  businessMembers: typeof businessMembers;
  businesses: typeof businesses;
  cheapShark: typeof cheapShark;
  communities: typeof communities;
  communityAds: typeof communityAds;
  communityAnnouncements: typeof communityAnnouncements;
  communityMembers: typeof communityMembers;
  communityPolls: typeof communityPolls;
  conversationMessages: typeof conversationMessages;
  conversations: typeof conversations;
  crons: typeof crons;
  devSeed: typeof devSeed;
  dm: typeof dm;
  dmAgent: typeof dmAgent;
  embeddings: typeof embeddings;
  embeddingsBackfill: typeof embeddingsBackfill;
  eventInvites: typeof eventInvites;
  events: typeof events;
  friends: typeof friends;
  groupChatAgent: typeof groupChatAgent;
  groupChatMessages: typeof groupChatMessages;
  groupChats: typeof groupChats;
  http: typeof http;
  itunes: typeof itunes;
  jikan: typeof jikan;
  "lib/identity": typeof lib_identity;
  "lib/mime": typeof lib_mime;
  "lib/r2": typeof lib_r2;
  messages: typeof messages;
  notifications: typeof notifications;
  openLibrary: typeof openLibrary;
  orgChannels: typeof orgChannels;
  parseGoogleMapsLink: typeof parseGoogleMapsLink;
  r2: typeof r2;
  spotify: typeof spotify;
  tvmaze: typeof tvmaze;
  users: typeof users;
  vapiCalls: typeof vapiCalls;
  vapiHandler: typeof vapiHandler;
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
