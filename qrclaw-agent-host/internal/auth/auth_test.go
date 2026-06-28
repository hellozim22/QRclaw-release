package auth

import (
	"errors"
	"testing"
)

type memStore struct {
	data map[string]string
}

func newMemStore() *memStore { return &memStore{data: map[string]string{}} }

func (m *memStore) Load(name string) (string, error) {
	v, ok := m.data[name]
	if !ok {
		return "", errors.New("missing")
	}
	return v, nil
}

func (m *memStore) Save(name, token string) error {
	m.data[name] = token
	return nil
}

func (m *memStore) Delete(name string) error {
	delete(m.data, name)
	return nil
}

func TestLoginSavesToken(t *testing.T) {
	s := newMemStore()
	if err := Login(s, "alice", "tok"); err != nil {
		t.Fatalf("login: %v", err)
	}
	if s.data["alice"] != "tok" {
		t.Fatalf("want tok, got %q", s.data["alice"])
	}
}

func TestLoginEmptyToken(t *testing.T) {
	s := newMemStore()
	if err := Login(s, "alice", ""); !errors.Is(err, ErrEmptyToken) {
		t.Fatalf("want ErrEmptyToken, got %v", err)
	}
	if _, ok := s.data["alice"]; ok {
		t.Fatalf("store should be empty on validation failure")
	}
}

func TestLoginEmptyName(t *testing.T) {
	s := newMemStore()
	if err := Login(s, "", "tok"); !errors.Is(err, ErrEmptyName) {
		t.Fatalf("want ErrEmptyName, got %v", err)
	}
}

func TestLogoutRemovesToken(t *testing.T) {
	s := newMemStore()
	s.data["alice"] = "tok"
	if err := Logout(s, "alice"); err != nil {
		t.Fatalf("logout: %v", err)
	}
	if _, ok := s.data["alice"]; ok {
		t.Fatalf("expected deletion")
	}
}

func TestLogoutEmptyName(t *testing.T) {
	if err := Logout(newMemStore(), ""); !errors.Is(err, ErrEmptyName) {
		t.Fatalf("want ErrEmptyName, got %v", err)
	}
}
