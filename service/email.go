package service

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
)

// EmailSendError 表示发送邮件时遇到的错误。SafeMessage 用于返回给前端的友好提示。
type EmailSendError struct {
	Safe string
	Err  error
}

func (e EmailSendError) Error() string {
	if e.Err == nil {
		return e.Safe
	}
	return fmt.Sprintf("%s: %v", e.Safe, e.Err)
}

func (e EmailSendError) SafeMessage() string {
	return e.Safe
}

// smtpDialer 抽象 SMTP 连接，方便测试时替换。
var smtpDialer = func(host string, secure bool) (net.Conn, error) {
	if secure {
		return tls.Dial("tcp", host, &tls.Config{ServerName: strings.Split(host, ":")[0]})
	}
	return net.Dial("tcp", host)
}

// SendEmail 发送一封简单文本邮件。SMTP 端口为 465（隐式 TLS）时走 SMTPS，
// 587/25 等明文端口走 SMTP+STARTTLS，便于兼容 163/QQ/企业邮箱。
func SendEmail(to string, subject string, body string) error {
	cfg := config.Cfg
	host := strings.TrimSpace(cfg.SMTPHost)
	user := strings.TrimSpace(cfg.SMTPUser)
	pass := cfg.SMTPPass
	if host == "" || user == "" || pass == "" {
		return EmailSendError{Safe: "邮件服务未配置，请联系管理员"}
	}
	addr := fmt.Sprintf("%s:%d", host, cfg.SMTPPort)
	auth := smtp.PlainAuth("", user, pass, host)
	from := fmt.Sprintf("%s <%s>", strings.TrimSpace(cfg.SMTPFromName), user)
	msg := buildEmailMessage(from, to, subject, body)

	if cfg.SMTPSecure {
		return sendMailImplicitTLS(addr, host, auth, user, to, msg)
	}
	return smtp.SendMail(addr, auth, user, []string{to}, []byte(msg))
}

func sendMailImplicitTLS(addr, host string, auth smtp.Auth, user, to string, msg string) error {
	conn, err := smtpDialer(addr, true)
	if err != nil {
		return EmailSendError{Safe: "邮件服务连接失败", Err: err}
	}
	c, err := smtp.NewClient(conn, host)
	if err != nil {
		return EmailSendError{Safe: "邮件服务握手失败", Err: err}
	}
	defer c.Close()
	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(&tls.Config{ServerName: host}); err != nil {
			return EmailSendError{Safe: "邮件服务加密失败", Err: err}
		}
	}
	if err := c.Auth(auth); err != nil {
		return EmailSendError{Safe: "邮件服务认证失败", Err: err}
	}
	if err := c.Mail(user); err != nil {
		return EmailSendError{Safe: "邮件发送失败", Err: err}
	}
	if err := c.Rcpt(to); err != nil {
		return EmailSendError{Safe: "收件人被拒绝", Err: err}
	}
	w, err := c.Data()
	if err != nil {
		return EmailSendError{Safe: "邮件内容发送失败", Err: err}
	}
	if _, err := w.Write([]byte(msg)); err != nil {
		return EmailSendError{Safe: "邮件内容发送失败", Err: err}
	}
	if err := w.Close(); err != nil {
		return EmailSendError{Safe: "邮件内容发送失败", Err: err}
	}
	return c.Quit()
}

func buildEmailMessage(from, to, subject, body string) string {
	var b strings.Builder
	b.WriteString("From: " + from + "\r\n")
	b.WriteString("To: <" + to + ">\r\n")
	b.WriteString("Subject: " + subject + "\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	b.WriteString("Content-Transfer-Encoding: 8bit\r\n")
	b.WriteString("Date: " + time.Now().Format(time.RFC1123Z) + "\r\n")
	b.WriteString("\r\n")
	b.WriteString(body)
	return b.String()
}

