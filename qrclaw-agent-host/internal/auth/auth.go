package auth

import "errors"

// TokenStore persists agent tokens across restarts.
type TokenStore interface {
	Load(name string) (string, error)
	Save(name, token string) error
	Delete(name string) error
}

// ErrEmptyName and ErrEmptyToken guard Login input.
var (
	ErrEmptyName  = errors.New("name must not be empty")
	ErrEmptyToken = errors.New("token must not be empty")
)

// Login validates inputs and persists the token via store.
func Login(store TokenStore, name, token string) error {
	if name == "" {
		return ErrEmptyName
	}
	if token == "" {
		return ErrEmptyToken
	}
	return store.Save(name, token)
}

// Logout removes any token stored under name.
func Logout(store TokenStore, name string) error {
	if name == "" {
		return ErrEmptyName
	}
	return store.Delete(name)
}
