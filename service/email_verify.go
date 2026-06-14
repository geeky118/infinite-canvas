package service

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"regexp"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

// EmailCodeSendResult 返回给前端的验证码发送结果。
type EmailCodeSendResult struct {
	TTLSeconds   int `json:"ttlSeconds"`
	Cooldown     int `json:"cooldownSeconds"`
	MaxPerHour   int `json:"maxPerHour"`
	EmailDomain  string `json:"emailDomain"`
}

// emailPattern 与 SendEmailCode 共用的邮箱校验正则。
var emailPattern = regexp.MustCompile(`^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$`)

// NormalizeEmail 把邮箱规范成小写并去除首尾空格。
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// IsAllowedRegisterEmail 校验邮箱是否符合当前允许注册的域名。
func IsAllowedRegisterEmail(email string) (string, bool) {
	email = NormalizeEmail(email)
	if !emailPattern.MatchString(email) {
		return "", false
	}
	at := strings.LastIndex(email, "@")
	if at <= 0 || at == len(email)-1 {
		return "", false
	}
	domain := email[at+1:]
	want := strings.ToLower(strings.TrimSpace(config.Cfg.RegisterEmailDomain))
	if want == "" {
		want = "qq.com"
	}
	return domain, domain == want
}

// SendEmailCode 生成、存储并发送一封注册验证码邮件。
func SendEmailCode(email string) (EmailCodeSendResult, error) {
	result := EmailCodeSendResult{
		TTLSeconds:  config.Cfg.EmailCodeTTL,
		Cooldown:    config.Cfg.EmailCodeCooldown,
		MaxPerHour:  config.Cfg.EmailCodeMaxPerHour,
		EmailDomain: strings.ToLower(strings.TrimSpace(config.Cfg.RegisterEmailDomain)),
	}
	if result.TTLSeconds <= 0 {
		result.TTLSeconds = 600
	}
	if result.Cooldown < 0 {
		result.Cooldown = 0
	}
	if result.MaxPerHour < 0 {
		result.MaxPerHour = 0
	}
	if strings.TrimSpace(config.Cfg.SMTPHost) == "" || strings.TrimSpace(config.Cfg.SMTPUser) == "" || config.Cfg.SMTPPass == "" {
		return result, safeMessageError{message: "邮件服务未配置，请联系管理员"}
	}
	if _, ok := IsAllowedRegisterEmail(email); !ok {
		return result, safeMessageError{message: "仅支持 @" + result.EmailDomain + " 邮箱注册"}
	}
	email = NormalizeEmail(email)

	nowTime := time.Now()
	hourSince := nowTime.Add(-time.Hour).UTC().Format(time.RFC3339)

	if result.Cooldown > 0 {
		latest, ok, err := repository.LatestEmailCode(email, model.EmailVerificationPurposeRegister)
		if err != nil {
			return result, err
		}
		if ok {
			last, perr := time.Parse(time.RFC3339, latest.CreatedAt)
			if perr == nil {
				diff := nowTime.Sub(last)
				if diff < time.Duration(result.Cooldown)*time.Second {
					cooldown := time.Duration(result.Cooldown) * time.Second
					remain := int(cooldown.Seconds() - diff.Seconds())
					if remain < 1 {
						remain = 1
					}
					return result, safeMessageError{message: fmt.Sprintf("发送太频繁，请 %d 秒后再试", remain)}
				}
			}
		}
	}
	if result.MaxPerHour > 0 {
		count, err := repository.CountEmailCodesSince(email, model.EmailVerificationPurposeRegister, hourSince)
		if err != nil {
			return result, err
		}
		if int(count) >= result.MaxPerHour {
			return result, safeMessageError{message: "验证码发送过于频繁，请稍后再试"}
		}
	}

	code, err := generateEmailCode(config.Cfg.EmailCodeLength)
	if err != nil {
		return result, err
	}
	expiresAt := nowTime.Add(time.Duration(result.TTLSeconds) * time.Second).UTC().Format(time.RFC3339)
	createdAt := now()
	stored, err := repository.CreateEmailCode(model.EmailVerificationCode{
		ID:        newID("emailcode"),
		Email:     email,
		Code:      code,
		Purpose:   model.EmailVerificationPurposeRegister,
		ExpiresAt: expiresAt,
		CreatedAt: createdAt,
	})
	if err != nil {
		return result, err
	}
	if err := SendEmail(email, "【无限画布】注册验证码", buildEmailCodeBody(code, result.TTLSeconds)); err != nil {
		return result, err
	}
	_ = stored
	return result, nil
}

// buildEmailCodeBody 拼接验证码邮件正文。
func buildEmailCodeBody(code string, ttlSeconds int) string {
	minutes := ttlSeconds / 60
	if minutes < 1 {
		minutes = 1
	}
	return fmt.Sprintf("您好：\n\n您正在注册无限画布账号，验证码为 %s。\n验证码 %d 分钟内有效，请勿泄露给他人。\n如果不是您本人操作，请忽略此邮件。\n\n—— 无限画布", code, minutes)
}

// generateEmailCode 产生指定长度的数字验证码。
func generateEmailCode(length int) (string, error) {
	if length <= 0 {
		length = 6
	}
	var b strings.Builder
	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		b.WriteString(fmt.Sprintf("%d", n.Int64()))
	}
	return b.String(), nil
}

// ConsumeEmailCode 校验并消费一条注册验证码，失败时返回 safeMessageError。
func ConsumeEmailCode(email string, code string) error {
	email = NormalizeEmail(email)
	code = strings.TrimSpace(code)
	if code == "" {
		return safeMessageError{message: "请输入邮箱验证码"}
	}
	nowTime := time.Now().UTC().Format(time.RFC3339)
	row, ok, err := repository.FindActiveEmailCode(email, model.EmailVerificationPurposeRegister, code, nowTime)
	if err != nil {
		return err
	}
	if !ok {
		return safeMessageError{message: "邮箱验证码错误或已过期"}
	}
	if err := repository.MarkEmailCodeUsed(row.ID, nowTime); err != nil {
		return err
	}
	return nil
}
