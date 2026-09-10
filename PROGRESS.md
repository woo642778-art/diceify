# Progress: DiceTree production platform expansion and in-game tree UX

- Status: active
- Milestone: 11/12 (92%)
- Updated: 2026-09-10T01:31:23
- Current work: 전체 로컬 검증과 변경 검토를 마쳤습니다. 검증된 변경만 main에 커밋·푸시하고 GitHub Actions 및 실제 Pages 응답을 확인합니다.

## Log
- 2026-09-04T15:02:55 | 1/12 | Repository, deployment, compatibility and performance baseline mapped; gesture rendering bottleneck fixed and measured.
- 2026-09-04T15:30:40 | 2/12 | Cloudflare Worker architecture, D1 schema, Google OIDC session model, Durable Object chat and guarded recommendation/moderation domains implemented; local migration, typecheck and dry-run pass.
- 2026-09-04T16:13:21 | 3/12 | Phase 2 audit recorded; tree regression subset and 14 Worker SQL/domain tests pass. Build revision, fork, atomic sync, party membership and local What-if workspace implemented; authenticated staging is blocked on Cloudflare/Google configuration.
- 2026-09-06T04:15:52 | 4/12 | Mobile tree interaction regressions fixed; compact mobile overlays, shared-state focus, auth-aware online fallback, and consent-gated 25-account community aggregation implemented. Worker SQLite tests 15/15 and Worker typecheck pass.
- 2026-09-06T04:39:32 | 5/12 | Static GitHub Pages release merged and deployed; public mobile smoke passed without console errors. Root document canvas is now forced opaque dark during pinch zoom, and desktop/mobile regression checks pass.
- 2026-09-08T02:11:50 | 6/12 | Consent-gated community deck recommendations now render by mode and apply directly to Deck Lab. Event submission, live point ledger, and idempotent redemption workflows are implemented. Consent changes and account deletion rebuild recommendation aggregates; frontend and Worker verification pass.
- 2026-09-08T02:28:25 | 7/12 | Daily Worker maintenance now expires transient sessions and quotas, transitions expired matchmaking, events and sanctions, prunes only stale notifications, and rebuilds all recommendation segments for recovery. User builds, snapshots, chats, point ledgers and audit logs are preserved; 18 Worker tests and deployment dry-run pass.
- 2026-09-08T02:47:01 | 8/12 | Admin/owner-only operations review now loads live platform metrics, open reports and audit history; report outcomes and optional sanctions are conditionally committed once with immutable audit entries. Frontend and Worker tests pass.
- 2026-09-10T01:13:29 | 9/12 | 실제 트리 노드가 있는 42종만 덱·추천·주사위 목록에 노출하도록 바로잡고, 홈·헤더·업데이트 센터에 공식 버전과 공개 교차검증 시각화를 연결했습니다. 합성 테스트 데이터는 트리가 없을 때만 명시적으로 전체 목록을 사용합니다.
- 2026-09-10T01:30:42 | 10/12 | 외부 응답 크기·스키마·출처 URL을 제한하고, GitHub API 호출 한도 시 마지막 검증 커밋을 유지하도록 보강했습니다. 전체 단위 260건, Worker 20건, Worker 타입·배포 드라이런, 단일 워커 브라우저 55건 통과·7건 의도적 제외를 확인했습니다.
- 2026-09-10T01:31:23 | 11/12 | 최종 diff에서 외부 출처 allowlist, 5 MB 응답 제한, 실패 시 검증본 유지, 버전 불일치 경고, 사용자 데이터 미전송을 재검토했습니다. 배포 전 로컬 검증이 완료됐습니다.
