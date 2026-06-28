package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/qrclaw/qrclaw-agent-host/internal/auth"
	_ "github.com/qrclaw/qrclaw-agent-host/internal/provider/claude"
	_ "github.com/qrclaw/qrclaw-agent-host/internal/provider/codex"
	_ "github.com/qrclaw/qrclaw-agent-host/internal/provider/cursor"
	_ "github.com/qrclaw/qrclaw-agent-host/internal/provider/openclaw"
	_ "github.com/qrclaw/qrclaw-agent-host/internal/provider/pi"
	"github.com/qrclaw/qrclaw-agent-host/internal/store"
	"github.com/qrclaw/qrclaw-agent-host/internal/version"
)

func storeDefault() auth.TokenStore {
	return store.NewFileStore("")
}

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(args []string, stdin io.Reader, stdout io.Writer) error {
	if len(args) == 0 {
		fmt.Fprintf(stdout, "qrclaw-agent-host v%s\n", version.Version)
		return nil
	}
	s := store.NewFileStore("")
	switch args[0] {
	case "login":
		return cmdLogin(args[1:], s, stdin, stdout)
	case "logout":
		return cmdLogout(args[1:], s, stdout)
	case "detect":
		return cmdDetect(stdout)
	case "run":
		return cmdRun(args[1:], s, stdout)
	case "setup":
		return cmdSetup(args[1:], stdout)
	case "daemon":
		return cmdDaemon(args[1:], stdout)
	case "progress":
		return cmdProgress(args[1:], stdout)
	case "version", "--version", "-v":
		fmt.Fprintf(stdout, "qrclaw-agent-host v%s\n", version.Version)
		return nil
	default:
		return fmt.Errorf("unknown subcommand %q", args[0])
	}
}

func cmdLogin(args []string, s auth.TokenStore, stdin io.Reader, stdout io.Writer) error {
	fs := flag.NewFlagSet("login", flag.ContinueOnError)
	name := fs.String("name", "", "agent name")
	token := fs.String("token", "", "agent token (omit to read from stdin)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	tok := *token
	if tok == "" {
		data, err := io.ReadAll(stdin)
		if err != nil {
			return fmt.Errorf("read stdin: %w", err)
		}
		tok = strings.TrimSpace(string(data))
	}
	if err := auth.Login(s, *name, tok); err != nil {
		return err
	}
	fmt.Fprintf(stdout, "logged in as %s\n", *name)
	return nil
}

func cmdLogout(args []string, s auth.TokenStore, stdout io.Writer) error {
	fs := flag.NewFlagSet("logout", flag.ContinueOnError)
	name := fs.String("name", "", "agent name")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if err := auth.Logout(s, *name); err != nil {
		return err
	}
	fmt.Fprintf(stdout, "logged out %s\n", *name)
	return nil
}
