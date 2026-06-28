package detect

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestParseVersion(t *testing.T) {
	cases := map[string]string{
		"claude 2.1.112\n":             "2.1.112",
		"openclaw version 0.5.1 (abc)": "0.5.1",
		"cursor-agent 1.2\nfoo":        "1.2",
		"codex-cli v0.9.0-beta.3":      "0.9.0-beta.3",
		"no digits here":               "no digits here",
	}
	for in, want := range cases {
		got := parseVersion(in)
		if got != want {
			t.Errorf("parseVersion(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSpecsCoverAllProviders(t *testing.T) {
	want := map[Provider]bool{
		ProviderOpenClaw: false, ProviderClaude: false,
		ProviderCursor: false, ProviderCodex: false,
		ProviderPi: false,
	}
	for _, s := range Specs() {
		if _, ok := want[s.Provider]; !ok {
			t.Errorf("unknown provider %q", s.Provider)
		}
		want[s.Provider] = true
		if s.Binary == "" || s.EnvVar == "" {
			t.Errorf("spec %q missing binary/env", s.Provider)
		}
	}
	for p, seen := range want {
		if !seen {
			t.Errorf("missing spec for %s", p)
		}
	}
}

func TestDetectEnvOverride(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script fixture not portable")
	}
	dir := t.TempDir()
	fake := filepath.Join(dir, "fakeprov")
	script := "#!/bin/sh\necho 'fakeprov 9.8.7'\n"
	if err := os.WriteFile(fake, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	spec := Spec{
		Provider:    ProviderOpenClaw,
		Binary:      "definitely-not-on-path-xyz",
		EnvVar:      "QRCLAW_TEST_FAKE_PATH",
		VersionArgs: []string{"--version"},
	}
	t.Setenv(spec.EnvVar, fake)
	r := Detect(context.Background(), spec)
	if !r.Found || r.Path != fake {
		t.Fatalf("not found: %+v", r)
	}
	if r.Version != "9.8.7" {
		t.Errorf("version = %q, want 9.8.7", r.Version)
	}
}

func TestDetectMissing(t *testing.T) {
	spec := Spec{
		Provider: ProviderCodex,
		Binary:   "definitely-missing-binary-xyz-123",
		EnvVar:   "QRCLAW_TEST_MISSING_PATH",
	}
	os.Unsetenv(spec.EnvVar)
	r := Detect(context.Background(), spec)
	if r.Found {
		t.Errorf("expected not found, got %+v", r)
	}
	if r.Status != StatusNotInstalled {
		t.Errorf("status = %q, want %q", r.Status, StatusNotInstalled)
	}
}

func TestDetectStatusOnline(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script fixture not portable")
	}
	dir := t.TempDir()
	fake := filepath.Join(dir, "fakeprov")
	script := "#!/bin/sh\necho 'fakeprov 1.2.3'\n"
	if err := os.WriteFile(fake, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	spec := Spec{
		Provider:    ProviderClaude,
		Binary:      "definitely-not-on-path-xyz",
		EnvVar:      "QRCLAW_TEST_ONLINE_PATH",
		VersionArgs: []string{"--version"},
	}
	t.Setenv(spec.EnvVar, fake)

	r := Detect(context.Background(), spec)
	if r.Status != StatusOnline {
		t.Fatalf("status = %q, want %q; result=%+v", r.Status, StatusOnline, r)
	}
}

func TestDetectStatusNeedsLogin(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script fixture not portable")
	}
	dir := t.TempDir()
	fake := filepath.Join(dir, "fakeprov")
	script := "#!/bin/sh\nif [ \"$1\" = \"auth\" ]; then echo 'not logged in'; exit 1; fi\necho 'fakeprov 1.2.3'\n"
	if err := os.WriteFile(fake, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	spec := Spec{
		Provider:    ProviderClaude,
		Binary:      "definitely-not-on-path-xyz",
		EnvVar:      "QRCLAW_TEST_NEEDS_LOGIN_PATH",
		VersionArgs: []string{"--version"},
		AuthArgs:    []string{"auth", "status"},
	}
	t.Setenv(spec.EnvVar, fake)

	r := Detect(context.Background(), spec)
	if r.Status != StatusNeedsLogin {
		t.Fatalf("status = %q, want %q; result=%+v", r.Status, StatusNeedsLogin, r)
	}
}

func TestDetectStatusError(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script fixture not portable")
	}
	dir := t.TempDir()
	fake := filepath.Join(dir, "fakeprov")
	script := "#!/bin/sh\necho 'boom' >&2\nexit 2\n"
	if err := os.WriteFile(fake, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	spec := Spec{
		Provider:    ProviderCursor,
		Binary:      "definitely-not-on-path-xyz",
		EnvVar:      "QRCLAW_TEST_ERROR_PATH",
		VersionArgs: []string{"--version"},
	}
	t.Setenv(spec.EnvVar, fake)

	r := Detect(context.Background(), spec)
	if r.Status != StatusError {
		t.Fatalf("status = %q, want %q; result=%+v", r.Status, StatusError, r)
	}
}

func TestAll(t *testing.T) {
	results := All(context.Background())
	if len(results) != len(Specs()) {
		t.Fatalf("len(results)=%d want %d", len(results), len(Specs()))
	}
}
