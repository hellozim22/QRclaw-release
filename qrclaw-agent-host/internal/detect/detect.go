// Package detect discovers locally installed AI provider CLIs.
package detect

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// Provider identifies a detected local AI provider.
type Provider string

const (
	ProviderOpenClaw Provider = "openclaw"
	ProviderClaude   Provider = "claude"
	ProviderCursor   Provider = "cursor"
	ProviderCodex    Provider = "codex"
	ProviderPi       Provider = "pi"
)

// Status is the Wave 10 runtime availability state reported to Gateway.
type Status string

const (
	StatusNotInstalled Status = "not_installed"
	StatusNeedsLogin   Status = "needs_login"
	StatusOnline       Status = "online"
	StatusOffline      Status = "offline"
	StatusError        Status = "error"
)

// Spec describes how to locate and version-query a provider.
type Spec struct {
	Provider Provider
	// Binary is the default executable name on PATH.
	Binary string
	// AltBinaries are fallback executable names when Binary is not on PATH.
	AltBinaries []string
	// EnvVar is the env override (e.g. QRCLAW_PROVIDER_OPENCLAW_PATH).
	EnvVar string
	// VersionArgs are passed to the binary to print version info.
	VersionArgs []string
	// AuthArgs optionally check login state without sending a prompt.
	AuthArgs []string
}

// Result is the outcome of detecting a single provider.
type Result struct {
	Provider Provider
	Path     string
	Version  string
	Found    bool
	Status   Status
	Err      error
}

// Specs returns the default provider specs in canonical order.
func Specs() []Spec {
	return []Spec{
		{Provider: ProviderOpenClaw, Binary: "openclaw", EnvVar: "QRCLAW_PROVIDER_OPENCLAW_PATH", VersionArgs: []string{"--version"}},
		{Provider: ProviderClaude, Binary: "claude-internal", AltBinaries: []string{"claude"}, EnvVar: "QRCLAW_PROVIDER_CLAUDE_CODE_PATH", VersionArgs: []string{"--version"}},
		{Provider: ProviderCursor, Binary: "cursor-agent", AltBinaries: []string{"cursor"}, EnvVar: "QRCLAW_PROVIDER_CURSOR_AGENT_PATH", VersionArgs: []string{"--version"}},
		{Provider: ProviderCodex, Binary: "codex", EnvVar: "QRCLAW_PROVIDER_CODEX_PATH", VersionArgs: []string{"--version"}},
		{Provider: ProviderPi, Binary: "pi", EnvVar: "QRCLAW_PROVIDER_PI_PATH", VersionArgs: []string{"--version"}},
	}
}

// versionRE extracts a semver-ish token from version output.
var versionRE = regexp.MustCompile(`\d+\.\d+(?:\.\d+)?(?:[-+][A-Za-z0-9.\-]+)?`)

// Detect resolves a single provider spec. Lookup honours env override first,
// then PATH. When found, runs --version with a short timeout.
func Detect(ctx context.Context, spec Spec) Result {
	res := Result{Provider: spec.Provider, Status: StatusNotInstalled}

	path := strings.TrimSpace(os.Getenv(spec.EnvVar))
	if path != "" {
		if _, err := os.Stat(path); err != nil {
			res.Err = err
			return res
		}
	} else {
		var err error
		path, err = exec.LookPath(spec.Binary)
		if err != nil {
			for _, alt := range spec.AltBinaries {
				if altPath, altErr := exec.LookPath(alt); altErr == nil {
					path = altPath
					err = nil
					break
				}
			}
		}
		if err != nil {
			return res
		}
	}
	res.Path = path
	res.Found = true

	cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	args := spec.VersionArgs
	if len(args) == 0 {
		args = []string{"--version"}
	}
	out, err := exec.CommandContext(cctx, path, args...).CombinedOutput()
	if err != nil {
		res.Err = err
		res.Status = statusForProbeError(err, string(out))
		return res
	}
	res.Version = parseVersion(string(out))
	if len(spec.AuthArgs) > 0 {
		authOut, err := exec.CommandContext(cctx, path, spec.AuthArgs...).CombinedOutput()
		if err != nil {
			res.Err = err
			res.Status = statusForProbeError(err, string(authOut))
			return res
		}
	}
	res.Status = StatusOnline
	return res
}

func statusForProbeError(err error, output string) Status {
	if errors.Is(err, context.Canceled) {
		return StatusOffline
	}
	s := strings.ToLower(output + " " + err.Error())
	for _, token := range []string{"login", "logged in", "auth", "authenticate", "token"} {
		if strings.Contains(s, token) {
			return StatusNeedsLogin
		}
	}
	return StatusError
}

// parseVersion extracts the first semver-like token from s.
func parseVersion(s string) string {
	s = strings.TrimSpace(s)
	if m := versionRE.FindString(s); m != "" {
		return m
	}
	// fallback: first line trimmed
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return strings.TrimSpace(s[:i])
	}
	return s
}

// All runs Detect for every default spec, in order.
func All(ctx context.Context) []Result {
	specs := Specs()
	out := make([]Result, 0, len(specs))
	for _, s := range specs {
		out = append(out, Detect(ctx, s))
	}
	return out
}
