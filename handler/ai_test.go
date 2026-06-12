package handler

import (
	"strings"
	"testing"
)

func TestAIUpstreamErrorDetail(t *testing.T) {
	got := aiUpstreamErrorDetail([]byte(`{"error":{"code":"InvalidParameter","message":"reference video fps is invalid"}}`))
	if got != "InvalidParameter reference video fps is invalid" {
		t.Fatalf("detail = %q", got)
	}
}

func TestAIUpstreamErrorDetailExplainsSensitiveVideo(t *testing.T) {
	got := aiUpstreamErrorDetail([]byte(`{"error":{"code":"InputVideoSensitiveContentDetected.PrivacyInformation","message":"The request failed because the input video may contain real person."}}`))
	if !strings.Contains(got, "参考视频疑似包含真人") || !strings.Contains(got, "asset://") {
		t.Fatalf("detail = %q", got)
	}
}

func TestSafeUpstreamTextTruncates(t *testing.T) {
	got := safeUpstreamText(strings.Repeat("错", 320))
	if len([]rune(got)) != 303 {
		t.Fatalf("truncated rune length = %d", len([]rune(got)))
	}
}

func TestResolveAIProxyPathKeepsGrokVideoOpenAIPaths(t *testing.T) {
	tests := []struct {
		name  string
		model string
		path  string
	}{
		{name: "create alias", model: "grok-imagine-video", path: "/videos"},
		{name: "create canonical", model: "grok-imagine-1.0-video", path: "/videos"},
		{name: "poll", model: "grok-imagine-1.0-video", path: "/videos/video_123"},
		{name: "content", model: "grok-imagine-1.0-video", path: "/videos/video_123/content"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := resolveAIProxyPath("https://grok2api.hello4am.com", tt.model, tt.path)
			if got != tt.path {
				t.Fatalf("path = %q, want %q", got, tt.path)
			}
		})
	}
}

func TestResolveAIProxyPathKeepsSeedanceArkTaskPaths(t *testing.T) {
	if got := resolveAIProxyPath("https://ark.cn-beijing.volces.com/api/plan/v3", "doubao-seedance-2.0-fast", "/videos"); got != "/contents/generations/tasks" {
		t.Fatalf("create path = %q", got)
	}
	if got := resolveAIProxyPath("https://ark.cn-beijing.volces.com/api/plan/v3", "doubao-seedance-2.0-fast", "/videos/task_123"); got != "/contents/generations/tasks/task_123" {
		t.Fatalf("poll path = %q", got)
	}
}
