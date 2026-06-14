package service

import (
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
)

func withRegisterEmailDomain(t *testing.T, domain string) {
	t.Helper()
	previous := config.Cfg.RegisterEmailDomain
	config.Cfg.RegisterEmailDomain = domain
	t.Cleanup(func() { config.Cfg.RegisterEmailDomain = previous })
}

func TestNormalizeEmail(t *testing.T) {
	cases := map[string]string{
		"  Foo@QQ.com  ": "foo@qq.com",
		"bar@Gmail.com\t": "bar@gmail.com",
		"plain@163.com":   "plain@163.com",
	}
	for in, want := range cases {
		if got := NormalizeEmail(in); got != want {
			t.Errorf("NormalizeEmail(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestIsAllowedRegisterEmail(t *testing.T) {
	withRegisterEmailDomain(t, "qq.com")
	cases := map[string]bool{
		"user@qq.com":          true,
		"  USER@QQ.COM  ":      true,
		"user.name+tag@qq.com": true,
		"user@163.com":         false,
		"plainaddress":         false,
		"user@qq":              false,
		"@qq.com":              false,
		"":                     false,
	}
	for in, want := range cases {
		_, got := IsAllowedRegisterEmail(in)
		if got != want {
			t.Errorf("IsAllowedRegisterEmail(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestGenerateEmailCode(t *testing.T) {
	for _, length := range []int{4, 6, 8} {
		code, err := generateEmailCode(length)
		if err != nil {
			t.Fatalf("generateEmailCode(%d) err = %v", length, err)
		}
		if len(code) != length {
			t.Fatalf("generateEmailCode(%d) len = %d", length, len(code))
		}
		for _, c := range code {
			if c < '0' || c > '9' {
				t.Fatalf("generateEmailCode(%d) produced non-digit %q", length, c)
			}
		}
	}
	code, err := generateEmailCode(0)
	if err != nil || len(code) == 0 {
		t.Fatalf("generateEmailCode(0) = %q, err = %v", code, err)
	}
}

func TestBuildEmailCodeBody(t *testing.T) {
	body := buildEmailCodeBody("123456", 600)
	if !strings.Contains(body, "123456") {
		t.Errorf("body missing code: %q", body)
	}
	if !strings.Contains(body, "10 分钟") {
		t.Errorf("body missing ttl minutes: %q", body)
	}
}
