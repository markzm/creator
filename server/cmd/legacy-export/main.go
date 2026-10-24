package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"syscall"
	"time"

	"creator/server/internal/legacy"
	"golang.org/x/term"
)

func main() {
	var (
		endpoint = flag.String("endpoint", legacy.DefaultEndpoint, "Legacy WorkBuddy cloud endpoint")
		pubKey   = flag.String("key", legacy.DefaultPublishableKey, "Legacy WorkBuddy publishable key")
		username = flag.String("phone", "", "Phone number (11 digits) or email address")
		outDir   = flag.String("out", "", "Output directory (default: ./legacy-export-YYYYMMDD-HHMMSS)")
	)
	flag.Parse()

	fmt.Println("====================================================")
	fmt.Println("  设定创作器 v5.4 -> v6 旧云端数据只读导出工具 (T01)")
	fmt.Println("====================================================")

	reader := bufio.NewReader(os.Stdin)
	user := strings.TrimSpace(*username)
	if user == "" {
		fmt.Print("请输入登录手机号（11位）或账号: ")
		line, err := reader.ReadString('\n')
		if err != nil {
			fmt.Fprintf(os.Stderr, "\n[错误] 读取账号输入失败: %v\n", err)
			os.Exit(1)
		}
		user = strings.TrimSpace(line)
	}
	if user == "" {
		fmt.Fprintln(os.Stderr, "[错误] 手机号/账号不能为空")
		os.Exit(1)
	}

	fmt.Print("请输入登录密码（输入不回显、不落盘）: ")
	var passBytes []byte
	var err error
	if term.IsTerminal(int(syscall.Stdin)) {
		passBytes, err = term.ReadPassword(int(syscall.Stdin))
		fmt.Println()
	} else {
		// Fallback for non-TTY automated testing pipes
		line, rErr := reader.ReadString('\n')
		err = rErr
		passBytes = []byte(strings.TrimRight(line, "\r\n"))
		fmt.Println()
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "[错误] 读取密码失败: %v\n", err)
		os.Exit(1)
	}
	password := string(passBytes)
	// Wipe password bytes slice immediately after string conversion
	for i := range passBytes {
		passBytes[i] = 0
	}
	if password == "" {
		fmt.Fprintln(os.Stderr, "[错误] 密码不能为空")
		os.Exit(1)
	}

	targetDir := *outDir
	if targetDir == "" {
		targetDir = fmt.Sprintf("legacy-export-%s", time.Now().Format("20060102-150405"))
	}

	fmt.Printf("\n[1/3] 正在登录 %s (账号: %s)...\n", *endpoint, legacy.NormalizeUsername(user))
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	manifest, err := legacy.RunExport(ctx, legacy.ExportConfig{
		Endpoint:       *endpoint,
		PublishableKey: *pubKey,
		Username:       user,
		Password:       password,
		OutDir:         targetDir,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "\n❌ 导出失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("[2/3] 云端数据与签名头像拉取完成！")
	fmt.Println("[3/3] 导出摘要 (manifest.json):")
	fmt.Printf("  - 输出目录   : %s\n", targetDir)
	fmt.Printf("  - 用户 UID   : %s (%s)\n", manifest.UserID, manifest.UserName)
	fmt.Printf("  - 整库同步   : %v (更新时间: %s)\n", manifest.HasSyncDoc, manifest.SyncUpdated)
	fmt.Printf("  - 实体统计   : 世界观 %d | 组织 %d | 角色 %d | 模板 %d\n",
		manifest.WorldCount, manifest.OrgCount, manifest.CharCount, manifest.TemplateCnt)
	fmt.Printf("  - 派生模块   : 时间线 %d | 剧情卷 %d | 场景 %d | 术语 %d\n",
		manifest.TimelineCnt, manifest.PlotVolCnt, manifest.SceneCnt, manifest.GlossaryCnt)
	fmt.Printf("  - 大厅分享   : 我的分享 %d 条 (全站共 %d 条)\n", manifest.MyShareCount, manifest.AllShareCnt)
	if manifest.AvatarFile != "" {
		fmt.Printf("  - 头像文件   : %s\n", manifest.AvatarFile)
	} else if manifest.AvatarRaw != "" {
		fmt.Printf("  - 头像 Emoji : %s\n", manifest.AvatarRaw)
	}
	fmt.Printf("\n✅ 导出成功！可直接将 %s/db.json 用于旧版「恢复备份」或新版 `creator legacy import`。\n", targetDir)
}
