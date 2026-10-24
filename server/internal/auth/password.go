package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/crypto/bcrypt"
)

const (
	BcryptCost      = 12
	SessionCookie   = "creator_sid"
	SessionTTLHours = 30 * 24
)

var (
	ErrWeakPassword = errors.New("密码长度需在 8 到 72 位之间，且同时包含字母与数字")
	ErrInvalidEmail = errors.New("请输入有效的邮箱地址")
)

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

func ValidateEmail(email string) error {
	e := strings.TrimSpace(email)
	if len(e) < 5 || len(e) > 120 || !emailRegex.MatchString(e) {
		return ErrInvalidEmail
	}
	return nil
}

func ValidatePasswordStrength(password string) error {
	if len(password) < 8 || len(password) > 72 {
		return ErrWeakPassword
	}
	hasLetter := false
	hasDigit := false
	for _, r := range password {
		if unicode.IsLetter(r) {
			hasLetter = true
		} else if unicode.IsDigit(r) {
			hasDigit = true
		}
	}
	if !hasLetter || !hasDigit {
		return ErrWeakPassword
	}
	return nil
}

func HashPassword(password string) (string, error) {
	if err := ValidatePasswordStrength(password); err != nil {
		return "", err
	}
	b, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func CheckPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// GenerateSessionToken returns a 32-byte random hex token (for Cookie) and its SHA-256 hex hash (for DB).
func GenerateSessionToken() (rawToken string, tokenHash string, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	rawToken = hex.EncodeToString(b)
	tokenHash = HashToken(rawToken)
	return rawToken, tokenHash, nil
}

func HashToken(rawToken string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(rawToken)))
	return hex.EncodeToString(sum[:])
}
