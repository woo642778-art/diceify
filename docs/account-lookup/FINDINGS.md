# Account lookup investigation, 2026-09-09

## Acceptance criterion

Entering a nickname or PID must retrieve that player's actual game data from an authorized upstream service. Saving local inputs, displaying a captured ranking, validating user JSON, or computing a planner heuristic does **not** meet this criterion. No live lookup provider has been verified; this feature remains blocked, not complete.

## Static client evidence

Source: user-supplied Random Dice 2 iOS 1.1.0 IPA, SHA-256 `9ba1eb7d25ef915e8d0d935ddd22635fcca1ce127a6b11d6c8e6a6ffcc5a5772`.
Only static metadata was read. No executable was run, no game session was created, and no game account or server state was modified.

`Payload/RandomDice2.app/Data/Managed/Metadata/global-metadata.dat` has IL2CPP metadata magic `0xFAB11BAF`, version 39. Relevant section descriptors are offset/size/count triples starting at byte 8. String literals use 4-byte offsets into literal data. The inspected type-definition records are 82 bytes (`<5iHI8i8H2I`), field definitions 12 bytes, and method definitions 32 bytes. This layout was cross-checked against the [Il2CppDumper v39 metadata definitions](https://github.com/roytu/Il2CppDumper/blob/v39/Il2CppDumper/Il2Cpp/MetadataClass.cs), not an assumption based on older 8-byte literal records.

| Metadata evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| Literal `IUserAccountRpc/GetNicknameOwners`; type 10902 `GetNicknameOwnersReq.nickname`; type 10903 `GetNicknameOwnersRes.owners` | Exact-name lookup contract exists in this client | A public HTTP URL or an unauthenticated website integration |
| Literal `IUserAccountRpc/QueryNicknameOwners`; type 10904 fields `startWord`, `cursor`; type 10905 response `dto` | Prefix/paginated name lookup contract exists | A complete player profile response |
| Type 30955 `PerbaseNicknameOwner`: `AccountId`, `Nickname`, `Code` | Name-owner records contain identity information | Owned dice, levels, inventory, tree, trophies, or a rating |
| Type 10969 `GetFriendUserDocumentReq` has no fields; type 10970 response has `MyFriendData` | A friend-document request/response exists | An arbitrary player ID profile lookup. Its shape suggests the current user's friend document, not an arbitrary-account request |
| Type 10896 `LoginRes`: `accountData`, `nickname`, `profileData`, `goodsData`, `inventoryData`, `diceTreeData`, other fields | The client receives detailed game state through its login response | That a different player's private inventory can be obtained by entering their PID |
| Type 23249 `PerbaseClient._connector`; 23191 `Connector._accountManager`, `_webSocket`; 23212 `WebSocketWrapper.ConnectAndNegotiateAsync`, `LoginResponse`; 23371 `AccountManager._authAgent`, `_authSessionStorage`, `LoginAsync` | The RPC stack includes account/session management and WebSocket negotiation | Runtime proof that a particular RPC allows or rejects anonymous access |

The client documentation URL `https://generic.docs.111percent.net/unity-packages/gamebase/perbase/perbase-v2/index.html` returned HTTP 302 to the documentation authentication service during a read-only HEAD request. It did not expose a public integration contract. Authentication cookies and redirect state are not retained here.

No working production RPC address, authorized website authentication flow, arbitrary-PID profile request, or successful real-player response has been established. Static symbol presence is not runtime verification. Do not invent REST URLs from RPC route strings. Do not use DEV/CHEAT methods, create game sessions without authorization, extract user credentials, or treat the site's Google login as game login.

[Brawlify's own stats page](https://brawlify.com/stats) describes using Supercell's API for its player statistics. Matching that interaction requires an equivalent usable data source for this game; the UI alone cannot supply it.

## Confirmed site defect and correction

`AccountIntelligenceView` previously used any non-ranking `twin.identity` as its account-connected condition. A new local name immediately enabled a heuristic derived from current/default planner inputs. The score was not a server account rating. JSON labelled `verified-import` was only schema/value checked, not verified against a game server.

The account header now shows no numeric score for any existing local/import source. Local storage is explicitly labelled planner storage, PID is only a note, and user JSON is marked server-unverified. Calculations require a separate manual opt-in independent of identity. Existing saved profiles, resources, tree data, and imports are retained. No fake search endpoint or mocked provider is shipped.

## Remaining integration requirement

An operator-supported API or another explicitly authorized profile-data service with a documented endpoint, authentication method, returned fields, and usage permission is needed. A real nickname/PID can then validate account matching, duplicate-name selection, missing players, failures, freshness, and unavailable fields. A user password or copied session token is not a substitute for that website integration contract.
