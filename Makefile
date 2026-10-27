.PHONY: all check-env setup extract test test-server test-web test-e2e build release clean backup-remote backup-status backup-info

all: test build

check-env:
	@echo "==> Checking toolchain..."
	@go version
	@node -v
	@npm -v
	@test -f legacy/index.html || (echo "Missing legacy/index.html" && exit 1)
	@echo "==> Environment OK"

setup:
	cd server && go mod tidy
	cd web && npm install

extract:
	node scripts/extract-legacy.mjs

test-server:
	cd server && go test ./...

test-web:
	cd web && npm run typecheck && npx vitest run

test: test-server test-web

test-e2e:
	cd web && npx playwright test

build:
	mkdir -p bin
	cd web && npm run build
	rm -rf server/internal/api/dist
	cp -r web/dist server/internal/api/dist
	cd server && CGO_ENABLED=0 go build -ldflags="-s -w" -o ../bin/creator ./cmd/creator
	cd server && CGO_ENABLED=0 go build -ldflags="-s -w" -o ../bin/legacy-export ./cmd/legacy-export

release: test build
	@echo "==> Release artifacts built in ./bin/ and ./web/dist/"

clean:
	rm -rf bin web/dist server/internal/api/dist

backup-remote:
	@./scripts/backup-remote.sh

backup-status:
	@./scripts/restore-from-backup.sh --list
	@echo ""
	@systemctl --user status creator-backup.timer --no-pager || true

backup-info:
	@./scripts/restore-from-backup.sh --info

