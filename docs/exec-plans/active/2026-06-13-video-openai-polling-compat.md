# Video OpenAI Polling Compatibility

## Context

- The video workbench and canvas video node both use `web/src/services/api/video.ts`.
- The Grok video provider now returns an OpenAI-compatible completed task with `/videos/{id}` and `/videos/{id}/content`.
- Seedance/Ark still uses `/contents/generations/tasks`.

## Plan

1. Keep OpenAI/Grok video generation and polling on `/videos`.
2. Keep Seedance task creation and polling on `/contents/generations/tasks` only for Seedance/Ark channels.
3. Ensure the video workbench and canvas video node both pick the video model, not a text/image model from the shared config.
4. Add focused regression tests around proxy path resolution.
5. Deploy the canvas stack and verify the existing completed task can be queried through the public canvas API path.

## Verification

- Passed: Docker-based `go test ./handler ./service`.
- Passed: production deploy with `scripts/deploy-chatgpt2api-canvas.py`; Docker `go build` and Next `bun run build` completed.
- Passed: `http://127.0.0.1:18082/api/health` returned `ok`.
- Passed: existing Grok completed task `video_fe2af3c5ef3641fca13ad592` returned `status=completed` through canvas backend for both `grok-imagine-1.0-video` and `grok-imagine-video`.
- Passed: `/api/v1/videos/video_fe2af3c5ef3641fca13ad592/content?model=grok-imagine-1.0-video` returned `200 video/mp4` with `2160091` bytes on `https://canvas.hello4am.com`.
- Passed: public settings now expose `grok-imagine-1.0-video` as an available video model.
