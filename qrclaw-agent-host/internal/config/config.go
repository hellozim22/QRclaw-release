// Package config — Multica-style persistent CLI config (~/.qrclaw/config.json).
package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

const defaultRelPath = ".qrclaw/config.json"

// Config mirrors multica CLIConfig fields adapted for QRClaw local host.
type Config struct {
	GatewayHTTPURL string `json:"gateway_http_url,omitempty"`
	GatewayWSURL   string `json:"gateway_ws_url,omitempty"`
	WebURL         string `json:"web_url,omitempty"`
	UserID         string `json:"user_id,omitempty"`
	HostID         string `json:"host_id,omitempty"`
	HealthPort     int    `json:"health_port,omitempty"`
}

func Path() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, defaultRelPath), nil
}

func Dir() (string, error) {
	p, err := Path()
	if err != nil {
		return "", err
	}
	return filepath.Dir(p), nil
}

func Load() (Config, error) {
	path, err := Path()
	if err != nil {
		return Config{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Config{}, nil
		}
		return Config{}, fmt.Errorf("read config: %w", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{}, fmt.Errorf("parse config: %w", err)
	}
	return cfg, nil
}

func Save(cfg Config) error {
	path, err := Path()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func DefaultHealthPort() int { return 19515 }
