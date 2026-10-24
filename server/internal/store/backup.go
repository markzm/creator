package store

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// BackupToArchive creates an atomic online snapshot of the SQLite database using `VACUUM INTO`,
// bundles it together with the avatars directory into a .tar.gz file in outDir,
// and prunes backup archives older than retentionDays.
func (s *Store) BackupToArchive(ctx context.Context, avatarDir, outDir string, retentionDays int) (string, error) {
	if retentionDays <= 0 {
		retentionDays = 14
	}
	if err := os.MkdirAll(outDir, 0o750); err != nil {
		return "", fmt.Errorf("create backup dir: %w", err)
	}

	ts := time.Now().Format("20060102-150405")
	tmpDBPath := filepath.Join(outDir, fmt.Sprintf(".tmp-app-%s.db", ts))
	defer func() { _ = os.Remove(tmpDBPath) }()

	escapedPath := strings.ReplaceAll(tmpDBPath, "'", "''")
	if _, err := s.WriteDB.ExecContext(ctx, fmt.Sprintf("VACUUM INTO '%s';", escapedPath)); err != nil {
		return "", fmt.Errorf("sqlite VACUUM INTO failed: %w", err)
	}

	archivePath := filepath.Join(outDir, fmt.Sprintf("creator-backup-%s.tar.gz", ts))
	outFile, err := os.OpenFile(archivePath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o640)
	if err != nil {
		return "", fmt.Errorf("create archive file: %w", err)
	}
	defer outFile.Close()

	gw := gzip.NewWriter(outFile)
	defer gw.Close()
	tw := tar.NewWriter(gw)
	defer tw.Close()

	if err := addFileToTar(tw, tmpDBPath, "app.db"); err != nil {
		return "", fmt.Errorf("pack app.db: %w", err)
	}

	if avatarDir != "" {
		if info, err := os.Stat(avatarDir); err == nil && info.IsDir() {
			entries, _ := os.ReadDir(avatarDir)
			for _, entry := range entries {
				if !entry.IsDir() {
					full := filepath.Join(avatarDir, entry.Name())
					_ = addFileToTar(tw, full, filepath.Join("avatars", entry.Name()))
				}
			}
		}
	}

	// Prune backups older than retentionDays
	cutoff := time.Now().Add(-time.Duration(retentionDays) * 24 * time.Hour)
	if entries, err := os.ReadDir(outDir); err == nil {
		for _, e := range entries {
			if !e.IsDir() && strings.HasPrefix(e.Name(), "creator-backup-") && strings.HasSuffix(e.Name(), ".tar.gz") {
				if fi, err := e.Info(); err == nil && fi.ModTime().Before(cutoff) {
					_ = os.Remove(filepath.Join(outDir, e.Name()))
				}
			}
		}
	}

	return archivePath, nil
}

func addFileToTar(tw *tar.Writer, srcPath, tarName string) error {
	f, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		return err
	}

	hdr, err := tar.FileInfoHeader(fi, "")
	if err != nil {
		return err
	}
	hdr.Name = tarName

	if err := tw.WriteHeader(hdr); err != nil {
		return err
	}
	_, err = io.Copy(tw, f)
	return err
}
