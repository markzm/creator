package store

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Store manages separated Write (MaxOpenConns=1) and Read (MaxOpenConns=8) SQLite connection pools
// in WAL mode to eliminate SQLITE_BUSY errors under concurrent access.
type Store struct {
	WriteDB *sql.DB
	ReadDB  *sql.DB
	dbPath  string
}

func Open(dbPath string) (*Store, error) {
	if dbPath != ":memory:" && !strings.HasPrefix(dbPath, "file:") {
		if err := os.MkdirAll(filepath.Dir(dbPath), 0o750); err != nil {
			return nil, fmt.Errorf("create db dir: %w", err)
		}
	}

	dsn := dbPath
	if !strings.Contains(dsn, "?") && dsn != ":memory:" {
		dsn = fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(ON)", dbPath)
	}

	writeDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open write db: %w", err)
	}
	writeDB.SetMaxOpenConns(1)
	writeDB.SetMaxIdleConns(1)
	writeDB.SetConnMaxLifetime(0)

	if err := initPragmas(writeDB); err != nil {
		_ = writeDB.Close()
		return nil, err
	}

	var readDB *sql.DB
	if dbPath == ":memory:" {
		readDB = writeDB
	} else {
		readDB, err = sql.Open("sqlite", dsn)
		if err != nil {
			_ = writeDB.Close()
			return nil, fmt.Errorf("open read db: %w", err)
		}
		readDB.SetMaxOpenConns(8)
		readDB.SetMaxIdleConns(4)
		readDB.SetConnMaxLifetime(30 * time.Minute)
		if err := initPragmas(readDB); err != nil {
			_ = readDB.Close()
			_ = writeDB.Close()
			return nil, err
		}
	}

	s := &Store{
		WriteDB: writeDB,
		ReadDB:  readDB,
		dbPath:  dbPath,
	}
	if err := s.Migrate(context.Background()); err != nil {
		_ = s.Close()
		return nil, err
	}
	return s, nil
}

func initPragmas(db *sql.DB) error {
	pragmas := []string{
		"PRAGMA journal_mode=WAL;",
		"PRAGMA synchronous=NORMAL;",
		"PRAGMA busy_timeout=5000;",
		"PRAGMA foreign_keys=ON;",
	}
	for _, p := range pragmas {
		if _, err := db.Exec(p); err != nil {
			return fmt.Errorf("exec %s: %w", p, err)
		}
	}
	return nil
}

func (s *Store) Migrate(ctx context.Context) error {
	if _, err := s.WriteDB.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		name TEXT PRIMARY KEY,
		applied_at INTEGER NOT NULL
	);`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		var count int
		if err := s.WriteDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM schema_migrations WHERE name = ?", name).Scan(&count); err == nil && count > 0 {
			continue
		}

		sqlBytes, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}

		// Split migration into individual statements to handle ALTER TABLE safely
		statements := strings.Split(string(sqlBytes), ";")
		for _, stmt := range statements {
			trimmed := strings.TrimSpace(stmt)
			if trimmed == "" {
				continue
			}
			if _, err := s.WriteDB.ExecContext(ctx, trimmed); err != nil {
				// If adding an existing column in SQLite, treat as benign
				if strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
					continue
				}
				return fmt.Errorf("apply migration %s stmt: %w", name, err)
			}
		}

		if _, err := s.WriteDB.ExecContext(ctx, "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)", name, time.Now().Unix()); err != nil {
			return fmt.Errorf("record migration %s: %w", name, err)
		}
	}
	return nil
}

func (s *Store) Close() error {
	if s.ReadDB != nil && s.ReadDB != s.WriteDB {
		_ = s.ReadDB.Close()
	}
	if s.WriteDB != nil {
		return s.WriteDB.Close()
	}
	return nil
}
