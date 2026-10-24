package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	ErrChallengeInvalid = errors.New("验证码错误或已过期，请刷新后重试")
)

type ChallengeManager struct {
	secret []byte
	mu     sync.Mutex
	used   map[string]int64 // Prevents replay of the same challenge nonce
}

type ChallengePayload struct {
	Question string `json:"question"`
	Token    string `json:"token"`
}

func NewChallengeManager(secretKey string) *ChallengeManager {
	return &ChallengeManager{
		secret: []byte(secretKey),
		used:   make(map[string]int64),
	}
}

func (cm *ChallengeManager) Generate() (*ChallengePayload, error) {
	aBig, _ := rand.Int(rand.Reader, big.NewInt(15))
	bBig, _ := rand.Int(rand.Reader, big.NewInt(15))
	a := int(aBig.Int64()) + 3
	b := int(bBig.Int64()) + 2
	ans := a + b

	nonceBytes := make([]byte, 8)
	_, _ = rand.Read(nonceBytes)
	nonce := hex.EncodeToString(nonceBytes)
	exp := time.Now().Add(5 * time.Minute).Unix()

	raw := fmt.Sprintf("%s:%d:%d", nonce, exp, ans)
	sig := cm.sign(raw)
	token := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf("%s:%d:%s", nonce, exp, sig)))

	return &ChallengePayload{
		Question: fmt.Sprintf("%d + %d = ?", a, b),
		Token:    token,
	}, nil
}

func (cm *ChallengeManager) Verify(token, answer string) error {
	ansInt, err := strconv.Atoi(strings.TrimSpace(answer))
	if err != nil {
		return ErrChallengeInvalid
	}
	decoded, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(token))
	if err != nil {
		return ErrChallengeInvalid
	}
	parts := strings.Split(string(decoded), ":")
	if len(parts) != 3 {
		return ErrChallengeInvalid
	}
	nonce := parts[0]
	exp, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return ErrChallengeInvalid
	}
	sig := parts[2]

	now := time.Now().Unix()
	if now > exp {
		return ErrChallengeInvalid
	}

	expectedSig := cm.sign(fmt.Sprintf("%s:%d:%d", nonce, exp, ansInt))
	if !hmac.Equal([]byte(sig), []byte(expectedSig)) {
		return ErrChallengeInvalid
	}

	cm.mu.Lock()
	defer cm.mu.Unlock()
	// Clean expired nonces
	for k, v := range cm.used {
		if v < now {
			delete(cm.used, k)
		}
	}
	if _, alreadyUsed := cm.used[nonce]; alreadyUsed {
		return ErrChallengeInvalid
	}
	cm.used[nonce] = exp
	return nil
}

func (cm *ChallengeManager) sign(data string) string {
	mac := hmac.New(sha256.New, cm.secret)
	mac.Write([]byte(data))
	return hex.EncodeToString(mac.Sum(nil))
}
