package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"creator/server/internal/api"
	"creator/server/internal/auth"
	"creator/server/internal/config"
	"creator/server/internal/legacy"
	"creator/server/internal/store"
)

const Version = "6.0.0"

func main() {
	if len(os.Args) < 2 {
		runServe()
		return
	}

	switch os.Args[1] {
	case "--version", "-v", "version":
		fmt.Printf("creator v%s\n", Version)
	case "serve":
		runServe()
	case "invite":
		runInvite(os.Args[2:])
	case "user":
		runUser(os.Args[2:])
	case "legacy":
		runLegacy(os.Args[2:])
	case "backup":
		runBackup(os.Args[2:])
	default:
		fmt.Fprintf(os.Stderr, "Usage: creator [serve | invite | user | legacy | backup | version]\n")
		os.Exit(1)
	}
}

func runServe() {
	cfg := config.Load()
	st, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("[FATAL] open store (%s): %v", cfg.DBPath, err)
	}
	defer st.Close()

	if err := os.MkdirAll(cfg.AvatarDir, 0o750); err != nil {
		log.Fatalf("[FATAL] create avatar dir (%s): %v", cfg.AvatarDir, err)
	}

	handler := api.NewServer(cfg, st)
	srv := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("[creator v%s] listening on http://%s (register_mode=%s, db=%s, static=%v)",
			Version, cfg.ListenAddr, cfg.RegisterMode, cfg.DBPath, cfg.ServeStatic)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[FATAL] http server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	log.Println("[creator] gracefully stopped.")
}

func runInvite(args []string) {
	if len(args) == 0 || args[0] != "create" {
		fmt.Fprintln(os.Stderr, "Usage: creator invite create [-n count] [-u max_uses]")
		os.Exit(1)
	}
	fs := flag.NewFlagSet("invite create", flag.ExitOnError)
	n := fs.Int("n", 5, "Number of invite codes to generate")
	u := fs.Int("u", 1, "Max uses per invite code")
	_ = fs.Parse(args[1:])

	cfg := config.Load()
	st, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer st.Close()

	codes, err := st.CreateInvites(context.Background(), *n, *u)
	if err != nil {
		log.Fatalf("create invites: %v", err)
	}
	for _, c := range codes {
		fmt.Println(c)
	}
}

func runUser(args []string) {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "Usage: creator user [list | create | reset-password | set-admin | disable | enable]")
		os.Exit(1)
	}
	cfg := config.Load()
	st, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer st.Close()

	ctx := context.Background()
	sub := args[0]
	switch sub {
	case "list":
		users, err := st.ListUsers(ctx)
		if err != nil {
			log.Fatalf("list users: %v", err)
		}
		fmt.Printf("%-4s %-28s %-16s %-7s %-8s\n", "ID", "EMAIL", "NICKNAME", "ADMIN", "DISABLED")
		for _, u := range users {
			fmt.Printf("%-4d %-28s %-16s %-7v %-8v\n", u.ID, u.Email, u.Nickname, u.IsAdmin, u.IsDisabled)
		}

	case "create":
		fs := flag.NewFlagSet("user create", flag.ExitOnError)
		email := fs.String("email", "", "User email")
		pass := fs.String("password", "", "User password (8+ chars, letters & digits)")
		_ = fs.Parse(args[1:])
		if *email == "" || *pass == "" {
			log.Fatalf("--email and --password are required")
		}
		hash, err := auth.HashPassword(*pass)
		if err != nil {
			log.Fatalf("invalid password: %v", err)
		}
		u, err := st.CreateUser(ctx, *email, hash, "", false)
		if err != nil {
			log.Fatalf("create user: %v", err)
		}
		fmt.Printf("Created user #%d (%s)\n", u.ID, u.Email)

	case "reset-password":
		fs := flag.NewFlagSet("user reset-password", flag.ExitOnError)
		email := fs.String("email", "", "User email")
		pass := fs.String("password", "", "New password")
		_ = fs.Parse(args[1:])
		if *email == "" || *pass == "" {
			log.Fatalf("--email and --password are required")
		}
		hash, err := auth.HashPassword(*pass)
		if err != nil {
			log.Fatalf("invalid password: %v", err)
		}
		if err := st.UpdatePassword(ctx, *email, hash); err != nil {
			log.Fatalf("reset password: %v", err)
		}
		fmt.Printf("Password updated for %s\n", *email)

	case "disable", "enable":
		fs := flag.NewFlagSet("user "+sub, flag.ExitOnError)
		email := fs.String("email", "", "User email")
		_ = fs.Parse(args[1:])
		if *email == "" {
			log.Fatalf("--email is required")
		}
		dis := sub == "disable"
		if err := st.SetUserDisabled(ctx, *email, dis); err != nil {
			log.Fatalf("%s user: %v", sub, err)
		}
		fmt.Printf("User %s disabled=%v\n", *email, dis)

	case "set-admin":
		fs := flag.NewFlagSet("user set-admin", flag.ExitOnError)
		email := fs.String("email", "", "User email")
		admin := fs.Bool("admin", true, "Admin status (true or false)")
		_ = fs.Parse(args[1:])
		if *email == "" {
			log.Fatalf("--email is required")
		}
		if err := st.SetUserAdmin(ctx, *email, *admin); err != nil {
			log.Fatalf("set admin failed: %v", err)
		}
		fmt.Printf("Updated admin status for %s to %v\n", *email, *admin)

	default:
		log.Fatalf("unknown user subcommand: %s", sub)
	}
}

func runLegacy(args []string) {
	if len(args) == 0 || args[0] != "import" {
		fmt.Fprintln(os.Stderr, "Usage: creator legacy import --dir <export_dir> --email <email> [--password <init_pass>]")
		os.Exit(1)
	}
	fs := flag.NewFlagSet("legacy import", flag.ExitOnError)
	dir := fs.String("dir", "", "Path to legacy-export directory")
	email := fs.String("email", "", "Target user email")
	pass := fs.String("password", "Creator123456", "Initial password if user does not exist")
	_ = fs.Parse(args[1:])

	if *dir == "" || *email == "" {
		log.Fatalf("--dir and --email are required")
	}

	cfg := config.Load()
	st, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer st.Close()

	res, err := legacy.ImportIntoStore(context.Background(), st, legacy.ImportOptions{
		ExportDir:     *dir,
		Email:         *email,
		PasswordIfNew: *pass,
		AvatarDestDir: cfg.AvatarDir,
	})
	if err != nil {
		log.Fatalf("legacy import failed: %v", err)
	}
	fmt.Printf("✅ Legacy import completed for %s (user #%d, created=%v)\n", res.Email, res.UserID, res.CreatedUser)
	fmt.Printf("   Doc rev=%d | Worlds=%d Orgs=%d Chars=%d | Shares=%d | Avatar=%s\n",
		res.DocRev, res.WorldCount, res.OrgCount, res.CharCount, res.SharesImport, res.AvatarURL)
}

func runBackup(args []string) {
	fs := flag.NewFlagSet("backup", flag.ExitOnError)
	outDir := fs.String("out", "/data/creator/data/backups", "Output directory for backup archives")
	days := fs.Int("keep-days", 14, "Retention days")
	_ = fs.Parse(args)

	cfg := config.Load()
	st, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer st.Close()

	archive, err := st.BackupToArchive(context.Background(), cfg.AvatarDir, *outDir, *days)
	if err != nil {
		log.Fatalf("backup failed: %v", err)
	}
	fmt.Printf("✅ Backup archive created: %s\n", archive)
}
