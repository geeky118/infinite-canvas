package model

type RedemptionCodeType string

const (
	RedemptionCodeTypeCredits      RedemptionCodeType = "credits"
	RedemptionCodeTypeSubscription RedemptionCodeType = "subscription"
)

// SubscriptionPlan 管理端可配置的订阅卡方案。
type SubscriptionPlan struct {
	ID           string `json:"id" gorm:"primaryKey"`
	Name         string `json:"name"`
	Description  string `json:"description" gorm:"type:text"`
	DurationDays int    `json:"durationDays"`
	Enabled      bool   `json:"enabled"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

type SubscriptionPlanList struct {
	Items []SubscriptionPlan `json:"items"`
	Total int                `json:"total"`
}

// RedemptionCode 后台生成、用户兑换的一次性兑换码。
type RedemptionCode struct {
	ID                       string             `json:"id" gorm:"primaryKey"`
	Code                     string             `json:"code" gorm:"uniqueIndex"`
	BatchID                  string             `json:"batchId" gorm:"index"`
	Type                     RedemptionCodeType `json:"type" gorm:"index"`
	Credits                  int                `json:"credits"`
	SubscriptionID           string             `json:"subscriptionId"`
	SubscriptionName         string             `json:"subscriptionName"`
	SubscriptionDurationDays int                `json:"subscriptionDurationDays"`
	Used                     bool               `json:"used" gorm:"index"`
	UsedBy                   string             `json:"usedBy" gorm:"index"`
	UsedAt                   string             `json:"usedAt"`
	CreatedAt                string             `json:"createdAt"`
	UpdatedAt                string             `json:"updatedAt"`
}

type RedemptionCodeList struct {
	Items []RedemptionCode `json:"items"`
	Total int              `json:"total"`
}

// DailyRewardClaim 记录用户每日领取，用户和日期组合唯一。
type DailyRewardClaim struct {
	ID        string `json:"id" gorm:"primaryKey"`
	UserID    string `json:"userId" gorm:"uniqueIndex:idx_daily_reward_user_date"`
	Date      string `json:"date" gorm:"uniqueIndex:idx_daily_reward_user_date;size:10"`
	Credits   int    `json:"credits"`
	CreatedAt string `json:"createdAt"`
}

type MarketingStatus struct {
	User                  AuthUser               `json:"user"`
	Marketing             PublicMarketingSetting `json:"marketing"`
	DailyDate             string                 `json:"dailyDate"`
	DailyClaimed          bool                   `json:"dailyClaimed"`
	SubscriptionID        string                 `json:"subscriptionId"`
	SubscriptionName      string                 `json:"subscriptionName"`
	SubscriptionExpireAt string                `json:"subscriptionExpireAt"`
}

type MarketingRedeemResult struct {
	User           AuthUser       `json:"user"`
	RedemptionCode RedemptionCode `json:"redemptionCode"`
	Message        string         `json:"message"`
}
