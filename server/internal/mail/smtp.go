package mail

import (
	"fmt"
	"net/smtp"

	"creator/server/internal/config"
)

type Sender struct {
	cfg *config.Config
}

func NewSender(cfg *config.Config) *Sender {
	return &Sender{cfg: cfg}
}

func (s *Sender) Enabled() bool {
	return s.cfg != nil && s.cfg.SMTPEnabled()
}

func (s *Sender) SendResetToken(toEmail, rawToken string) error {
	if !s.Enabled() {
		return fmt.Errorf("SMTP is not configured")
	}
	addr := fmt.Sprintf("%s:%d", s.cfg.SMTPHost, s.cfg.SMTPPort)
	auth := smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPass, s.cfg.SMTPHost)

	subject := "Subject: 设定创作器 - 密码重置\r\n"
	mime := "MIME-version: 1.0;\nContent-Type: text/plain; charset=\"UTF-8\";\r\n\r\n"
	link := ""
	if s.cfg.PublicURL != "" {
		link = fmt.Sprintf("\n点击链接直接重置：%s/reset?token=%s\n", s.cfg.PublicURL, rawToken)
	}
	body := fmt.Sprintf("您好，\n\n您的密码重置令牌为：%s\n%s（15 分钟内有效，如非本人操作请忽略本邮件。）\n", rawToken, link)
	msg := []byte(subject + mime + body)

	return smtp.SendMail(addr, auth, s.cfg.SMTPFrom, []string{toEmail}, msg)
}
