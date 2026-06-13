package model

import (
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

type UserRole string

const (
	UserRoleGuest UserRole = "guest"
	UserRoleUser  UserRole = "user"
	UserRoleAdmin UserRole = "admin"
)

type UserStatus string

const (
	UserStatusActive UserStatus = "active"
	UserStatusBan    UserStatus = "ban"
)

type LargeText string

func (LargeText) GormDataType() string {
	return "text"
}

func (LargeText) GormDBDataType(db *gorm.DB, _ *schema.Field) string {
	if db.Dialector.Name() == "mysql" {
		return "longtext"
	}
	return "text"
}

// User 系统用户。
type User struct {
	ID                   string     `json:"id" gorm:"primaryKey"`
	Username             string     `json:"username" gorm:"uniqueIndex"`
	Password             string     `json:"password,omitempty"`
	Email                string     `json:"email"`
	DisplayName          string     `json:"displayName"`
	AvatarURL            string     `json:"avatarUrl"`
	Role                 UserRole   `json:"role"`
	Credits              int        `json:"credits"`
	SubscriptionID       string     `json:"subscriptionId"`
	SubscriptionName     string     `json:"subscriptionName"`
	SubscriptionExpireAt string     `json:"subscriptionExpireAt"`
	AffCode              string     `json:"affCode" gorm:"uniqueIndex"`
	AffCount             int        `json:"affCount"`
	InviterID            string     `json:"inviterId"`
	GithubID             string     `json:"githubId"`
	LinuxDoID            string     `json:"linuxDoId" gorm:"index"`
	WechatID             string     `json:"wechatId"`
	Status               UserStatus `json:"status"`
	LastLoginAt          string     `json:"lastLoginAt"`
	Extra                string     `json:"extra" gorm:"type:text"`
	CreatedAt            string     `json:"createdAt"`
	UpdatedAt            string     `json:"updatedAt"`
}

// UserList 用户分页结果。
type UserList struct {
	Items []User `json:"items"`
	Total int    `json:"total"`
}

// AuthUser 用户公开信息。
type AuthUser struct {
	ID                   string   `json:"id"`
	Username             string   `json:"username"`
	DisplayName          string   `json:"displayName"`
	AvatarURL            string   `json:"avatarUrl"`
	Role                 UserRole `json:"role"`
	Credits              int      `json:"credits"`
	SubscriptionID       string   `json:"subscriptionId"`
	SubscriptionName     string   `json:"subscriptionName"`
	SubscriptionExpireAt string   `json:"subscriptionExpireAt"`
	CreatedAt            string   `json:"createdAt"`
	UpdatedAt            string   `json:"updatedAt"`
}

// AuthSession 登录会话信息。
type AuthSession struct {
	Token string   `json:"token"`
	User  AuthUser `json:"user"`
}

func PublicUser(user User) AuthUser {
	return AuthUser{
		ID:                   user.ID,
		Username:             user.Username,
		DisplayName:          user.DisplayName,
		AvatarURL:            user.AvatarURL,
		Role:                 user.Role,
		Credits:              user.Credits,
		SubscriptionID:       user.SubscriptionID,
		SubscriptionName:     user.SubscriptionName,
		SubscriptionExpireAt: user.SubscriptionExpireAt,
		CreatedAt:            user.CreatedAt,
		UpdatedAt:            user.UpdatedAt,
	}
}

type CreditLogType string

const (
	CreditLogTypeAdminAdjust CreditLogType = "admin_adjust"
	CreditLogTypeAIConsume   CreditLogType = "ai_consume"
	CreditLogTypeAIRefund    CreditLogType = "ai_refund"
	CreditLogTypeRegister    CreditLogType = "register_reward"
	CreditLogTypeDailyReward CreditLogType = "daily_reward"
	CreditLogTypeRedeemCode  CreditLogType = "redeem_code"
)

// CreditLog 用户算力点变更流水。
type CreditLog struct {
	ID        string        `json:"id" gorm:"primaryKey"`
	UserID    string        `json:"userId" gorm:"index"`
	UserEmail string        `json:"userEmail" gorm:"-"`
	Type      CreditLogType `json:"type"`
	Amount    int           `json:"amount"`
	Balance   int           `json:"balance"`
	RelatedID string        `json:"relatedId"`
	Remark    string        `json:"remark"`
	Extra     string        `json:"extra" gorm:"type:text"`
	CreatedAt string        `json:"createdAt"`
}

type CreditLogList struct {
	Items []CreditLog `json:"items"`
	Total int         `json:"total"`
}

// UserData 保存登录用户的跨设备配置和业务数据。
type UserData struct {
	ID        string `json:"id" gorm:"primaryKey"`
	UserID    string `json:"userId" gorm:"uniqueIndex:idx_user_data_domain"`
	Domain    string `json:"domain" gorm:"uniqueIndex:idx_user_data_domain;size:64"`
	Payload   LargeText `json:"payload"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}
