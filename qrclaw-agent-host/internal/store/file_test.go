package store

import (
	"errors"
	"os"
	"testing"
)

func TestFileStoreRoundtrip(t *testing.T) {
	s := NewFileStore(t.TempDir())
	if err := s.Save("alice", "tok-123"); err != nil {
		t.Fatalf("save: %v", err)
	}
	got, err := s.Load("alice")
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if got != "tok-123" {
		t.Fatalf("got %q want tok-123", got)
	}
}

func TestFileStoreLoadMissing(t *testing.T) {
	s := NewFileStore(t.TempDir())
	_, err := s.Load("ghost")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestFileStoreDelete(t *testing.T) {
	s := NewFileStore(t.TempDir())
	if err := s.Save("bob", "x"); err != nil {
		t.Fatalf("save: %v", err)
	}
	if err := s.Delete("bob"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := s.Load("bob"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound after delete, got %v", err)
	}
	// Deleting a missing entry must be a no-op.
	if err := s.Delete("bob"); err != nil {
		t.Fatalf("delete missing: %v", err)
	}
}

func TestFileStoreTokenFileMode(t *testing.T) {
	s := NewFileStore(t.TempDir())
	if err := s.Save("carol", "secret"); err != nil {
		t.Fatalf("save: %v", err)
	}
	info, err := os.Stat(s.path("carol"))
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if mode := info.Mode().Perm(); mode != 0o600 {
		t.Fatalf("mode = %o, want 600", mode)
	}
}

func TestNewFileStoreEnvFallback(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("QRCLAW_AGENT_HOST_HOME", dir)
	s := NewFileStore("")
	if s.Dir() != dir {
		t.Fatalf("dir = %q, want %q", s.Dir(), dir)
	}
}
