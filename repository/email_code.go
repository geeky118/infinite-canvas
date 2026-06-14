package repository

import (
	"errors"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

// CreateEmailCode 写入一条新验证码。
func CreateEmailCode(code model.EmailVerificationCode) (model.EmailVerificationCode, error) {
	db, err := DB()
	if err != nil {
		return code, err
	}
	if code.ID == "" {
		code.ID = "emailcode-" + time.Now().Format("20060102150405.000000000")
	}
	return code, db.Create(&code).Error
}

// LatestEmailCode 取某个邮箱+用途的最近一条验证码。
func LatestEmailCode(email string, purpose string) (model.EmailVerificationCode, bool, error) {
	db, err := DB()
	if err != nil {
		return model.EmailVerificationCode{}, false, err
	}
	code := model.EmailVerificationCode{}
	err = db.Where("email = ? AND purpose = ?", email, purpose).Order("created_at desc").First(&code).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.EmailVerificationCode{}, false, nil
	}
	return code, err == nil, err
}

// CountEmailCodesSince 统计某个邮箱+用途在 since 时间点之后生成的验证码数量。
func CountEmailCodesSince(email string, purpose string, since string) (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	var total int64
	err = db.Model(&model.EmailVerificationCode{}).Where("email = ? AND purpose = ? AND created_at >= ?", email, purpose, since).Count(&total).Error
	return total, err
}

// MarkEmailCodeUsed 把指定 ID 的验证码标记为已使用。
func MarkEmailCodeUsed(id string, usedAt string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Model(&model.EmailVerificationCode{}).Where("id = ?", id).Update("used_at", usedAt).Error
}

// FindActiveEmailCode 查找某个邮箱+用途下、未过期、未使用的最新一条验证码。
func FindActiveEmailCode(email string, purpose string, code string, now string) (model.EmailVerificationCode, bool, error) {
	db, err := DB()
	if err != nil {
		return model.EmailVerificationCode{}, false, err
	}
	row := model.EmailVerificationCode{}
	err = db.Where("email = ? AND purpose = ? AND code = ? AND used_at = ? AND expires_at > ?", email, purpose, code, "", now).Order("created_at desc").First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.EmailVerificationCode{}, false, nil
	}
	return row, err == nil, err
}
