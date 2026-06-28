package store

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// ErrNotFound is returned by Load when the token does not exist.
var ErrNotFound = errors.New("token not found")

// FileStore persists tokens as files under <dir>/tokens/<name>.
type FileStore struct {
	dir string
}

// NewFileStore returns a FileStore rooted at dir. When dir is empty it falls
// back to $QRCLAW_AGENT_HOST_HOME, then ~/.qrclaw/agent-host.
func NewFileStore(dir string) *FileStore {
	if dir == "" {
		dir = os.Getenv("QRCLAW_AGENT_HOST_HOME")
	}
	if dir == "" {
		if home, err := os.UserHomeDir(); err == nil {
			dir = filepath.Join(home, ".qrclaw", "agent-host")
		}
	}
	return &FileStore{dir: dir}
}

// Dir returns the store root directory.
func (s *FileStore) Dir() string { return s.dir }

func (s *FileStore) path(name string) string {
	return filepath.Join(s.dir, "tokens", name)
}

// Load returns the token stored under name, or ErrNotFound.
func (s *FileStore) Load(name string) (string, error) {
	data, err := os.ReadFile(s.path(name))
	if err != nil {
		if os.IsNotExist(err) {
			return "", ErrNotFound
		}
		return "", err
	}
	return strings.TrimRight(string(data), "\r\n"), nil
}

// Save writes the token atomically with mode 0600.
func (s *FileStore) Save(name, token string) error {
	tokensDir := filepath.Join(s.dir, "tokens")
	if err := os.MkdirAll(tokensDir, 0o700); err != nil {
		return err
	}
	return os.WriteFile(s.path(name), []byte(token), 0o600)
}

// Delete removes the token; missing entries are not an error.
func (s *FileStore) Delete(name string) error {
	if err := os.Remove(s.path(name)); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
