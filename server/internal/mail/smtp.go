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

	subject := "Subject: 设定创作器 v6 - 密码重置验证码\r\n"
	mime := "MIME-version: 1.0;\nContent-Type: text/plain; charset=\"UTF-8\";\r\n\r\n"
	body := fmt.Sprintf("您好，\n\n您的密码重置令牌为：%s\n（15 分钟内有效，如非本人操作请忽略本邮件。）\n", rawToken)
	msg := []byte(subject + mime + body)

	return smtp.SendMail(addr, auth, s.cfg.SMTPFrom, []string{toEmail}, msg)
}
