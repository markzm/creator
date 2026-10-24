package auth

import (
	"strings"
	"sync"
	"time"
)

type bucket struct {
	count   int
	resetAt time.Time
}

type accountLock struct {
	failures    int
	firstFailAt time.Time
	lockedUntil time.Time
}

// Guard provides dual-dimension rate limiting (IP + Email) and brute-force account lockout.
type Guard struct {
	mu          sync.Mutex
	ipLogin     map[string]*bucket
	ipRegister  map[string]*bucket
	emailLocks  map[string]*accountLock
}

func NewGuard() *Guard {
	return &Guard{
		ipLogin:    make(map[string]*bucket),
		ipRegister: make(map[string]*bucket),
		emailLocks: make(map[string]*accountLock),
	}
}

// AllowLogin checks IP rate limit (max 15/min) and whether the target email is currently locked out.
func (g *Guard) AllowLogin(ip, email string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()

	now := time.Now()
	if !allowBucket(g.ipLogin, ip, 15, time.Minute, now) {
		return false
	}

	key := strings.ToLower(strings.TrimSpace(email))
	if lock, ok := g.emailLocks[key]; ok {
		if now.Before(lock.lockedUntil) {
			return false
		}
	}
	return true
}

// RecordLoginFailure increments consecutive login failures for an email; 5 failures in 10 min locks for 15 min.
func (g *Guard) RecordLoginFailure(email string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	now := time.Now()
	key := strings.ToLower(strings.TrimSpace(email))
	lock, ok := g.emailLocks[key]
	if !ok || now.Sub(lock.firstFailAt) > 10*time.Minute {
		lock = &accountLock{
			failures:    1,
			firstFailAt: now,
		}
		g.emailLocks[key] = lock
		return
	}
	lock.failures++
	if lock.failures >= 5 {
		lock.lockedUntil = now.Add(15 * time.Minute)
	}
}

func (g *Guard) ClearLoginFailures(email string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	key := strings.ToLower(strings.TrimSpace(email))
	delete(g.emailLocks, key)
}

// AllowRegister limits new account creation to max 8 per hour per IP.
func (g *Guard) AllowRegister(ip string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return allowBucket(g.ipRegister, ip, 8, time.Hour, time.Now())
}

func allowBucket(m map[string]*bucket, key string, limit int, window time.Duration, now time.Time) bool {
	b, ok := m[key]
	if !ok || now.After(b.resetAt) {
		m[key] = &bucket{
			count:   1,
			resetAt: now.Add(window),
		}
		return true
	}
	if b.count >= limit {
		return false
	}
	b.count++
	return true
}
