package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/qrclaw/qrclaw-agent-host/internal/config"
	"github.com/qrclaw/qrclaw-agent-host/internal/health"
)

func cmdDaemon(args []string, stdout io.Writer) error {
	if len(args) == 0 {
		return fmt.Errorf("usage: daemon start|stop|status|restart")
	}
	switch args[0] {
	case "start":
		return cmdDaemonStart(args[1:], stdout)
	case "stop":
		return cmdDaemonStop(stdout)
	case "status":
		return cmdDaemonStatus(stdout)
	case "restart":
		_ = cmdDaemonStop(stdout)
		return cmdDaemonStart(nil, stdout)
	default:
		return fmt.Errorf("unknown daemon subcommand %q", args[0])
	}
}

func daemonDir() (string, error) {
	return config.Dir()
}

func pidPath() (string, error) {
	dir, err := daemonDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "daemon.pid"), nil
}

func logPath() (string, error) {
	dir, err := daemonDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "daemon.log"), nil
}

func healthPort() int {
	cfg, _ := config.Load()
	if cfg.HealthPort > 0 {
		return cfg.HealthPort
	}
	return health.DefaultPort
}

func cmdDaemonStart(args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("daemon start", flag.ContinueOnError)
	foreground := fs.Bool("foreground", false, "run in foreground")
	if err := fs.Parse(args); err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if h, _ := health.Probe(ctx, healthPort()); h != nil && h["status"] == "running" {
		fmt.Fprintf(stdout, "daemon already running (pid %v)\n", h["pid"])
		return nil
	}

	if *foreground {
		s := storeDefault()
		cfg, _ := config.Load()
		runArgs := []string{"--name", "default"}
		if cfg.HostID != "" {
			runArgs = append(runArgs, "--host-id", cfg.HostID)
		}
		if cfg.GatewayWSURL != "" {
			runArgs = append(runArgs, "--ws", cfg.GatewayWSURL)
		}
		return cmdRun(runArgs, s, stdout)
	}

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	dir, err := daemonDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	lp, err := logPath()
	if err != nil {
		return err
	}
	logFile, err := os.OpenFile(lp, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return err
	}

	child := exec.Command(exe, "daemon", "start", "--foreground")
	child.Stdout = logFile
	child.Stderr = logFile
	child.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := child.Start(); err != nil {
		logFile.Close()
		return err
	}
	pid := child.Process.Pid
	_ = child.Process.Release()
	logFile.Close()

	pp, _ := pidPath()
	_ = os.WriteFile(pp, []byte(strconv.Itoa(pid)), 0o644)

	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(500 * time.Millisecond)
		pctx, pcancel := context.WithTimeout(context.Background(), 2*time.Second)
		h, err := health.Probe(pctx, healthPort())
		pcancel()
		if err == nil && h["status"] == "running" {
			fmt.Fprintf(stdout, "daemon started (pid %d, agents=%v)\n", pid, h["agents"])
			return nil
		}
	}
	fmt.Fprintf(stdout, "daemon starting (pid %d) — check log: %s\n", pid, lp)
	return nil
}

func cmdDaemonStop(stdout io.Writer) error {
	pp, err := pidPath()
	if err != nil {
		return err
	}
	data, err := os.ReadFile(pp)
	if err != nil {
		fmt.Fprintln(stdout, "daemon not running")
		return nil
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		return err
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	_ = proc.Signal(syscall.SIGTERM)
	_ = os.Remove(pp)
	fmt.Fprintf(stdout, "stopped daemon pid %d\n", pid)
	return nil
}

func cmdDaemonStatus(stdout io.Writer) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	h, err := health.Probe(ctx, healthPort())
	if err != nil || h["status"] != "running" {
		fmt.Fprintln(stdout, "daemon: stopped")
		return nil
	}
	fmt.Fprintf(stdout, "daemon: running pid=%v agents=%v uptime=%v\n", h["pid"], h["agents"], h["uptime"])
	return nil
}
